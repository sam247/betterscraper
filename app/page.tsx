"use client";

import { useCallback, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ExtractionLog } from "@/components/ExtractionLog";
import { ResultsTable } from "@/components/ResultsTable";
import { RunConfig, type RunConfigValues } from "@/components/RunConfig";
import { StatsBar } from "@/components/StatsBar";
import { readApiJson } from "@/lib/api-client";
import { DEFAULT_COUNTRY } from "@/lib/countries";
import { downloadCsv } from "@/lib/csv";
import {
  DEFAULT_CATEGORY_ID,
  getPlaceCategory,
} from "@/lib/place-categories";
import type { NormalisedPlace } from "@/lib/places";

const defaultCategory = getPlaceCategory(DEFAULT_CATEGORY_ID)!;

const initialConfig: RunConfigValues = {
  country: DEFAULT_COUNTRY,
  state: "",
  city: "",
  searchTerms: defaultCategory.label,
  maxResults: 60,
  scrapeEmails: true,
  categoryId: DEFAULT_CATEGORY_ID,
};

interface BuildResponse {
  log: string[];
  results: NormalisedPlace[];
  totalResults: number;
  dedupedCount: number;
}

interface EmailsResponse {
  log: string[];
  results: NormalisedPlace[];
  emailsFound: number;
  error?: string;
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

    try {
      const buildRes = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: config.country.trim() || DEFAULT_COUNTRY,
          state: config.state.trim(),
          city: config.city.trim() || undefined,
          searchTerms: terms,
          maxResults: Number(config.maxResults) || 60,
        }),
      });

      const buildData = await readApiJson<BuildResponse & { error?: string }>(buildRes);
      if (!buildRes.ok) {
        setError(buildData.error || "Places search failed.");
        setLog(buildData.log || []);
        return;
      }

      setLog(buildData.log || []);
      setResults(buildData.results || []);
      setTotalResults(buildData.totalResults ?? 0);
      setDedupedCount(buildData.dedupedCount ?? 0);

      if (!config.scrapeEmails || (buildData.results?.length ?? 0) === 0) {
        setLog((prev) => [...prev, "Done."]);
        return;
      }

      setLog((prev) => [...prev, "Scraping emails from websites…"]);

      const emailRes = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: buildData.results }),
      });

      const emailData = await readApiJson<EmailsResponse>(emailRes);
      if (!emailRes.ok) {
        setError(
          emailData.error ||
            "Places loaded but email scraping failed. You can still export without emails."
        );
        setLog((prev) => [...prev, ...(emailData.log || []), "Email scrape failed."]);
        return;
      }

      setLog((prev) => [...prev, ...(emailData.log || []), "Done."]);
      setResults(emailData.results || buildData.results);
      setEmailsFound(emailData.emailsFound ?? 0);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request failed. The server may have timed out on Vercel — try fewer results."
      );
    } finally {
      setRunning(false);
    }
  }, [config]);

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
      <AppHeader />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <RunConfig
          values={config}
          running={running}
          error={error}
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
