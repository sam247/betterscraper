const DIRECTORY_AND_SOCIAL_HOSTS = new Set([
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "pinterest.com",
  "yell.com",
  "yell.co.uk",
  "checkatrade.com",
  "trustatrader.com",
  "mybuilder.com",
  "bark.com",
  "ratedpeople.com",
  "freeindex.co.uk",
  "cylex-uk.co.uk",
  "hotfrog.co.uk",
  "tripadvisor.com",
  "tripadvisor.co.uk",
  "google.com",
  "maps.google.com",
  "g.page",
  "goo.gl",
  "business.site",
  "wikipedia.org",
  "companieshouse.gov.uk",
  "find-and-update.company-information.service.gov.uk",
]);

export function hostnameFromWebsite(website: string): string | null {
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

export function isDirectoryOrSocialWebsite(website: string): boolean {
  const host = hostnameFromWebsite(website);
  if (!host) return true;

  if (DIRECTORY_AND_SOCIAL_HOSTS.has(host)) return true;

  for (const blocked of DIRECTORY_AND_SOCIAL_HOSTS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return true;
  }

  return false;
}

export function isScrapableWebsite(website: string): boolean {
  if (!website?.trim()) return false;
  if (isDirectoryOrSocialWebsite(website)) return false;
  return !!hostnameFromWebsite(website);
}

export interface EmailLookupFilterResult<T> {
  eligible: T[];
  skippedNoWebsite: number;
  skippedDirectory: number;
}

export function partitionForEmailLookup<T extends { website?: string }>(
  results: T[],
  options: { skipDirectorySites?: boolean } = {}
): EmailLookupFilterResult<T> {
  const { skipDirectorySites = true } = options;
  const eligible: T[] = [];
  let skippedNoWebsite = 0;
  let skippedDirectory = 0;

  for (const row of results) {
    const website = row.website?.trim();
    if (!website) {
      skippedNoWebsite += 1;
      continue;
    }
    if (skipDirectorySites && isDirectoryOrSocialWebsite(website)) {
      skippedDirectory += 1;
      continue;
    }
    eligible.push(row);
  }

  return { eligible, skippedNoWebsite, skippedDirectory };
}
