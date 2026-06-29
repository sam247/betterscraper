import { NextResponse } from "next/server";
import { getLeadRocksCredits, isLeadRocksConfigured } from "@/lib/leadrocks";
import { getTombaCredits, isTombaConfigured } from "@/lib/tomba";

export const dynamic = "force-dynamic";

export async function GET() {
  const tomba = isTombaConfigured();
  const leadrocks = isLeadRocksConfigured();

  const [tombaCredits, leadrocksCredits] = await Promise.all([
    tomba ? getTombaCredits() : Promise.resolve(null),
    leadrocks ? getLeadRocksCredits() : Promise.resolve(null),
  ]);

  return NextResponse.json({
    places: !!process.env.GOOGLE_PLACES_API_KEY?.trim(),
    tomba,
    tombaCredits,
    leadrocks,
    leadrocksCredits,
  });
}
