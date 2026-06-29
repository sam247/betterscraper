"use client";

import { useState } from "react";

interface ExtractionLogProps {
  log: string[];
  running: boolean;
}

export function ExtractionLog({ log, running }: ExtractionLogProps) {
  const [open, setOpen] = useState(false);

  const text =
    log.length === 0 && !running
      ? "Run an extraction to see log output."
      : log.join("\n");

  const summary =
    log.length === 0
      ? running
        ? "Running…"
        : "No output yet"
      : `${log.length} line${log.length === 1 ? "" : "s"}`;

  return (
    <div className="border-b border-border px-4 py-2 lg:px-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 py-1 text-left"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Extraction log
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          {running && (
            <span className="inline-flex items-center gap-1 text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Live
            </span>
          )}
          <span>{summary}</span>
          <span className="text-fg">{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && (
        <div className="mb-2 max-h-36 overflow-y-auto rounded-md border border-border bg-elevated px-3 py-2 font-mono text-[11px] leading-relaxed text-muted">
          <pre className="m-0 whitespace-pre-wrap break-words">{text}</pre>
        </div>
      )}
    </div>
  );
}
