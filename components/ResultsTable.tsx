"use client";

import { useMemo, useState } from "react";
import type { NormalisedPlace } from "@/lib/places";
import { RESULT_COLUMNS } from "@/lib/constants";

type FilterKey = "all" | "with-email" | "with-phone" | "with-website";

interface ResultsTableProps {
  results: NormalisedPlace[];
  running: boolean;
  onExport: () => void;
}

function cellValue(row: NormalisedPlace, key: keyof NormalisedPlace): string {
  const v = row[key];
  if (v === null || v === undefined) return "";
  return String(v);
}

export function ResultsTable({ results, running, onExport }: ResultsTableProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results.filter((row) => {
      if (filter === "with-email" && !row.email) return false;
      if (filter === "with-phone" && !row.phone) return false;
      if (filter === "with-website" && !row.website) return false;
      if (!q) return true;
      const haystack = [
        row.name,
        row.email,
        row.phone,
        row.website,
        row.full_address,
        row.city,
        row.source_query,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [results, search, filter]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "with-email", label: "With email" },
    { key: "with-phone", label: "With phone" },
    { key: "with-website", label: "With website" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 lg:px-6">
        <input
          type="search"
          placeholder="Search name, email, address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex rounded-md border border-border p-0.5">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                filter === f.key
                  ? "bg-elevated text-fg"
                  : "text-muted hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={results.length === 0}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-bg">
            <tr className="border-b border-border">
              {RESULT_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted ${
                    col.wide ? "min-w-[180px]" : ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Maps
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={RESULT_COLUMNS.length + 1}
                  className="px-3 py-12 text-center text-sm text-muted"
                >
                  {running
                    ? "Extracting places…"
                    : results.length === 0
                      ? "No results yet. Configure and run an extraction."
                      : "No rows match your search or filter."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.place_id}
                  className="border-b border-border-subtle transition-colors hover:bg-elevated/50"
                >
                  {RESULT_COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`max-w-[240px] truncate px-3 py-2 text-fg ${
                        col.key === "email" && row.email ? "text-success" : ""
                      }`}
                      title={cellValue(row, col.key)}
                    >
                      {col.key === "website" && row.website ? (
                        <a
                          href={row.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                        >
                          {row.website.replace(/^https?:\/\//, "")}
                        </a>
                      ) : col.key === "email" && row.email ? (
                        <a href={`mailto:${row.email.split(",")[0]}`} className="hover:underline">
                          {row.email}
                        </a>
                      ) : (
                        cellValue(row, col.key)
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {row.maps_url ? (
                      <a
                        href={row.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        Open
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted lg:px-6">
          Showing {filtered.length} of {results.length} places
        </div>
      )}
    </div>
  );
}
