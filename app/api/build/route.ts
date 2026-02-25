import { NextResponse } from "next/server";
import { runExtraction } from "@/lib/places";
import { setLastExtraction } from "@/lib/store";

export async function POST(req: Request) {
  let body: {
    country?: string;
    state?: string;
    city?: string;
    searchTerms?: string[];
    maxResults?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const state = typeof body.state === "string" ? body.state.trim() : "";
  const searchTerms = Array.isArray(body.searchTerms)
    ? body.searchTerms.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean)
    : [];

  if (!state) {
    return NextResponse.json(
      { error: "state is required" },
      { status: 400 }
    );
  }
  if (searchTerms.length === 0) {
    return NextResponse.json(
      { error: "searchTerms must be a non-empty array" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      {
        log: ["Error: GOOGLE_PLACES_API_KEY is not set."],
        results: [],
        totalResults: 0,
        dedupedCount: 0,
      },
      { status: 200 }
    );
  }

  const input = {
    country: typeof body.country === "string" ? body.country : "United States",
    state,
    city: typeof body.city === "string" ? body.city : undefined,
    searchTerms,
    maxResults: typeof body.maxResults === "number" && body.maxResults > 0
      ? body.maxResults
      : 60,
  };

  const result = await runExtraction(input, apiKey);
  setLastExtraction(result.results, input.country, input.state, input.city || "");
  return NextResponse.json(result);
}
