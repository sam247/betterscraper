"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ExtractionLog } from "@/components/ExtractionLog";
import { RunProgressBar, type RunProgress } from "@/components/RunProgressBar";
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
import { partitionForEmailLookup } from "@/lib/website-filter";

const defaultCategory = getPlaceCategory(DEFAULT_CATEGORY_ID)!;
const EMAIL_BATCH_SIZE = 12;
const VERIFY_BATCH_SIZE = 30;

const initialConfig: RunConfigValues = {
  country: DEFAULT_COUNTRY,
  state: "",
  city: "",
  searchTerms: defaultCategory.label,
  maxResults: 60,
  scrapeEmails: true,
  emailSource: "tomba-then-scrape",
  onlyWithEmail: false,
  verifyWithLeadRocks: false,
  skipDirectorySites: true,
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

interface VerifyResponse {
  log: string[];
  results: NormalisedPlace[];
  validEmails: number;
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

const idleProgress: RunProgress = {
  phase: "idle",
  label: "",
  current: 0,
  total: 0,
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
  const [tombaConfigured, setTombaConfigured] = useState(false);
  const [leadrocksConfigured, setLeadrocksConfigured] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [runProgress, setRunProgress] = useState<RunProgress>(idleProgress);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        const hasTomba = !!data.tomba;
        const hasLeadRocks = !!data.leadrocks;
        setTombaConfigured(hasTomba);
        setLeadrocksConfigured(hasLeadRocks);
        setConfig((prev) => {
          if (!hasTomba && prev.emailSource !== "scrape") {
            return { ...prev, emailSource: "scrape" };
          }
          return prev;
        });
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
    setRunProgress({ phase: "places", label: "Searching Google Places", current: 0, total: 0 });

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

    const areaCount = subAreas?.length ?? 1;
    const placesSteps = areaCount * terms.length;

    try {
      if (subAreas && subAreas.length > 0) {
        buildLog.push(
          `Area split: ${subAreas.length} boroughs × ${terms.length} term(s) (up to ${PLACES_MAX_PER_TERM} each).`
        );
        setLog([...buildLog]);
        setRunProgress({
          phase: "places",
          label: "Searching Google Places",
          current: 0,
          total: placesSteps,
        });

        for (let i = 0; i < subAreas.length; i++) {
          const area = subAreas[i];
          buildLog.push(`--- [${i + 1}/${subAreas.length}] ${area} ---`);
          setLog([...buildLog]);

          for (let t = 0; t < terms.length; t++) {
            setRunProgress({
              phase: "places",
              label: "Searching Google Places",
              current: i * terms.length + t,
              total: placesSteps,
              detail: `${area} · ${terms[t]}`,
            });
          }

          const data = await runPlacesBuild(area);
          rawTotal += data.totalResults ?? 0;
          mergePlaces(merged, data.results || []);
          buildLog.push(...(data.log || []));
          setLog([...buildLog]);
          setResults(Array.from(merged.values()));
          setTotalResults(rawTotal);
          setDedupedCount(merged.size);
        }
        setRunProgress({
          phase: "places",
          label: "Places search complete",
          current: placesSteps,
          total: placesSteps,
        });
      } else {
        setRunProgress({
          phase: "places",
          label: "Searching Google Places",
          current: 0,
          total: 1,
          detail: terms.join(", "),
        });
        const data = await runPlacesBuild();
        rawTotal = data.totalResults ?? 0;
        mergePlaces(merged, data.results || []);
        buildLog.push(...(data.log || []));
        setLog(buildLog);
        setResults(Array.from(merged.values()));
        setTotalResults(rawTotal);
        setDedupedCount(merged.size);
        setRunProgress({
          phase: "places",
          label: "Places search complete",
          current: 1,
          total: 1,
        });
      }

      let places = Array.from(merged.values());

      if (!config.scrapeEmails || places.length === 0) {
        setLog((prev) => [...prev, "Done."]);
        setRunProgress({ phase: "done", label: "Complete", current: 1, total: 1 });
        return;
      }

      const useTomba =
        config.emailSource !== "scrape" && tombaConfigured;
      const useScrape = config.emailSource !== "tomba";
      if (config.emailSource !== "scrape" && !tombaConfigured) {
        setError("Tomba cascade selected but API keys are not configured.");
        return;
      }

      const { eligible, skippedNoWebsite, skippedDirectory } =
        partitionForEmailLookup(places, {
          skipDirectorySites: config.skipDirectorySites,
        });

      setLog((prev) => [
        ...prev,
        useTomba && useScrape
          ? "Finding emails: Tomba → scrape fallback…"
          : useTomba
            ? "Looking up emails via Tomba…"
            : "Scraping emails from websites…",
        `Email targets: ${eligible.length} sites (${skippedNoWebsite} no website, ${skippedDirectory} directory/social skipped).`,
      ]);

      const byId = new Map(places.map((p) => [p.place_id, { ...p }]));
      let totalEmailsFound = 0;
      const emailTotal = eligible.length;

      setRunProgress({
        phase: "emails",
        label: "Finding emails",
        current: 0,
        total: emailTotal,
      });

      for (let i = 0; i < eligible.length; i += EMAIL_BATCH_SIZE) {
        const batch = eligible.slice(i, i + EMAIL_BATCH_SIZE);
        const batchNum = Math.floor(i / EMAIL_BATCH_SIZE) + 1;
        const batchTotal = Math.ceil(eligible.length / EMAIL_BATCH_SIZE);

        setRunProgress({
          phase: "emails",
          label: "Finding emails",
          current: i,
          total: emailTotal,
          detail: `Batch ${batchNum}/${batchTotal} · ${batch.length} sites`,
        });
        setLog((prev) => [
          ...prev,
          `Email batch ${batchNum}/${batchTotal} (${batch.length} sites)…`,
        ]);

        const emailRes = await fetch("/api/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            results: batch,
            useTomba,
            useScrape,
            skipDirectorySites: config.skipDirectorySites,
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
        setLog((prev) => [...prev, ...(emailData.log || [])]);
        setResults(Array.from(byId.values()));
        setEmailsFound(totalEmailsFound);
        setRunProgress({
          phase: "emails",
          label: "Finding emails",
          current: Math.min(i + batch.length, emailTotal),
          total: emailTotal,
          detail: `${totalEmailsFound} found so far`,
        });
      }

      places = Array.from(byId.values());

      if (
        config.verifyWithLeadRocks &&
        leadrocksConfigured &&
        places.some((r) => r.email?.trim())
      ) {
        setLog((prev) => [...prev, "Verifying emails with LeadRocks…"]);

        const withEmail = places.filter((r) => r.email?.trim());
        const verifyById = new Map(places.map((p) => [p.place_id, { ...p }]));
        const verifyTotal = withEmail.length;

        setRunProgress({
          phase: "verify",
          label: "Verifying emails",
          current: 0,
          total: verifyTotal,
        });

        for (let i = 0; i < withEmail.length; i += VERIFY_BATCH_SIZE) {
          const batch = withEmail.slice(i, i + VERIFY_BATCH_SIZE);
          setLog((prev) => [
            ...prev,
            `Verify batch ${Math.floor(i / VERIFY_BATCH_SIZE) + 1}/${Math.ceil(withEmail.length / VERIFY_BATCH_SIZE)} (${batch.length} leads)…`,
          ]);

          const verifyRes = await fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ results: batch, onlyValid: true }),
          });

          const verifyData = await readApiJson<VerifyResponse>(verifyRes);
          if (!verifyRes.ok) {
            throw new Error(
              verifyData.error ||
                "Email verification failed partway through. Partial results are shown."
            );
          }

          const verifiedIds = new Set(
            (verifyData.results || []).map((r) => r.place_id)
          );
          for (const row of verifyData.results || []) {
            verifyById.set(row.place_id, row);
          }
          for (const row of batch) {
            if (!verifiedIds.has(row.place_id)) {
              verifyById.set(row.place_id, { ...row, email: "" });
            }
          }

          totalEmailsFound = Array.from(verifyById.values()).filter((r) =>
            r.email?.trim()
          ).length;
          setLog((prev) => [...prev, ...(verifyData.log || [])]);
          setResults(Array.from(verifyById.values()));
          setEmailsFound(totalEmailsFound);
          setRunProgress({
            phase: "verify",
            label: "Verifying emails",
            current: Math.min(i + batch.length, verifyTotal),
            total: verifyTotal,
            detail: `${totalEmailsFound} valid so far`,
          });
        }

        places = Array.from(verifyById.values()).filter((r) => r.email?.trim());
        setResults(places);
        setDedupedCount(places.length);
        setEmailsFound(places.length);
        setLog((prev) => [
          ...prev,
          `LeadRocks: ${places.length} leads with valid email.`,
        ]);
      }

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
      setRunProgress({ phase: "done", label: "Complete", current: 1, total: 1 });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request failed. Try fewer areas or disable email-only filter."
      );
    } finally {
      setRunning(false);
      setStatusRefreshKey((k) => k + 1);
      setRunProgress((prev) =>
        prev.phase === "done" ? prev : idleProgress
      );
    }
  }, [config, runPlacesBuild, tombaConfigured, leadrocksConfigured]);

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
          leadrocksConfigured={leadrocksConfigured}
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
          <RunProgressBar running={running} progress={runProgress} />
          <ExtractionLog log={log} running={running} />
          <ResultsTable results={results} running={running} onExport={exportCsv} />
        </main>
      </div>
    </div>
  );
}
