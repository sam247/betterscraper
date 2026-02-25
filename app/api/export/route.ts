import { NextResponse } from "next/server";
import { getLastExtraction } from "@/lib/store";

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

export async function GET() {
  const last = getLastExtraction();
  if (!last || last.results.length === 0) {
    return NextResponse.json(
      { error: "No extraction results to export. Run an extraction first." },
      { status: 404 }
    );
  }

  const headers = [
    "country",
    "state",
    "city",
    "name",
    "full_address",
    "phone",
    "website",
    "rating",
    "total_reviews",
    "lat",
    "lng",
    "place_id",
    "source_query",
  ];

  const rows: string[] = [headers.join(",")];
  for (const r of last.results) {
    rows.push(
      [
        escapeCsvCell(r.country),
        escapeCsvCell(r.state),
        escapeCsvCell(r.city),
        escapeCsvCell(r.name),
        escapeCsvCell(r.full_address),
        escapeCsvCell(r.phone),
        escapeCsvCell(r.website),
        escapeCsvCell(r.rating),
        escapeCsvCell(r.total_reviews),
        escapeCsvCell(r.lat),
        escapeCsvCell(r.lng),
        escapeCsvCell(r.place_id),
        escapeCsvCell(r.source_query),
      ].join(",")
    );
  }

  const countryPart = sanitiseFilenamePart(last.country || "us");
  const statePart = sanitiseFilenamePart(last.state);
  const cityPart = last.city ? `-${sanitiseFilenamePart(last.city)}` : "";
  const filename = `${countryPart}-${statePart}${cityPart}-lice-clinics.csv`;

  return new NextResponse(rows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
