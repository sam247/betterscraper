/** London boroughs — each can return up to 60 Places results per search term. */
export const LONDON_BOROUGHS = [
  "Barking and Dagenham",
  "Barnet",
  "Bexley",
  "Brent",
  "Bromley",
  "Camden",
  "City of London",
  "Croydon",
  "Ealing",
  "Enfield",
  "Greenwich",
  "Hackney",
  "Hammersmith and Fulham",
  "Haringey",
  "Harrow",
  "Havering",
  "Hillingdon",
  "Hounslow",
  "Islington",
  "Kensington and Chelsea",
  "Kingston upon Thames",
  "Lambeth",
  "Lewisham",
  "Merton",
  "Newham",
  "Redbridge",
  "Richmond upon Thames",
  "Southwark",
  "Sutton",
  "Tower Hamlets",
  "Waltham Forest",
  "Wandsworth",
  "Westminster",
] as const;

export function isUnitedKingdom(country: string): boolean {
  const c = country.trim().toLowerCase();
  return c === "united kingdom" || c === "uk" || c === "great britain";
}

export function isLondonRegion(state: string, city?: string): boolean {
  const s = state.trim().toLowerCase();
  const c = (city || "").trim().toLowerCase();
  return s === "london" || s.includes("greater london") || c === "london";
}

/** Returns sub-areas to search when area splitting is enabled, or null for a single query. */
export function resolveAreaSplits(
  country: string,
  state: string,
  city?: string
): string[] | null {
  if (!isUnitedKingdom(country)) return null;

  if (isLondonRegion(state, city)) {
    return [...LONDON_BOROUGHS];
  }

  return null;
}

export function describeAreaSplit(areas: string[]): string {
  return `${areas.length} areas (up to ${areas.length * 60} raw results per term before deduping)`;
}
