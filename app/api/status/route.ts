import { NextResponse } from "next/server";
import { getTombaCredits, isTombaConfigured } from "@/lib/tomba";

export const dynamic = "force-dynamic";

export async function GET() {
  const tomba = isTombaConfigured();
  const tombaCredits = tomba ? await getTombaCredits() : null;

  return NextResponse.json({
    places: !!process.env.GOOGLE_PLACES_API_KEY?.trim(),
    tomba,
    tombaCredits,
  });
}
