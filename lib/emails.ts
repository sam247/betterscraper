const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 512_000;
const CONTACT_PATHS = ["", "/contact", "/contact-us", "/about", "/about-us"];

const EMAIL_REGEX =
  /[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+/g;

const MAILTO_REGEX = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

const JUNK_EMAIL_PATTERNS = [
  /noreply/i,
  /no-reply/i,
  /donotreply/i,
  /example\.com$/i,
  /wixpress\.com$/i,
  /sentry\.io$/i,
  /gravatar\.com$/i,
  /wordpress\.com$/i,
  /cloudflare/i,
  /github\.com$/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
  /\.webp$/i,
  /email@/i,
  /your@/i,
  /name@/i,
  /user@/i,
  /test@/i,
  /sample@/i,
];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; BetterScraper/1.0; +https://betterscraper.vercel.app)",
  Accept: "text/html,application/xhtml+xml",
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isJunkEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return JUNK_EMAIL_PATTERNS.some((p) => p.test(lower));
}

function normalizeEmail(raw: string): string | null {
  let email = raw.trim().toLowerCase();
  if (email.startsWith("mailto:")) {
    email = email.slice(7);
  }
  const q = email.indexOf("?");
  if (q !== -1) email = email.slice(0, q);
  email = email.replace(/[.,;:!?)>\]'"]+$/g, "");
  if (!email.includes("@") || email.length < 5 || email.length > 254) return null;
  if (isJunkEmail(email)) return null;
  return email;
}

export function extractEmailsFromHtml(html: string): string[] {
  const found = new Set<string>();

  let mailtoMatch: RegExpExecArray | null;
  const mailtoRe = new RegExp(MAILTO_REGEX.source, MAILTO_REGEX.flags);
  while ((mailtoMatch = mailtoRe.exec(html)) !== null) {
    const email = normalizeEmail(mailtoMatch[1]);
    if (email) found.add(email);
  }

  let emailMatch: RegExpExecArray | null;
  const emailRe = new RegExp(EMAIL_REGEX.source, EMAIL_REGEX.flags);
  while ((emailMatch = emailRe.exec(html)) !== null) {
    const email = normalizeEmail(emailMatch[0]);
    if (email) found.add(email);
  }

  return [...found];
}

function resolveUrl(base: string, path: string): string {
  try {
    return new URL(path, base).href;
  } catch {
    return base;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) break;
      chunks.push(value);
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });
    return decoder.decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array())
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeEmailsFromWebsite(website: string): Promise<string[]> {
  if (!website?.trim()) return [];

  let baseUrl: string;
  try {
    baseUrl = new URL(website.startsWith("http") ? website : `https://${website}`).href;
  } catch {
    return [];
  }

  const emails = new Set<string>();

  for (const path of CONTACT_PATHS) {
    const url = resolveUrl(baseUrl, path);
    const html = await fetchHtml(url);
    if (!html) continue;

    for (const email of extractEmailsFromHtml(html)) {
      emails.add(email);
    }

    if (emails.size >= 3) break;
    await sleep(150);
  }

  return [...emails].slice(0, 3);
}

export async function enrichResultsWithEmails<
  T extends { name: string; website: string; email?: string },
>(
  results: T[],
  options: {
    onProgress?: (message: string) => void;
    concurrency?: number;
  } = {}
): Promise<T[]> {
  const { onProgress, concurrency = 4 } = options;
  const withWebsites = results.filter((r) => r.website?.trim()).length;

  if (withWebsites === 0) {
    onProgress?.("No websites to scrape for emails.");
    return results.map((r) => ({ ...r, email: r.email ?? "" }));
  }

  onProgress?.(`Scraping emails from ${withWebsites} websites…`);

  let emailsFound = 0;
  const enriched: T[] = new Array(results.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < results.length) {
      const i = index++;
      const row = results[i];
      if (!row.website?.trim()) {
        enriched[i] = { ...row, email: row.email ?? "" };
        continue;
      }

      const emails = await scrapeEmailsFromWebsite(row.website);
      if (emails.length > 0) emailsFound += 1;
      onProgress?.(
        `[email] ${row.name}: ${emails.length ? emails.join(", ") : "none found"}`
      );
      enriched[i] = { ...row, email: emails.join(", ") };
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, results.length) }, () =>
    worker()
  );
  await Promise.all(workers);

  onProgress?.(`Email scrape complete: ${emailsFound}/${withWebsites} with emails.`);

  return enriched;
}
