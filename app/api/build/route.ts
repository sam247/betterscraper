import { NextResponse } from "next/server";
import { DEFAULT_COUNTRY } from "@/lib/countries";
import { runPlacesSearch } from "@/lib/places";

export const maxDuration = 60;

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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const state = typeof body.state === "string" ? body.state.trim() : "";
  const searchTerms = Array.isArray(body.searchTerms)
    ? body.searchTerms
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  if (!state) {
    return NextResponse.json({ error: "state is required" }, { status: 400 });
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
      { error: "GOOGLE_PLACES_API_KEY is not configured." },
      { status: 503 }
    );
  }

  const result = await runPlacesSearch(
    {
      country: typeof body.country === "string" ? body.country : DEFAULT_COUNTRY,
      state,
      city: typeof body.city === "string" ? body.city : undefined,
      searchTerms,
      maxResults:
        typeof body.maxResults === "number" && body.maxResults > 0
          ? body.maxResults
          : 60,
    },
    apiKey
  );

  return NextResponse.json(result);
}
