import type { NormalisedPlace } from "./places";

export const RESULT_COLUMNS: {
  key: keyof NormalisedPlace;
  label: string;
  wide?: boolean;
}[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website", wide: true },
  { key: "full_address", label: "Address", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "rating", label: "Rating" },
  { key: "total_reviews", label: "Reviews" },
  { key: "source_query", label: "Query" },
  { key: "lat", label: "Lat" },
  { key: "lng", label: "Lng" },
  { key: "place_id", label: "Place ID", wide: true },
];
