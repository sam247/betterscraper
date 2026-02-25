"use client";

import { useState, useCallback } from "react";
import type { NormalisedClinic } from "@/lib/places";

const DEFAULT_TERMS = `head lice clinic
lice removal
nit removal
lice treatment`;

export default function Home() {
  const [country, setCountry] = useState("United States");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [searchTerms, setSearchTerms] = useState(DEFAULT_TERMS);
  const [maxResults, setMaxResults] = useState(60);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [results, setResults] = useState<NormalisedClinic[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [dedupedCount, setDedupedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const runExtraction = useCallback(async () => {
    setRunning(true);
    setError(null);
    setLog([]);
    setResults([]);
    setTotalResults(0);
    setDedupedCount(0);

    const terms = searchTerms
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) {
      setError("Add at least one search term.");
      setRunning(false);
      return;
    }
    if (!state.trim()) {
      setError("State / region is required.");
      setRunning(false);
      return;
    }

    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: country.trim() || "United States",
          state: state.trim(),
          city: city.trim() || undefined,
          searchTerms: terms,
          maxResults: Number(maxResults) || 60,
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setRunning(false);
    }
  }, [country, state, city, searchTerms, maxResults]);

  const exportCsv = useCallback(async () => {
    try {
      const res = await fetch("/api/export", { credentials: "same-origin" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Export failed.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="([^"]+)"/);
      const name = match ? match[1] : "lice-clinics.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    }
  }, []);

  const previewRows = results.slice(0, 20);
  const columns = [
    "country",
    "state",
    "city",
    "name",
    "full_address",
    "phone",
    "website",
    "rating",
    "total_reviews",
    "lat",
    "lng",
    "place_id",
    "source_query",
  ] as const;

  return (
    <main className="main-wrap" aria-busy={running}>
      <div className="col-form">
        <h1>Better Scraper</h1>
        {error && <p className="err-msg">{error}</p>}
        <div className="form-row">
          <label htmlFor="country">Country</label>
          <input
            id="country"
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="e.g. United States, United Kingdom"
          />
        </div>
        <div className="form-row">
          <label htmlFor="state">State / region (required)</label>
          <input
            id="state"
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="e.g. Texas, England"
          />
        </div>
        <div className="form-row">
          <label htmlFor="city">City (optional)</label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Austin"
          />
        </div>
        <div className="form-row">
          <label htmlFor="terms">Search terms (one per line)</label>
          <textarea
            id="terms"
            value={searchTerms}
            onChange={(e) => setSearchTerms(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="maxResults">Max results per term</label>
          <input
            id="maxResults"
            type="number"
            min={1}
            max={60}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value) || 60)}
          />
        </div>
        <div className="form-row">
          <button onClick={runExtraction} disabled={running}>
            {running ? "Running…" : "Run Extraction"}
          </button>
        </div>
      </div>

      <div className="col-right">
        <div className="log-wrap">
          <h2>Extraction log</h2>
          <div className="log-inner">
            <pre>
              {log.length === 0 && !running
                ? "Run an extraction to see log output."
                : log.join("\n")}
              {running && log.length === 0 ? "\nRunning…" : ""}
            </pre>
          </div>
        </div>
        <div className="stats-wrap">
          <span>Total: {totalResults}</span>
          <span>Deduplicated: {dedupedCount}</span>
          <button onClick={exportCsv} disabled={results.length === 0}>
            Export CSV
          </button>
        </div>
        <div className="table-wrap">
          <h2>Table preview (first 20 rows)</h2>
          <table className="table-inner">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="table-empty">
                    No results yet. Run an extraction.
                  </td>
                </tr>
              ) : (
                previewRows.map((row, i) => (
                  <tr key={row.place_id + i}>
                    {columns.map((col) => (
                      <td key={col}>
                        {row[col] !== null && row[col] !== undefined
                          ? String(row[col])
                          : ""}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
