import { NextResponse } from "next/server";
import { verifyResultsWithLeadRocks } from "@/lib/leadrocks";
import type { NormalisedPlace } from "@/lib/places";

export const maxDuration = 300;

export async function POST(req: Request) {
  let body: {
    results?: NormalisedPlace[];
    onlyValid?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const results = Array.isArray(body.results) ? body.results : [];
  if (results.length === 0) {
    return NextResponse.json({ error: "No results to verify." }, { status: 400 });
  }

  const log: string[] = [];

  try {
    const verified = await verifyResultsWithLeadRocks(results, {
      onProgress: (msg) => log.push(msg),
      onlyValid: body.onlyValid !== false,
      concurrency: 3,
    });
    const validEmails = verified.filter((r) => r.email?.trim()).length;
    log.push(`Valid emails on ${validEmails} leads after verification.`);

    return NextResponse.json({
      log,
      results: verified,
      validEmails,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verification failed.";
    return NextResponse.json({ error: message, log }, { status: 500 });
  }
}
