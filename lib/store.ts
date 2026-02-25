import type { NormalisedClinic } from "./places";

let lastResult: {
  results: NormalisedClinic[];
  country: string;
  state: string;
  city: string;
} | null = null;

export function setLastExtraction(
  results: NormalisedClinic[],
  country: string,
  state: string,
  city: string
): void {
  lastResult = { results, country, state, city };
}

export function getLastExtraction(): typeof lastResult {
  return lastResult;
}
