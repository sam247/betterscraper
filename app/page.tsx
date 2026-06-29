"use client";

import { useCallback, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ExtractionLog } from "@/components/ExtractionLog";
import { ResultsTable } from "@/components/ResultsTable";
import { RunConfig, type RunConfigValues } from "@/components/RunConfig";
import { StatsBar } from "@/components/StatsBar";
import { DEFAULT_PRESET_ID, SEARCH_PRESETS } from "@/lib/constants";
import { downloadCsv } from "@/lib/csv";
import type { NormalisedPlace } from "@/lib/places";

const defaultPreset = SEARCH_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;

const initialConfig: RunConfigValues = {
  country: "United States",
  state: "",
  city: "",
  searchTerms: defaultPreset.terms,
  maxResults: 60,
  scrapeEmails: true,
  presetId: DEFAULT_PRESET_ID,
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

    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: config.country.trim() || "United States",
          state: config.state.trim(),
          city: config.city.trim() || undefined,
          searchTerms: terms,
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
      config.country.trim() || "United States",
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
