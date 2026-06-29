const TOMBA_BASE = "https://api.tomba.io/v1";
const TOMBA_TIMEOUT_MS = 15_000;

export interface TombaCredits {
  finder: { used: number; limit: number };
  verifier: { used: number; limit: number };
  plan?: string;
}

function tombaAuthHeaders(): Record<string, string> {
  return {
    "X-Tomba-Key": process.env.TOMBA_API_KEY!.trim(),
    "X-Tomba-Secret": process.env.TOMBA_API_SECRET!.trim(),
    Accept: "application/json",
  };
}

export function isTombaConfigured(): boolean {
  return !!(
    process.env.TOMBA_API_KEY?.trim() && process.env.TOMBA_API_SECRET?.trim()
  );
}

export function domainFromWebsite(website: string): string | null {
  if (!website?.trim()) return null;
  try {
    const host = new URL(
      website.startsWith("http") ? website : `https://${website}`
    ).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

interface TombaEmailRecord {
  value?: string;
  email?: string;
  address?: string;
}

interface TombaDomainSearchResponse {
  data?: {
    emails?: TombaEmailRecord[];
  };
  emails?: TombaEmailRecord[];
  message?: string;
  error?: string;
}

function parseTombaEmails(payload: TombaDomainSearchResponse): string[] {
  const raw =
    payload.data?.emails ?? payload.emails ?? ([] as TombaEmailRecord[]);
  const found = new Set<string>();

  for (const item of raw) {
    const candidate = item.value || item.email || item.address;
    if (!candidate || typeof candidate !== "string") continue;
    const email = candidate.trim().toLowerCase();
    if (email.includes("@") && email.length <= 254) {
      found.add(email);
    }
  }

  return Array.from(found).slice(0, 5);
}

interface TombaMeResponse {
  data?: {
    pricing?: {
      name?: string;
      available_searches?: number;
      available_verifications?: number;
    };
    requests?: {
      domains?: { used?: number; available?: number };
      verifications?: { used?: number; available?: number };
    };
  };
}

export async function getTombaCredits(): Promise<TombaCredits | null> {
  if (!isTombaConfigured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOMBA_TIMEOUT_MS);

  try {
    const res = await fetch(`${TOMBA_BASE}/me`, {
      signal: controller.signal,
      headers: tombaAuthHeaders(),
    });

    if (!res.ok) return null;

    const payload = (await res.json()) as TombaMeResponse;
    const data = payload.data;
    if (!data) return null;

    const finderUsed = data.requests?.domains?.used ?? 0;
    const finderRemaining = data.requests?.domains?.available ?? 0;
    const finderLimit =
      data.pricing?.available_searches ?? finderUsed + finderRemaining;

    const verifierUsed = data.requests?.verifications?.used ?? 0;
    const verifierRemaining = data.requests?.verifications?.available ?? 0;
    const verifierLimit =
      data.pricing?.available_verifications ?? verifierUsed + verifierRemaining;

    return {
      finder: { used: finderUsed, limit: finderLimit },
      verifier: { used: verifierUsed, limit: verifierLimit },
      plan: data.pricing?.name,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchDomainEmails(
  domain: string,
  company?: string
): Promise<{ emails: string[]; error?: string }> {
  if (!isTombaConfigured()) {
    return { emails: [], error: "Tomba not configured" };
  }

  const params = new URLSearchParams({ domain });
  const companyName = company?.trim();
  if (companyName && companyName.length >= 3) {
    params.set("company", companyName.slice(0, 75));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOMBA_TIMEOUT_MS);

  try {
    const res = await fetch(`${TOMBA_BASE}/domain-search?${params}`, {
      signal: controller.signal,
      headers: tombaAuthHeaders(),
    });

    const data = (await res.json().catch(() => ({}))) as TombaDomainSearchResponse;

    if (!res.ok) {
      const message =
        data.message || data.error || `Tomba API error (${res.status})`;
      return { emails: [], error: message };
    }

    return { emails: parseTombaEmails(data) };
  } catch (e) {
    const message =
      e instanceof Error && e.name === "AbortError"
        ? "Tomba request timed out"
        : e instanceof Error
          ? e.message
          : "Tomba request failed";
    return { emails: [], error: message };
  } finally {
    clearTimeout(timer);
  }
}
