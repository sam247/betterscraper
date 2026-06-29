"use client";

import { SEARCH_PRESETS } from "@/lib/constants";

export interface RunConfigValues {
  country: string;
  state: string;
  city: string;
  searchTerms: string;
  maxResults: number;
  scrapeEmails: boolean;
  presetId: string;
}

interface RunConfigProps {
  values: RunConfigValues;
  running: boolean;
  error: string | null;
  onChange: (patch: Partial<RunConfigValues>) => void;
  onRun: () => void;
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors placeholder:text-muted focus:border-accent focus:outline-none";

const labelClass = "mb-1.5 block text-xs font-medium text-muted";

export function RunConfig({
  values,
  running,
  error,
  onChange,
  onRun,
}: RunConfigProps) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-surface lg:w-80 lg:border-b-0 lg:border-r">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Configuration
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div>
          <label className={labelClass} htmlFor="preset">
            Preset
          </label>
          <select
            id="preset"
            className={inputClass}
            value={values.presetId}
            onChange={(e) => {
              const preset = SEARCH_PRESETS.find((p) => p.id === e.target.value);
              onChange({
                presetId: e.target.value,
                ...(preset ? { searchTerms: preset.terms } : {}),
              });
            }}
          >
            {values.presetId === "custom" && (
              <option value="custom">Custom</option>
            )}
            {SEARCH_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="country">
            Country
          </label>
          <input
            id="country"
            className={inputClass}
            value={values.country}
            onChange={(e) => onChange({ country: e.target.value })}
            placeholder="United States"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="state">
            State / region
          </label>
          <input
            id="state"
            className={inputClass}
            value={values.state}
            onChange={(e) => onChange({ state: e.target.value })}
            placeholder="Texas, England…"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="city">
            City <span className="text-muted/70">(optional)</span>
          </label>
          <input
            id="city"
            className={inputClass}
            value={values.city}
            onChange={(e) => onChange({ city: e.target.value })}
            placeholder="Austin"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="terms">
            Search terms <span className="text-muted/70">(one per line)</span>
          </label>
          <textarea
            id="terms"
            className={`${inputClass} min-h-[100px] resize-y`}
            value={values.searchTerms}
            onChange={(e) => onChange({ searchTerms: e.target.value, presetId: "custom" })}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="maxResults">
            Max results per term
          </label>
          <input
            id="maxResults"
            type="number"
            min={1}
            max={60}
            className={inputClass}
            value={values.maxResults}
            onChange={(e) => onChange({ maxResults: Number(e.target.value) || 60 })}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.scrapeEmails}
            onChange={(e) => onChange({ scrapeEmails: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-accent"
          />
          <span>Scrape emails from websites</span>
        </label>
      </div>

      <div className="border-t border-border p-4">
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Running…" : "Run extraction"}
        </button>
      </div>
    </aside>
  );
}
