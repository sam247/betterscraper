"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

interface TombaCredits {
  finder: { used: number; limit: number };
  verifier: { used: number; limit: number };
  plan?: string;
}

interface StatusResponse {
  places: boolean;
  tomba: boolean;
  tombaCredits: TombaCredits | null;
  leadrocks: boolean;
  leadrocksCredits: number | null;
}

function formatCredits(used: number, limit: number): string {
  if (limit <= 0) return String(used);
  return `${used.toLocaleString()} / ${limit.toLocaleString()}`;
}

interface AppHeaderProps {
  refreshKey?: number;
}

export function AppHeader({ refreshKey = 0 }: AppHeaderProps) {
  const [status, setStatus] = useState<StatusResponse>({
    places: false,
    tomba: false,
    tombaCredits: null,
    leadrocks: false,
    leadrocksCredits: null,
  });

  const loadStatus = useCallback(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: StatusResponse) => setStatus(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus, refreshKey]);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="Better Scraper"
          width={28}
          height={28}
          className="h-7 w-7 rounded-md object-contain"
          priority
        />
        <span className="text-sm font-medium tracking-tight">Better Scraper</span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${status.places ? "bg-success" : "bg-danger"}`}
          />
          Places
        </span>
        {status.tomba && status.tombaCredits ? (
          <>
            <span className="hidden sm:inline text-border">|</span>
            <span title="Tomba Finder credits">
              Finder{" "}
              <span className="font-medium text-fg">
                {formatCredits(
                  status.tombaCredits.finder.used,
                  status.tombaCredits.finder.limit
                )}
              </span>
            </span>
          </>
        ) : status.tomba ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Tomba
          </span>
        ) : null}
        {status.leadrocks && status.leadrocksCredits !== null ? (
          <span title="LeadRocks email verification credits">
            LeadRocks{" "}
            <span className="font-medium text-fg">
              {status.leadrocksCredits.toLocaleString()}
            </span>
          </span>
        ) : status.leadrocks ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            LeadRocks
          </span>
        ) : null}
      </div>
    </header>
  );
}
