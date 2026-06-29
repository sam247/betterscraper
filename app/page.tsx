"use client";

import { useCallback, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ExtractionLog } from "@/components/ExtractionLog";
import { ResultsTable } from "@/components/ResultsTable";
import { RunConfig, type RunConfigValues } from "@/components/RunConfig";
import { StatsBar } from "@/components/StatsBar";
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
    setLog([]);
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

    const category =
      config.categoryId !== "custom"
        ? getPlaceCategory(config.categoryId)
        : undefined;

    const includedTypes =
      category && terms.length === 1 && terms[0] === category.label
        ? [category.id]
        : undefined;

    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: config.country.trim() || DEFAULT_COUNTRY,
          state: config.state.trim(),
          city: config.city.trim() || undefined,
          searchTerms: terms,
          includedTypes,
          maxResults: Number(config.maxResults) || 60,
          scrapeEmails: config.scrapeEmails,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Build failed.");
        setRunning(false);
        return;
      }
      setLog(data.log || []);
      setResults(data.results || []);
      setTotalResults(data.totalResults ?? 0);
      setDedupedCount(data.dedupedCount ?? 0);
      setEmailsFound(data.emailsFound ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
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
