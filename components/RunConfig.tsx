"use client";

import { COUNTRIES } from "@/lib/countries";
import {
  describeAreaSplit,
  isLondonRegion,
  resolveAreaSplits,
} from "@/lib/area-splits";
import { PLACES_MAX_PER_TERM } from "@/lib/places";
import {
  ALL_PLACE_CATEGORIES,
  getPlaceCategory,
  PLACE_CATEGORY_GROUPS,
} from "@/lib/place-categories";

export interface RunConfigValues {
  country: string;
  state: string;
  city: string;
  searchTerms: string;
  maxResults: number;
  scrapeEmails: boolean;
  onlyWithEmail: boolean;
  splitByArea: boolean;
  categoryId: string;
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
  const areaSplits = resolveAreaSplits(values.country, values.state, values.city);
  const canSplit = areaSplits !== null;

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
          <label className={labelClass} htmlFor="category">
            Category
          </label>
          <select
            id="category"
            className={inputClass}
            value={values.categoryId}
            onChange={(e) => {
              const id = e.target.value;
              if (id === "custom") {
                onChange({ categoryId: "custom" });
                return;
              }
              const category = getPlaceCategory(id);
              onChange({
                categoryId: id,
                ...(category ? { searchTerms: category.label } : {}),
              });
            }}
          >
            <option value="custom">Custom (manual terms only)</option>
            {PLACE_CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted">
            {ALL_PLACE_CATEGORIES.length} Google Maps categories
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="country">
            Country
          </label>
          <select
            id="country"
            className={inputClass}
            value={values.country}
            onChange={(e) => onChange({ country: e.target.value })}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
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
            placeholder="England, Texas…"
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
            placeholder="London, Austin…"
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
            placeholder={"Real estate agency\nLetting agent\nProperty management"}
            onChange={(e) => {
              const next = e.target.value;
              const patch: Partial<RunConfigValues> = { searchTerms: next };
              if (values.categoryId !== "custom") {
                const category = getPlaceCategory(values.categoryId);
                const firstLine =
                  next
                    .split("\n")
                    .map((t) => t.trim())
                    .find(Boolean) ?? "";
                if (category && firstLine !== category.label) {
                  patch.categoryId = "custom";
                }
              }
              onChange(patch);
            }}
          />
          <p className="mt-1 text-[11px] text-muted">
            Pick a category to pre-fill, then add extra terms on new lines.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="maxResults">
            Max results per term
          </label>
          <input
            id="maxResults"
            type="number"
            min={1}
            max={PLACES_MAX_PER_TERM}
            className={inputClass}
            value={values.maxResults}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange({ maxResults: PLACES_MAX_PER_TERM });
                return;
              }
              const n = Number(raw);
              if (Number.isNaN(n)) return;
              onChange({
                maxResults: Math.min(PLACES_MAX_PER_TERM, Math.max(1, Math.round(n))),
              });
            }}
          />
          <p className="mt-1 text-[11px] text-muted">
            Hard cap {PLACES_MAX_PER_TERM} per term (Google Places API). Use multiple
            search terms to collect more — e.g. 3 terms ≈ up to {PLACES_MAX_PER_TERM * 3}{" "}
            unique leads before deduping.
          </p>
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

        {values.scrapeEmails && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.onlyWithEmail}
              onChange={(e) => onChange({ onlyWithEmail: e.target.checked })}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            <span>Only keep leads with email</span>
          </label>
        )}

        {canSplit && (
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.splitByArea}
              onChange={(e) => onChange({ splitByArea: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
            />
            <span>
              Split by borough{" "}
              <span className="block text-[11px] text-muted">
                {isLondonRegion(values.state, values.city)
                  ? describeAreaSplit(areaSplits!)
                  : "Search sub-areas to beat the 60-result cap"}
              </span>
            </span>
          </label>
        )}

        {values.scrapeEmails && (
          <p className="text-[11px] text-muted">
            Google Places has no email field — we scrape websites after search. Many
            agencies use contact forms only; splitting areas + extra terms improves
            coverage.
          </p>
        )}
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
