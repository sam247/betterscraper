import type { NormalisedPlace } from "@/lib/places";

interface StatsBarProps {
  results: NormalisedPlace[];
  totalResults: number;
  dedupedCount: number;
  emailsFound: number;
  locationLabel: string;
  termCount: number;
}

export function StatsBar({
  results,
  totalResults,
  dedupedCount,
  emailsFound,
  locationLabel,
  termCount,
}: StatsBarProps) {
  const withWebsite = results.filter((r) => r.website).length;
  const withPhone = results.filter((r) => r.phone).length;
  const rated = results.filter((r) => r.rating != null);
  const avgRating =
    rated.length > 0
      ? (rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length).toFixed(1)
      : "—";

  const stats = [
    { label: "Raw", value: totalResults },
    { label: "Unique", value: dedupedCount },
    { label: "Emails", value: emailsFound, highlight: true },
    { label: "Phone", value: withPhone },
    { label: "Website", value: withWebsite },
    { label: "Avg rating", value: avgRating },
  ];

  return (
    <div className="border-b border-border px-4 py-4 lg:px-6">
      <div className="mb-3">
        <h1 className="text-lg font-semibold tracking-tight text-fg">
          {locationLabel || "New extraction"}
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          {termCount} search {termCount === 1 ? "term" : "terms"} · Google Places text search
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-md border border-border bg-surface px-3 py-1.5"
          >
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
              {s.label}
            </span>
            <span
              className={`ml-2 text-sm font-medium ${
                s.highlight && Number(s.value) > 0 ? "text-success" : "text-fg"
              }`}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
