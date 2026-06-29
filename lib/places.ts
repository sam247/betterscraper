const RATE_MS = 200;
const PLACES_FETCH_TIMEOUT_MS = 25_000;
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
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

export interface NormalisedPlace {
  country: string;
  state: string;
  city: string;
  name: string;
  full_address: string;
  phone: string;
  website: string;
  email: string;
  rating: number | null;
  total_reviews: number | null;
  lat: number;
  lng: number;
  place_id: string;
  source_query: string;
  maps_url: string;
}

/** @deprecated Use NormalisedPlace */
export type NormalisedClinic = NormalisedPlace;

export interface PlacesSearchInput {
  country: string;
  state: string;
  city?: string;
  searchTerms: string[];
  maxResults: number;
}

export interface PlacesSearchResult {
  log: string[];
  results: NormalisedPlace[];
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
  googleMapsUri?: string;
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLACES_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(SEARCH_TEXT_URL, {
      method: "POST",
      signal: controller.signal,
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
  } catch (e) {
    const message =
      e instanceof Error && e.name === "AbortError"
        ? "Google Places request timed out"
        : e instanceof Error
          ? e.message
          : "Google Places request failed";
    return {
      error: {
        message,
        status: "timeout",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runPlacesSearch(
  input: PlacesSearchInput,
  apiKey: string
): Promise<PlacesSearchResult> {
  const log: string[] = [];
  const seenIds = new Map<string, string>();
  const results: NormalisedPlace[] = [];
  let totalRawFromSearch = 0;

  if (!apiKey?.trim()) {
    log.push("Error: GOOGLE_PLACES_API_KEY is not set.");
    return { log, results: [], totalResults: 0, dedupedCount: 0 };
  }

  const maxResults = Math.min(Math.max(1, input.maxResults || 60), 60);
  const defaultCountry = input.country?.trim() || "United Kingdom";
  const defaultState = input.state?.trim() || "";

  for (const term of input.searchTerms) {
    const query = buildQuery(term.trim(), defaultState, defaultCountry, input.city?.trim());
    log.push(`[${term}] Query: ${query}`);

    let totalForTerm = 0;
    let nextPageToken: string | undefined;
    let emptyPages = 0;

    do {
      await sleep(RATE_MS);
      const resp = await textSearchPage(apiKey, query, nextPageToken);

      if (resp.error) {
        log.push(`[${term}] API error: ${resp.error.status || ""} ${resp.error.message || ""}`);
        break;
      }

      const places = resp.places || [];
      if (places.length === 0) {
        emptyPages += 1;
        if (emptyPages >= 2) {
          log.push(`[${term}] No more results.`);
          break;
        }
      } else {
        emptyPages = 0;
      }

      totalForTerm += places.length;
      totalRawFromSearch += places.length;

      for (const p of places) {
        if (!p.id || seenIds.has(p.id)) continue;
        seenIds.set(p.id, term);

        const ac = p.addressComponents;
        const city =
          getComponent(ac, "locality") ||
          getComponent(ac, "administrative_area_level_2") ||
          "";
        const state = getComponent(ac, "administrative_area_level_1") || defaultState;
        const country = getComponent(ac, "country") || defaultCountry;
        const lat = p.location?.latitude ?? 0;
        const lng = p.location?.longitude ?? 0;

        results.push({
          country,
          state,
          city,
          name: p.displayName?.text ?? "",
          full_address: p.formattedAddress ?? "",
          phone: p.nationalPhoneNumber ?? "",
          website: p.websiteUri ?? "",
          email: "",
          rating: p.rating ?? null,
          total_reviews: p.userRatingCount ?? null,
          lat,
          lng,
          place_id: p.id,
          source_query: term,
          maps_url:
            p.googleMapsUri ??
            (lat && lng
              ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
              : ""),
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

  log.push(`Places search complete: ${totalRawFromSearch} raw, ${results.length} unique.`);

  return {
    log,
    results,
    totalResults: totalRawFromSearch,
    dedupedCount: results.length,
  };
}
