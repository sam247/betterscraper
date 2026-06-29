import { NextResponse } from "next/server";
import { buildCsv, buildExportFilename } from "@/lib/csv";
import type { NormalisedPlace } from "@/lib/places";

export async function POST(req: Request) {
  let body: {
    results?: NormalisedPlace[];
    country?: string;
    state?: string;
    city?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const results = Array.isArray(body.results) ? body.results : [];
  if (results.length === 0) {
    return NextResponse.json(
      { error: "No results to export." },
      { status: 400 }
    );
  }

  const filename = buildExportFilename(
    typeof body.country === "string" ? body.country : "us",
    typeof body.state === "string" ? body.state : "export",
    typeof body.city === "string" ? body.city : undefined
  );

  return new NextResponse(buildCsv(results), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
