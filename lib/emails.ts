import {
  domainFromWebsite,
  isTombaConfigured,
  searchDomainEmails,
} from "./tomba";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 768_000;
const TOMBA_RATE_MS = 250;

const STATIC_PATHS = [
  "",
  "/contact",
  "/contact-us",
  "/contactus",
  "/get-in-touch",
  "/enquiries",
  "/enquiry",
  "/about",
  "/about-us",
  "/team",
  "/our-team",
];

const EMAIL_REGEX =
  /[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+/g;

const MAILTO_REGEX = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

const CF_EMAIL_HASH_REGEX =
  /\/cdn-cgi\/l\/email-protection#([a-f0-9]+)|data-cfemail=["']([a-f0-9]+)["']/gi;

const CONTACT_LINK_REGEX =
  /href=["']([^"']*(?:contact|enquir|get-in-touch|about|team)[^"']*)["']/gi;

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
  /schema\.org$/i,
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
  /@sentry\./i,
  /wix\.com$/i,
];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
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

function decodeCloudflareEmail(hex: string): string | null {
  if (!hex || hex.length < 4 || hex.length % 2 !== 0) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  if (Number.isNaN(key)) return null;
  let out = "";
  for (let i = 2; i < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(code)) return null;
    out += String.fromCharCode(code ^ key);
  }
  return normalizeEmail(out);
}

function deobfuscateText(text: string): string {
  return text
    .replace(/&#0*64;/g, "@")
    .replace(/&#x40;/gi, "@")
    .replace(/\[at\]/gi, "@")
    .replace(/\(at\)/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\[dot\]/gi, ".")
    .replace(/\(dot\)/gi, ".")
    .replace(/\s+dot\s+/gi, ".");
}

function addEmailsFromText(text: string, found: Set<string>): void {
  const normalized = deobfuscateText(text);

  let cfMatch: RegExpExecArray | null;
  const cfRe = new RegExp(CF_EMAIL_HASH_REGEX.source, CF_EMAIL_HASH_REGEX.flags);
  while ((cfMatch = cfRe.exec(normalized)) !== null) {
    const hash = cfMatch[1] || cfMatch[2];
    if (hash) {
      const email = decodeCloudflareEmail(hash);
      if (email) found.add(email);
    }
  }

  let mailtoMatch: RegExpExecArray | null;
  const mailtoRe = new RegExp(MAILTO_REGEX.source, MAILTO_REGEX.flags);
  while ((mailtoMatch = mailtoRe.exec(normalized)) !== null) {
    const email = normalizeEmail(mailtoMatch[1]);
    if (email) found.add(email);
  }

  let emailMatch: RegExpExecArray | null;
  const emailRe = new RegExp(EMAIL_REGEX.source, EMAIL_REGEX.flags);
  while ((emailMatch = emailRe.exec(normalized)) !== null) {
    const email = normalizeEmail(emailMatch[0]);
    if (email) found.add(email);
  }
}

function extractEmailsFromJsonLd(html: string, found: Set<string>): void {
  const scriptRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      walkJsonLd(data, found);
    } catch {
      // ignore invalid JSON-LD
    }
  }
}

function walkJsonLd(node: unknown, found: Set<string>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, found);
    return;
  }
  if (typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  if (typeof obj.email === "string") {
    const email = normalizeEmail(obj.email);
    if (email) found.add(email);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") walkJsonLd(value, found);
  }
}

export function extractEmailsFromHtml(html: string): string[] {
  const found = new Set<string>();
  addEmailsFromText(html, found);
  extractEmailsFromJsonLd(html, found);
  return Array.from(found);
}

function resolveUrl(base: string, path: string): string {
  try {
    return new URL(path, base).href;
  } catch {
    return base;
  }
}

function discoverContactUrls(baseUrl: string, html: string): string[] {
  const urls = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(CONTACT_LINK_REGEX.source, CONTACT_LINK_REGEX.flags);

  while ((match = re.exec(html)) !== null) {
    try {
      const href = match[1];
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
      const resolved = new URL(href, baseUrl).href;
      if (resolved.startsWith("http")) urls.add(resolved);
    } catch {
      // skip bad URLs
    }
  }

  return Array.from(urls).slice(0, 4);
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
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("application/xhtml")
    ) {
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
    const combined = chunks.reduce((acc, chunk) => {
      const merged = new Uint8Array(acc.length + chunk.length);
      merged.set(acc);
      merged.set(chunk, acc.length);
      return merged;
    }, new Uint8Array());

    return decoder.decode(combined);
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
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const path of STATIC_PATHS) {
    queue.push(resolveUrl(baseUrl, path));
  }

  while (queue.length > 0 && visited.size < 8) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    const html = await fetchHtml(url);
    if (!html) continue;

    for (const email of extractEmailsFromHtml(html)) {
      emails.add(email);
    }

    if (emails.size >= 3) break;

    if (visited.size === 1) {
      for (const contactUrl of discoverContactUrls(baseUrl, html)) {
        if (!visited.has(contactUrl)) queue.push(contactUrl);
      }
    }

    await sleep(100);
  }

  return Array.from(emails).slice(0, 3);
}

async function resolveEmailsForRow(
  row: { name: string; website: string },
  options: { useTomba: boolean; useScrape: boolean }
): Promise<{ emails: string[]; source: string }> {
  const domain = domainFromWebsite(row.website);
  const emails = new Set<string>();
  let source = "none";

  if (options.useTomba && domain) {
    const { emails: tombaEmails, error } = await searchDomainEmails(
      domain,
      row.name
    );
    if (tombaEmails.length > 0) {
      for (const e of tombaEmails) emails.add(e);
      source = "tomba";
    } else if (error && !error.includes("not configured")) {
      source = `tomba: ${error}`;
    }
    await sleep(TOMBA_RATE_MS);
  }

  if (emails.size === 0 && options.useScrape) {
    const scraped = await scrapeEmailsFromWebsite(row.website);
    if (scraped.length > 0) {
      for (const e of scraped) emails.add(e);
      source = source.startsWith("tomba:") ? `scrape (${source})` : "scrape";
    } else if (source === "none") {
      source = "none";
    }
  }

  return { emails: Array.from(emails).slice(0, 5), source };
}

export async function enrichResultsWithEmails<
  T extends { name: string; website: string; email?: string },
>(
  results: T[],
  options: {
    onProgress?: (message: string) => void;
    concurrency?: number;
    onlyWithEmail?: boolean;
    useTomba?: boolean;
    useScrape?: boolean;
  } = {}
): Promise<T[]> {
  const {
    onProgress,
    concurrency = 4,
    onlyWithEmail = false,
    useTomba = isTombaConfigured(),
    useScrape = true,
  } = options;
  const withWebsites = results.filter((r) => r.website?.trim()).length;

  if (withWebsites === 0) {
    onProgress?.("No websites to look up emails for.");
    return onlyWithEmail ? [] : results.map((r) => ({ ...r, email: r.email ?? "" }));
  }

  if (!useTomba && !useScrape) {
    onProgress?.("No email lookup methods enabled.");
    return onlyWithEmail ? [] : results.map((r) => ({ ...r, email: r.email ?? "" }));
  }

  const methods = [
    useTomba && isTombaConfigured() ? "Tomba" : null,
    useScrape ? "website scrape" : null,
  ]
    .filter(Boolean)
    .join(" → ");

  onProgress?.(
    `Finding emails for ${withWebsites} websites (${methods || "no methods enabled"}).`
  );

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

      const { emails, source } = await resolveEmailsForRow(row, {
        useTomba: useTomba && isTombaConfigured(),
        useScrape,
      });
      if (emails.length > 0) emailsFound += 1;
      onProgress?.(
        `[${source}] ${row.name}: ${emails.length ? emails.join(", ") : "none found"}`
      );
      enriched[i] = { ...row, email: emails.join(", ") };
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, results.length) }, () =>
    worker()
  );
  await Promise.all(workers);

  onProgress?.(`Email lookup complete: ${emailsFound}/${withWebsites} with emails.`);

  let finalResults = enriched;
  if (onlyWithEmail) {
    const before = finalResults.length;
    finalResults = finalResults.filter((r) => r.email?.trim());
    onProgress?.(`Kept ${finalResults.length} of ${before} leads with email.`);
  }

  return finalResults;
}