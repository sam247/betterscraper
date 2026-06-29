"use client";

export type RunPhase = "idle" | "places" | "emails" | "verify" | "done";

export interface RunProgress {
  phase: RunPhase;
  label: string;
  current: number;
  total: number;
  detail?: string;
}

interface RunProgressBarProps {
  running: boolean;
  progress: RunProgress;
}

export function RunProgressBar({ running, progress }: RunProgressBarProps) {
  if (!running || progress.phase === "idle") return null;

  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;
  const showBar = progress.total > 0;

  return (
    <div className="border-b border-border bg-elevated/40 px-4 py-2.5 lg:px-6">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-fg">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {progress.label}
        </span>
        {showBar && (
          <span className="shrink-0 tabular-nums text-muted">
            {progress.current}/{progress.total}
            <span className="ml-1.5 text-fg">{pct}%</span>
          </span>
        )}
      </div>
      {showBar && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {progress.detail && (
        <p className="mt-1.5 truncate text-[11px] text-muted">{progress.detail}</p>
      )}
    </div>
  );
}
