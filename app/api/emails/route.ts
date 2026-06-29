import { NextResponse } from "next/server";
import { enrichResultsWithEmails } from "@/lib/emails";
import { isTombaConfigured } from "@/lib/tomba";
import type { NormalisedPlace } from "@/lib/places";

export const maxDuration = 300;

export async function POST(req: Request) {
  let body: {
    results?: NormalisedPlace[];
    useTomba?: boolean;
    useScrape?: boolean;
    onlyWithEmail?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const results = Array.isArray(body.results) ? body.results : [];
  if (results.length === 0) {
    return NextResponse.json({ error: "No results to enrich." }, { status: 400 });
  }

  const log: string[] = [];

  try {
    const enriched = await enrichResultsWithEmails(results, {
      onProgress: (msg) => log.push(msg),
      concurrency: body.useTomba !== false && isTombaConfigured() ? 2 : 4,
      useTomba: body.useTomba !== false,
      useScrape: body.useScrape !== false,
      onlyWithEmail: body.onlyWithEmail === true,
    });
    const emailsFound = enriched.filter((r) => r.email?.trim()).length;
    log.push(`Emails found for ${emailsFound} of ${results.length} places.`);

    return NextResponse.json({ log, results: enriched, emailsFound });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email scrape failed.";
    return NextResponse.json({ error: message, log }, { status: 500 });
  }
}
