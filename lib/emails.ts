import { filterJunkEmails, isJunkEmail } from "./email-junk";
import { pickPrimaryEmail } from "./email-pick";
import {
  domainFromWebsite,
  isTombaConfigured,
  searchDomainEmails,
} from "./tomba";
import { hostnameFromWebsite, isDirectoryOrSocialWebsite } from "./website-filter";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 768_000;
const TOMBA_RATE_MS = 250;
const PAGE_DELAY_MS = 80;

function canLookupWebsite(website: string, skipDirectorySites: boolean): boolean {
  if (!website?.trim()) return false;
  if (skipDirectorySites && isDirectoryOrSocialWebsite(website)) return false;
  return !!hostnameFromWebsite(website);
}

const CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/contactus",
  "/get-in-touch",
  "/enquiries",
  "/enquiry",
  "/about",
  "/about-us",
];

const EMAIL_REGEX =
  /[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+/g;

const MAILTO_REGEX = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

const CF_EMAIL_HASH_REGEX =
  /\/cdn-cgi\/l\/email-protection#([a-f0-9]+)|data-cfemail=["']([a-f0-9]+)["']/gi;

const CONTACT_LINK_REGEX =
  /href=["']([^"']*(?:contact|enquir|get-in-touch|about|team)[^"']*)["']/gi;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

function buildFetchUrlVariants(website: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(
      website.startsWith("http") ? website : `https://${website}`
    );
  } catch {
    return [];
  }

  const host = parsed.hostname.toLowerCase();
  const bare = host.replace(/^www\./, "");
  const path = parsed.pathname === "/" ? "" : parsed.pathname;
  const search = parsed.search;

  const hosts = [...new Set([host, bare, `www.${bare}`])];
  const schemes = ["https", "http"];
  const urls: string[] = [];

  for (const scheme of schemes) {
    for (const h of hosts) {
      urls.push(`${scheme}://${h}${path}${search}`);
      if (!path) urls.push(`${scheme}://${h}/`);
    }
  }

  return [...new Set(urls)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeEmail(raw: string, website?: string): string | null {
  let email = raw.trim().toLowerCase();
  if (email.startsWith("mailto:")) {
    email = email.slice(7);
  }
  const q = email.indexOf("?");
  if (q !== -1) email = email.slice(0, q);
  email = email.replace(/[.,;:!?)>\]'"]+$/g, "");
  if (!email.includes("@") || email.length < 5 || email.length > 254) return null;
  if (isJunkEmail(email, website)) return null;
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
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("application/json")
    ) {
      return null;
    }

    const text = await res.text();
    if (!text || text.length > MAX_HTML_BYTES) {
      return text ? text.slice(0, MAX_HTML_BYTES) : null;
    }
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFirstHtml(
  urls: string[]
): Promise<{ html: string; url: string } | null> {
  for (const url of urls) {
    const html = await fetchHtml(url);
    if (html) return { html, url };
  }
  return null;
}

export async function scrapeEmailsFromWebsite(
  website: string,
  options: { skipDirectorySites?: boolean } = {}
): Promise<{ emails: string[]; detail: string }> {
  const { skipDirectorySites = true } = options;
  if (!website?.trim()) return { emails: [], detail: "no website" };
  if (skipDirectorySites && isDirectoryOrSocialWebsite(website)) {
    return { emails: [], detail: "directory/social URL" };
  }

  const variants = buildFetchUrlVariants(website);
  if (variants.length === 0) return { emails: [], detail: "invalid URL" };

  const emails = new Set<string>();
  const visited = new Set<string>();

  const home = await fetchFirstHtml(variants);
  if (!home) {
    return { emails: [], detail: "fetch failed (all URL variants)" };
  }

  let baseUrl = home.url;
  visited.add(home.url);

  for (const email of extractEmailsFromHtml(home.html)) {
    emails.add(email);
  }

  const homeCleaned = filterJunkEmails(Array.from(emails), website);
  if (homeCleaned.length > 0) {
    return {
      emails: [pickPrimaryEmail(homeCleaned, website)],
      detail: "homepage",
    };
  }

  const queue: string[] = [];
  for (const path of CONTACT_PATHS) {
    queue.push(resolveUrl(baseUrl, path));
  }
  for (const contactUrl of discoverContactUrls(baseUrl, home.html)) {
    if (!visited.has(contactUrl)) queue.push(contactUrl);
  }

  while (queue.length > 0 && visited.size < 6) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    const html = await fetchHtml(url);
    if (!html) continue;

    for (const email of extractEmailsFromHtml(html)) {
      emails.add(email);
    }

    const cleaned = filterJunkEmails(Array.from(emails), website);
    if (cleaned.length > 0) break;
    await sleep(PAGE_DELAY_MS);
  }

  const finalCleaned = filterJunkEmails(Array.from(emails), website);
  if (finalCleaned.length === 0) {
    return { emails: [], detail: `no email in ${visited.size} page(s)` };
  }

  return {
    emails: [pickPrimaryEmail(finalCleaned, website)],
    detail: `found on ${visited.size} page(s)`,
  };
}

async function resolveEmailsForRow(
  row: { name: string; website: string },
  options: {
    useTomba: boolean;
    useScrape: boolean;
    skipDirectorySites?: boolean;
    domainCache?: Map<string, { email: string; source: string }>;
  }
): Promise<{ email: string; source: string }> {
  const domain = domainFromWebsite(row.website) || hostnameFromWebsite(row.website);
  const cacheKey = domain || row.website.trim().toLowerCase();

  if (options.domainCache?.has(cacheKey)) {
    const cached = options.domainCache.get(cacheKey)!;
    return cached;
  }

  const found = new Set<string>();
  let source = "none";

  if (options.useTomba && domain) {
    const { emails: tombaEmails, error } = await searchDomainEmails(
      domain,
      row.name
    );
    if (tombaEmails.length > 0) {
      for (const e of tombaEmails) found.add(e);
      source = "tomba";
    } else if (error && !error.includes("not configured")) {
      source = `tomba: ${error}`;
    }
    await sleep(TOMBA_RATE_MS);
  }

  if (found.size === 0 && options.useScrape) {
    const scraped = await scrapeEmailsFromWebsite(row.website, {
      skipDirectorySites: options.skipDirectorySites,
    });
    if (scraped.emails.length > 0) {
      for (const e of scraped.emails) found.add(e);
      source = source.startsWith("tomba:") ? `scrape (${source})` : "scrape";
    } else if (source === "none") {
      source = `scrape: ${scraped.detail}`;
    } else if (source.startsWith("tomba:")) {
      source = `${source}; scrape: ${scraped.detail}`;
    }
  }

  const email = pickPrimaryEmail(Array.from(found), row.website);
  const result = {
    email,
    source: email ? source : source === "none" ? "none" : `${source} (junk filtered)`,
  };
  options.domainCache?.set(cacheKey, result);
  return result;
}

export async function enrichResultsWithEmails<
  T extends { name: string; website: string; email?: string },
>(
  results: T[],
  options: {
    onProgress?: (message: string) => void;
    onRowComplete?: (
      processed: number,
      total: number,
      name: string,
      email: string
    ) => void;
    concurrency?: number;
    onlyWithEmail?: boolean;
    useTomba?: boolean;
    useScrape?: boolean;
    skipDirectorySites?: boolean;
  } = {}
): Promise<T[]> {
  const {
    onProgress,
    onRowComplete,
    concurrency = 4,
    onlyWithEmail = false,
    useTomba = isTombaConfigured(),
    useScrape = true,
    skipDirectorySites = true,
  } = options;
  const scrapable = results.filter((r) =>
    canLookupWebsite(r.website ?? "", skipDirectorySites)
  );
  const withWebsites = scrapable.length;

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
    useScrape ? "scrape fallback" : null,
  ]
    .filter(Boolean)
    .join(" → ");

  onProgress?.(
    `Finding emails for ${withWebsites} scrapable sites (${methods || "no methods enabled"}).`
  );

  let emailsFound = 0;
  let processed = 0;
  const enriched: T[] = new Array(results.length);
  const domainCache = new Map<string, { email: string; source: string }>();
  let index = 0;

  async function worker(): Promise<void> {
    while (index < results.length) {
      const i = index++;
      const row = results[i];
      if (!canLookupWebsite(row.website ?? "", skipDirectorySites)) {
        enriched[i] = { ...row, email: row.email ?? "" };
        continue;
      }

      const { email, source } = await resolveEmailsForRow(row, {
        useTomba: useTomba && isTombaConfigured(),
        useScrape,
        skipDirectorySites,
        domainCache,
      });
      processed += 1;
      if (email) emailsFound += 1;
      onProgress?.(
        `[${source}] ${row.name}: ${email || "none found"}`
      );
      onRowComplete?.(processed, withWebsites, row.name, email);
      enriched[i] = { ...row, email };
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