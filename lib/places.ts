const RATE_MS = 200;
const NEXT_PAGE_DELAY_MS = 2000;
const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACE_DETAILS_BASE = "https://places.googleapis.com/v1/places";

const SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,nextPageToken";
const DETAILS_FIELD_MASK =
  "displayName,formattedAddress,addressComponents,nationalPhoneNumber,websiteUri";

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

interface NewAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface NewPlaceSearchItem {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
}

interface SearchTextResponse {
  places?: NewPlaceSearchItem[];
  nextPageToken?: string;
  error?: { code?: number; message?: string; status?: string };
}

interface NewPlaceDetails {
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: NewAddressComponent[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getComponent(
  components: NewAddressComponent[] | undefined,
  type: string
): string {
  if (!components) return "";
  const c = components.find((x) => x.types?.includes(type));
  return c?.longText ?? "";
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
  const body: Record<string, unknown> = {
    textQuery,
    pageSize: 20,
  };
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

async function placeDetailsNew(
  apiKey: string,
  placeId: string
): Promise<{ place?: NewPlaceDetails; error?: { message?: string; status?: string } }> {
  const url = `${PLACE_DETAILS_BASE}/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      error: {
        message: err.error?.message || res.statusText,
        status: String(res.status),
      },
    };
  }
  return { place: await res.json() };
}

export async function runExtraction(
  input: BuildInput,
  apiKey: string
): Promise<BuildResult> {
  const log: string[] = [];
  const seenPlaceIds = new Map<string, string>();
  const rawCandidates: Array<{
    place_id: string;
    name: string;
    formatted_address: string;
    rating?: number;
    user_ratings_total?: number;
    lat: number;
    lng: number;
    source_query: string;
  }> = [];

  if (!apiKey?.trim()) {
    log.push("Error: GOOGLE_PLACES_API_KEY is not set.");
    return { log, results: [], totalResults: 0, dedupedCount: 0 };
  }

  const maxResults = Math.min(Math.max(1, input.maxResults || 60), 60);
  let totalRawFromSearch = 0;

  const country = input.country?.trim() || "United States";
  for (const term of input.searchTerms) {
    const query = buildQuery(term.trim(), input.state.trim(), country, input.city?.trim());
    if (!query.replace(term, "").trim()) continue;

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
        const placeId = p.id;
        if (!placeId) continue;
        if (seenPlaceIds.has(placeId)) continue;
        seenPlaceIds.set(placeId, term);
        const loc = p.location;
        rawCandidates.push({
          place_id: placeId,
          name: p.displayName?.text ?? "",
          formatted_address: p.formattedAddress ?? "",
          rating: p.rating,
          user_ratings_total: p.userRatingCount,
          lat: loc?.latitude ?? 0,
          lng: loc?.longitude ?? 0,
          source_query: term,
        });
      }

      log.push(`[${term}] Page: ${places.length} results (total this term: ${totalForTerm})`);

      nextPageToken = resp.nextPageToken;
      if (nextPageToken && totalForTerm < maxResults) {
        log.push(`[${term}] Waiting 2s before next page...`);
        await sleep(NEXT_PAGE_DELAY_MS);
      } else {
        nextPageToken = undefined;
      }
    } while (nextPageToken && totalForTerm < maxResults);

    if (totalForTerm >= maxResults) {
      log.push(`[${term}] Reached max results (${maxResults}).`);
    }
  }

  const totalResults = totalRawFromSearch;
  log.push(`Total results from search: ${totalResults}. Unique places: ${rawCandidates.length}. Fetching details...`);

  const results: NormalisedClinic[] = [];
  const defaultCountry = input.country?.trim() || "United States";
  const defaultState = input.state?.trim() || "";

  for (let i = 0; i < rawCandidates.length; i++) {
    const c = rawCandidates[i];
    await sleep(RATE_MS);
    const { place: d, error: detailError } = await placeDetailsNew(apiKey, c.place_id);

    if (detailError || !d) {
      log.push(`[${c.place_id}] Details error: ${detailError?.status || ""} ${detailError?.message || ""}`);
      results.push({
        country: defaultCountry,
        state: defaultState,
        city: "",
        name: c.name,
        full_address: c.formatted_address,
        phone: "",
        website: "",
        rating: c.rating ?? null,
        total_reviews: c.user_ratings_total ?? null,
        lat: c.lat,
        lng: c.lng,
        place_id: c.place_id,
        source_query: c.source_query,
      });
      continue;
    }

    const ac = d.addressComponents ?? [];
    const city =
      getComponent(ac, "locality") ||
      getComponent(ac, "administrative_area_level_2") ||
      "";
    const state = getComponent(ac, "administrative_area_level_1") || defaultState;
    const country = getComponent(ac, "country") || defaultCountry;

    results.push({
      country,
      state,
      city,
      name: d.displayName?.text ?? c.name,
      full_address: d.formattedAddress ?? c.formatted_address,
      phone: d.nationalPhoneNumber ?? "",
      website: d.websiteUri ?? "",
      rating: c.rating ?? null,
      total_reviews: c.user_ratings_total ?? null,
      lat: c.lat,
      lng: c.lng,
      place_id: c.place_id,
      source_query: c.source_query,
    });

    if ((i + 1) % 10 === 0) {
      log.push(`Details: ${i + 1}/${rawCandidates.length} done.`);
    }
  }

  log.push(`Done. Deduplicated count: ${results.length}.`);
  return {
    log,
    results,
    totalResults,
    dedupedCount: results.length,
  };
}
