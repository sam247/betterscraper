import { filterJunkEmails } from "./email-junk";

const ROLE_PREFIXES = [
  "info",
  "contact",
  "hello",
  "enquiries",
  "enquiry",
  "mail",
  "office",
  "admin",
];

const DEPRIORITIZED_PREFIXES = [
  "noreply",
  "no-reply",
  "donotreply",
  "sales",
  "careers",
  "jobs",
  "hr",
  "recruitment",
  "privacy",
  "dpo",
  "support",
  "help",
  "billing",
  "accounts",
];

function localPart(email: string): string {
  return email.split("@")[0]?.toLowerCase() ?? "";
}

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

function scoreEmail(email: string, websiteDomain: string | null): number {
  const local = localPart(email);
  let score = 0;

  if (websiteDomain && emailDomain(email) === websiteDomain) score += 50;
  else if (websiteDomain && emailDomain(email).endsWith(`.${websiteDomain}`)) {
    score += 40;
  }

  if (ROLE_PREFIXES.some((p) => local === p || local.startsWith(`${p}.`))) {
    score += 30;
  }

  if (DEPRIORITIZED_PREFIXES.some((p) => local.includes(p))) score -= 40;

  if (local.length > 24) score -= 5;

  return score;
}

export function pickPrimaryEmail(
  emails: string[],
  website?: string
): string {
  const unique = filterJunkEmails(emails, website);
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];

  let websiteDomain: string | null = null;
  if (website?.trim()) {
    try {
      websiteDomain = new URL(
        website.startsWith("http") ? website : `https://${website}`
      ).hostname
        .toLowerCase()
        .replace(/^www\./, "");
    } catch {
      websiteDomain = null;
    }
  }

  return unique
    .map((email) => ({ email, score: scoreEmail(email, websiteDomain) }))
    .sort((a, b) => b.score - a.score)[0].email;
}
