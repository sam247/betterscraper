const LEADROCKS_BASE = "https://api.leadrocks.io/v1";
const LEADROCKS_TIMEOUT_MS = 20_000;
const VERIFY_RATE_MS = 200;

export type LeadRocksVerifyStatus =
  | "valid"
  | "not valid"
  | "catch-all"
  | "unknown"
  | "error";

export interface LeadRocksVerifyResult {
  email: string;
  status: LeadRocksVerifyStatus;
  safe_to_send?: string;
  error?: string;
}

export function isLeadRocksConfigured(): boolean {
  return !!process.env.LEADROCKS_API_TOKEN?.trim();
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: process.env.LEADROCKS_API_TOKEN!.trim(),
    Accept: "application/json",
  };
}

export async function getLeadRocksCredits(): Promise<number | null> {
  if (!isLeadRocksConfigured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEADROCKS_TIMEOUT_MS);

  try {
    const res = await fetch(`${LEADROCKS_BASE}/getcredits`, {
      signal: controller.signal,
      headers: authHeaders(),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.status === "failed") return null;
    const credits = payload.data?.credits;
    return typeof credits === "number" ? credits : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeStatus(raw: string | undefined): LeadRocksVerifyStatus {
  const s = (raw || "").toLowerCase().trim();
  if (s === "valid") return "valid";
  if (s === "not valid" || s === "invalid" || s === "not_valid") return "not valid";
  if (s === "catch-all" || s === "catch_all" || s === "catchall") return "catch-all";
  if (s === "unknown") return "unknown";
  return "error";
}

export async function verifyEmailInstant(
  email: string
): Promise<LeadRocksVerifyResult> {
  const address = email.trim().toLowerCase();
  if (!isLeadRocksConfigured()) {
    return { email: address, status: "error", error: "LeadRocks not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEADROCKS_TIMEOUT_MS);

  try {
    const res = await fetch(`${LEADROCKS_BASE}/verify-instant`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: address }),
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok || payload.status === "failed") {
      return {
        email: address,
        status: "error",
        error: payload.error?.message || `LeadRocks error (${res.status})`,
      };
    }

    return {
      email: address,
      status: normalizeStatus(payload.data?.status),
      safe_to_send: payload.data?.safe_to_send,
    };
  } catch (e) {
    return {
      email: address,
      status: "error",
      error:
        e instanceof Error && e.name === "AbortError"
          ? "Verification timed out"
          : e instanceof Error
            ? e.message
            : "Verification failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isDeliverableStatus(status: LeadRocksVerifyStatus): boolean {
  return status === "valid";
}

export async function verifyResultsWithLeadRocks<
  T extends { name: string; email?: string },
>(
  results: T[],
  options: {
    onProgress?: (message: string) => void;
    concurrency?: number;
    onlyValid?: boolean;
  } = {}
): Promise<T[]> {
  const { onProgress, concurrency = 3, onlyValid = true } = options;
  const withEmail = results.filter((r) => r.email?.trim());

  if (!isLeadRocksConfigured()) {
    onProgress?.("LeadRocks not configured — skipping verification.");
    return results;
  }

  if (withEmail.length === 0) {
    onProgress?.("No emails to verify.");
    return results;
  }

  onProgress?.(`Verifying ${withEmail.length} leads via LeadRocks…`);

  const enriched: T[] = new Array(results.length);
  let index = 0;
  let validCount = 0;
  let checked = 0;

  async function worker(): Promise<void> {
    while (index < results.length) {
      const i = index++;
      const row = results[i];
      const raw = row.email?.trim();
      if (!raw) {
        enriched[i] = { ...row, email: "" };
        continue;
      }

      const addresses = raw
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      const verified: string[] = [];
      const statuses: string[] = [];

      for (const address of addresses) {
        const result = await verifyEmailInstant(address);
        checked += 1;
        statuses.push(`${address}: ${result.status}`);
        if (isDeliverableStatus(result.status) || (!onlyValid && result.status !== "not valid")) {
          if (isDeliverableStatus(result.status)) {
            verified.push(address);
          }
        }
        await sleep(VERIFY_RATE_MS);
      }

      const email = onlyValid ? verified.join(", ") : raw;
      if (email) validCount += 1;

      onProgress?.(
        `[leadrocks] ${row.name}: ${statuses.join("; ") || "no email"}`
      );
      enriched[i] = { ...row, email };
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, results.length) },
    () => worker()
  );
  await Promise.all(workers);

  onProgress?.(
    `LeadRocks verification complete: ${validCount} leads with valid email (${checked} addresses checked).`
  );

  if (onlyValid) {
    return enriched.filter((r) => r.email?.trim());
  }

  return enriched;
}
