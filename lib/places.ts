const RATE_MS = 200;
const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "nextPageToken",
].join(",");

export interface NormalisedClinic {
  country: string;
  state: string;
  city: string;
  name: string;
  full_address: string;
  phone: string;
  website: string;
  rating: number | null;
  total_reviews: number | null;
  lat: number;
  lng: number;
  place_id: string;
  source_query: string;
}

export interface BuildInput {
  country: string;
  state: string;
  city?: string;
  searchTerms: string[];
  maxResults: number;
}

export interface BuildResult {
  log: string[];
  results: NormalisedClinic[];
  totalResults: number;
  dedupedCount: number;
}

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlaceResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

interface SearchTextResponse {
  places?: PlaceResult[];
  nextPageToken?: string;
  error?: { code?: number; message?: string; status?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getComponent(components: AddressComponent[] | undefined, type: string): string {
  if (!components) return "";
  return components.find((c) => c.types?.includes(type))?.longText ?? "";
}

function buildQuery(term: string, state: string, country: string, city?: string): string {
  const location = city ? `${city}, ${state}, ${country}` : `${state}, ${country}`;
  return `${term} in ${location}`;
}

async function textSearchPage(
  apiKey: string,
  textQuery: string,
  pageToken?: string
): Promise<SearchTextResponse> {
  const body: Record<string, unknown> = { textQuery, pageSize: 20 };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetch(SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      error: {
        code: res.status,
        message: err.error?.message || res.statusText,
        status: res.status.toString(),
      },
    };
  }
  return res.json();
}

export async function runExtraction(
  input: BuildInput,
  apiKey: string
): Promise<BuildResult> {
  const log: string[] = [];
  const seenIds = new Map<string, string>();
  const results: NormalisedClinic[] = [];
  let totalRawFromSearch = 0;

  if (!apiKey?.trim()) {
    log.push("Error: GOOGLE_PLACES_API_KEY is not set.");
    return { log, results: [], totalResults: 0, dedupedCount: 0 };
  }

  const maxResults = Math.min(Math.max(1, input.maxResults || 60), 60);
  const defaultCountry = input.country?.trim() || "United States";
  const defaultState = input.state?.trim() || "";

  for (const term of input.searchTerms) {
    const query = buildQuery(term.trim(), defaultState, defaultCountry, input.city?.trim());
    log.push(`[${term}] Query: ${query}`);

    let totalForTerm = 0;
    let nextPageToken: string | undefined;

    do {
      await sleep(RATE_MS);
      const resp = await textSearchPage(apiKey, query, nextPageToken);

      if (resp.error) {
        log.push(`[${term}] API error: ${resp.error.status || ""} ${resp.error.message || ""}`);
        break;
      }

      const places = resp.places || [];
      totalForTerm += places.length;
      totalRawFromSearch += places.length;

      for (const p of places) {
        if (!p.id || seenIds.has(p.id)) continue;
        seenIds.set(p.id, term);

        const ac = p.addressComponents;
        const city = getComponent(ac, "locality") || getComponent(ac, "administrative_area_level_2") || "";
        const state = getComponent(ac, "administrative_area_level_1") || defaultState;
        const country = getComponent(ac, "country") || defaultCountry;

        results.push({
          country,
          state,
          city,
          name: p.displayName?.text ?? "",
          full_address: p.formattedAddress ?? "",
          phone: p.nationalPhoneNumber ?? "",
          website: p.websiteUri ?? "",
          rating: p.rating ?? null,
          total_reviews: p.userRatingCount ?? null,
          lat: p.location?.latitude ?? 0,
          lng: p.location?.longitude ?? 0,
          place_id: p.id,
          source_query: term,
        });
      }

      log.push(`[${term}] Page: ${places.length} results (total this term: ${totalForTerm})`);

      nextPageToken = resp.nextPageToken;
      if (!nextPageToken || totalForTerm >= maxResults) {
        nextPageToken = undefined;
      }
    } while (nextPageToken);

    if (totalForTerm >= maxResults) {
      log.push(`[${term}] Reached max results (${maxResults}).`);
    }
  }

  log.push(`Total results from search: ${totalRawFromSearch}. Deduplicated: ${results.length}. Done.`);

  return {
    log,
    results,
    totalResults: totalRawFromSearch,
    dedupedCount: results.length,
  };
}
