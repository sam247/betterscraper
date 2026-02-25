import type { NormalisedClinic } from "./places";

let lastResult: {
  results: NormalisedClinic[];
  state: string;
  city: string;
} | null = null;

export function setLastExtraction(
  results: NormalisedClinic[],
  state: string,
  city: string
): void {
  lastResult = { results, state, city };
}

export function getLastExtraction(): typeof lastResult {
  return lastResult;
}
