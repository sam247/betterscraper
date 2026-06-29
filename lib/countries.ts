export interface Country {
  code: string;
  name: string;
}

/** Countries commonly used for Places text search (exact names for query strings). */
export const COUNTRIES: Country[] = [
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "IE", name: "Ireland" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "CZ", name: "Czech Republic" },
  { code: "GR", name: "Greece" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" },
  { code: "IN", name: "India" },
  { code: "ZA", name: "South Africa" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "JP", name: "Japan" },
];

export const DEFAULT_COUNTRY = "United Kingdom";

export function getCountryByName(name: string): Country | undefined {
  return COUNTRIES.find((c) => c.name === name);
}
