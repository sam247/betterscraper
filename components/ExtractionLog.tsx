interface ExtractionLogProps {
  log: string[];
  running: boolean;
}

export function ExtractionLog({ log, running }: ExtractionLogProps) {
  const text =
    log.length === 0 && !running
      ? "Run an extraction to see log output."
      : log.join("\n") + (running && log.length === 0 ? "\nStarting…" : "");

  return (
    <div className="border-b border-border px-4 py-3 lg:px-6">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
        Extraction log
      </p>
      <div className="max-h-28 overflow-y-auto rounded-md border border-border bg-elevated px-3 py-2 font-mono text-[11px] leading-relaxed text-muted">
        <pre className="m-0 whitespace-pre-wrap break-words">{text}</pre>
      </div>
    </div>
  );
}
