"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ExtractionLog } from "@/components/ExtractionLog";
import { ResultsTable } from "@/components/ResultsTable";
import { RunConfig, type RunConfigValues } from "@/components/RunConfig";
import { StatsBar } from "@/components/StatsBar";
import { readApiJson } from "@/lib/api-client";
import { resolveAreaSplits } from "@/lib/area-splits";
import { DEFAULT_COUNTRY } from "@/lib/countries";
import { downloadCsv } from "@/lib/csv";
import {
  DEFAULT_CATEGORY_ID,
  getPlaceCategory,
} from "@/lib/place-categories";
import { PLACES_MAX_PER_TERM, type NormalisedPlace } from "@/lib/places";

const defaultCategory = getPlaceCategory(DEFAULT_CATEGORY_ID)!;
const EMAIL_BATCH_SIZE = 40;

const initialConfig: RunConfigValues = {
  country: DEFAULT_COUNTRY,
  state: "",
  city: "",
  searchTerms: defaultCategory.label,
  maxResults: 60,
  scrapeEmails: true,
  emailSource: "scrape",
  onlyWithEmail: false,
  splitByArea: true,
  categoryId: DEFAULT_CATEGORY_ID,
};

interface BuildResponse {
  log: string[];
  results: NormalisedPlace[];
  totalResults: number;
  dedupedCount: number;
  error?: string;
}

interface EmailsResponse {
  log: string[];
  results: NormalisedPlace[];
  emailsFound: number;
  error?: string;
}

function mergePlaces(
  target: Map<string, NormalisedPlace>,
  incoming: NormalisedPlace[]
): number {
  let added = 0;
  for (const place of incoming) {
    if (!target.has(place.place_id)) {
      target.set(place.place_id, place);
      added += 1;
    }
  }
  return added;
}

export default function Home() {
  const [config, setConfig] = useState<RunConfigValues>(initialConfig);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [results, setResults] = useState<NormalisedPlace[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [dedupedCount, setDedupedCount] = useState(0);
  const [emailsFound, setEmailsFound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tombaConfigured, setTombaConfigured] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        const hasTomba = !!data.tomba;
        setTombaConfigured(hasTomba);
        if (!hasTomba) {
          setConfig((prev) =>
            prev.emailSource === "tomba" ? { ...prev, emailSource: "scrape" } : prev
          );
        }
      })
      .catch(() => {});
  }, []);

  const locationLabel = useMemo(() => {
    const parts = [config.city, config.state, config.country].filter(Boolean);
    return parts.join(" · ");
  }, [config.city, config.state, config.country]);

  const termCount = useMemo(
    () =>
      config.searchTerms
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean).length,
    [config.searchTerms]
  );

  const handleConfigChange = useCallback((patch: Partial<RunConfigValues>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const runPlacesBuild = useCallback(
    async (cityOverride?: string) => {
      const terms = config.searchTerms
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: config.country.trim() || DEFAULT_COUNTRY,
          state: config.state.trim(),
          city: cityOverride ?? (config.city.trim() || undefined),
          searchTerms: terms,
          maxResults: Math.min(
            PLACES_MAX_PER_TERM,
            Number(config.maxResults) || PLACES_MAX_PER_TERM
          ),
        }),
      });

      const data = await readApiJson<BuildResponse>(res);
      if (!res.ok) {
        throw new Error(data.error || "Places search failed.");
      }
      return data;
    },
    [config]
  );

  const runExtraction = useCallback(async () => {
    setRunning(true);
    setError(null);
    setLog(["Searching Google Places…"]);
    setResults([]);
    setTotalResults(0);
    setDedupedCount(0);
    setEmailsFound(0);

    const terms = config.searchTerms
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    if (terms.length === 0) {
      setError("Add at least one search term.");
      setRunning(false);
      return;
    }
    if (!config.state.trim()) {
      setError("State / region is required.");
      setRunning(false);
      return;
    }

    const country = config.country.trim() || DEFAULT_COUNTRY;
    const state = config.state.trim();
    const subAreas =
      config.splitByArea ? resolveAreaSplits(country, state, config.city) : null;

    const merged = new Map<string, NormalisedPlace>();
    let rawTotal = 0;
    const buildLog: string[] = [];

    try {
      if (subAreas && subAreas.length > 0) {
        buildLog.push(
          `Area split: ${subAreas.length} boroughs × ${terms.length} term(s) (up to ${PLACES_MAX_PER_TERM} each).`
        );
        setLog([...buildLog]);

        for (let i = 0; i < subAreas.length; i++) {
          const area = subAreas[i];
          buildLog.push(`--- [${i + 1}/${subAreas.length}] ${area} ---`);
          setLog([...buildLog]);

          const data = await runPlacesBuild(area);
          rawTotal += data.totalResults ?? 0;
          mergePlaces(merged, data.results || []);
          buildLog.push(...(data.log || []));
          setLog([...buildLog]);
          setResults(Array.from(merged.values()));
          setTotalResults(rawTotal);
          setDedupedCount(merged.size);
        }
      } else {
        const data = await runPlacesBuild();
        rawTotal = data.totalResults ?? 0;
        mergePlaces(merged, data.results || []);
        buildLog.push(...(data.log || []));
        setLog(buildLog);
        setResults(Array.from(merged.values()));
        setTotalResults(rawTotal);
        setDedupedCount(merged.size);
      }

      let places = Array.from(merged.values());

      if (!config.scrapeEmails || places.length === 0) {
        setLog((prev) => [...prev, "Done."]);
        return;
      }

      const useTomba = config.emailSource === "tomba" && tombaConfigured;
      if (config.emailSource === "tomba" && !tombaConfigured) {
        setError("Tomba is selected but API keys are not configured.");
        return;
      }

      setLog((prev) => [
        ...prev,
        useTomba ? "Looking up emails via Tomba…" : "Scraping emails from websites…",
      ]);

      const byId = new Map(places.map((p) => [p.place_id, { ...p }]));
      const emailLog: string[] = [];
      let totalEmailsFound = 0;

      for (let i = 0; i < places.length; i += EMAIL_BATCH_SIZE) {
        const batch = places.slice(i, i + EMAIL_BATCH_SIZE);
        emailLog.push(
          `Email batch ${Math.floor(i / EMAIL_BATCH_SIZE) + 1}/${Math.ceil(places.length / EMAIL_BATCH_SIZE)} (${batch.length} sites)…`
        );
        setLog((prev) => [...prev, ...emailLog.slice(-1)]);

        const emailRes = await fetch("/api/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            results: batch,
            useTomba,
            useScrape: config.emailSource === "scrape",
          }),
        });

        const emailData = await readApiJson<EmailsResponse>(emailRes);
        if (!emailRes.ok) {
          throw new Error(
            emailData.error ||
              "Email scraping failed partway through. Partial results are shown."
          );
        }

        for (const row of emailData.results || []) {
          byId.set(row.place_id, row);
        }
        totalEmailsFound = Array.from(byId.values()).filter((r) =>
          r.email?.trim()
        ).length;
        emailLog.push(...(emailData.log || []));
        setLog((prev) => [...prev, ...(emailData.log || [])]);
        setResults(Array.from(byId.values()));
        setEmailsFound(totalEmailsFound);
      }

      places = Array.from(byId.values());

      if (config.onlyWithEmail) {
        const before = places.length;
        places = places.filter((r) => r.email?.trim());
        setLog((prev) => [
          ...prev,
          `Filtered to ${places.length} leads with email (removed ${before - places.length} without).`,
        ]);
        setResults(places);
        setDedupedCount(places.length);
      }

      setEmailsFound(places.filter((r) => r.email?.trim()).length);
      setLog((prev) => [...prev, "Done."]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request failed. Try fewer areas or disable email-only filter."
      );
    } finally {
      setRunning(false);
      setStatusRefreshKey((k) => k + 1);
    }
  }, [config, runPlacesBuild, tombaConfigured]);

  const exportCsv = useCallback(() => {
    downloadCsv(
      results,
      config.country.trim() || DEFAULT_COUNTRY,
      config.state.trim(),
      config.city.trim() || undefined
    );
  }, [results, config.country, config.state, config.city]);

  return (
    <div className="flex h-full min-h-dvh flex-col bg-bg text-fg" aria-busy={running}>
      <AppHeader refreshKey={statusRefreshKey} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <RunConfig
          values={config}
          running={running}
          error={error}
          tombaConfigured={tombaConfigured}
          onChange={handleConfigChange}
          onRun={runExtraction}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <StatsBar
            results={results}
            totalResults={totalResults}
            dedupedCount={dedupedCount}
            emailsFound={emailsFound}
            locationLabel={locationLabel}
            termCount={termCount}
          />
          <ExtractionLog log={log} running={running} />
          <ResultsTable results={results} running={running} onExport={exportCsv} />
        </main>
      </div>
    </div>
  );
}
