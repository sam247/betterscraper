const JUNK_LOCAL_PATTERNS = [
  /^noreply$/i,
  /^no-?reply$/i,
  /^donotreply$/i,
  /^email$/i,
  /^your$/i,
  /^name$/i,
  /^user$/i,
  /^test$/i,
  /^sample$/i,
  /^username$/i,
  /^you$/i,
  /^someone$/i,
  /^customer$/i,
  /^mr\.smith$/i,
  /^dave$/i,
  /^john\.?doe$/i,
  /^jane\.?doe$/i,
  /^[a-f0-9]{24,}$/i,
];

const JUNK_DOMAIN_PATTERNS = [
  /sentry/i,
  /sentry-elb/i,
  /ingest\./i,
  /\.aphixsoftware\.com$/i,
  /example\.(com|org|net)$/i,
  /wixpress\.com$/i,
  /gravatar\.com$/i,
  /schema\.org$/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
  /\.webp$/i,
  /github\.com$/i,
  /cloudflare/i,
  /wordpress\.com$/i,
  /wix\.com$/i,
  /squarespace\.com$/i,
  /godaddysites\.com$/i,
  /weebly\.com$/i,
  /myshopify\.com$/i,
];

const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  "email.com",
  "email.co.uk",
  "domain.com",
  "test.com",
  "example.com",
  "youremail.com",
  "yourdomain.com",
  "company.com",
  "website.com",
]);

const WEB_AGENCY_DOMAINS = new Set([
  "digitalwebstudio.uk",
  "studioapollo.co.uk",
  "spoton.net",
  "thryv.com",
  "hibu.com",
  "yell.com",
  "yell.co.uk",
]);

const MARKETING_OR_REWARDS_DOMAINS = new Set([
  "mycityplumbingrewards.co.uk",
]);

function localPart(email: string): string {
  return email.split("@")[0]?.toLowerCase() ?? "";
}

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

function websiteDomain(website?: string): string | null {
  if (!website?.trim()) return null;
  try {
    return new URL(
      website.startsWith("http") ? website : `https://${website}`
    ).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

function domainsRelated(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(`.${b}`) || b.endsWith(`.${a}`)) return true;

  const aBase = a.split(".").slice(-2).join(".");
  const bBase = b.split(".").slice(-2).join(".");
  return aBase === bBase;
}

export function isJunkEmail(email: string, website?: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@") || normalized.length < 5) return true;

  const local = localPart(normalized);
  const domain = emailDomain(normalized);

  if (!local || !domain) return true;

  if (JUNK_LOCAL_PATTERNS.some((p) => p.test(local))) return true;
  if (JUNK_DOMAIN_PATTERNS.some((p) => p.test(domain))) return true;

  if (PLACEHOLDER_EMAIL_DOMAINS.has(domain)) return true;

  if (WEB_AGENCY_DOMAINS.has(domain)) return true;
  if (MARKETING_OR_REWARDS_DOMAINS.has(domain)) return true;

  if (local.includes("noreply") || local.includes("no-reply")) return true;

  const siteDomain = websiteDomain(website);
  if (siteDomain) {
    if (!domainsRelated(domain, siteDomain)) {
      if (WEB_AGENCY_DOMAINS.has(domain)) return true;
      if (domain.includes("sentry") || domain.includes("aphixsoftware")) {
        return true;
      }
    }
  }

  return false;
}

export function filterJunkEmails(emails: string[], website?: string): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    if (isJunkEmail(email, website)) continue;
    seen.add(email);
    kept.push(email);
  }

  return kept;
}
