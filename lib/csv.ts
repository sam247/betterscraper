import type { NormalisedPlace } from "./places";
import { RESULT_COLUMNS } from "./constants";

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sanitiseFilenamePart(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function buildCsv(results: NormalisedPlace[]): string {
  const keys = RESULT_COLUMNS.map((c) => c.key);
  const headers = RESULT_COLUMNS.map((c) => c.label);
  const rows: string[] = [headers.join(",")];

  for (const r of results) {
    rows.push(keys.map((k) => escapeCsvCell(r[k])).join(","));
  }

  return rows.join("\n");
}

export function buildExportFilename(
  country: string,
  state: string,
  city?: string
): string {
  const countryPart = sanitiseFilenamePart(country || "us");
  const statePart = sanitiseFilenamePart(state);
  const cityPart = city ? `-${sanitiseFilenamePart(city)}` : "";
  return `${countryPart}-${statePart}${cityPart}-places.csv`;
}

export function downloadCsv(
  results: NormalisedPlace[],
  country: string,
  state: string,
  city?: string
): void {
  const csv = buildCsv(results);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildExportFilename(country, state, city);
  a.click();
  URL.revokeObjectURL(url);
}
