import Image from "next/image";

export function AppHeader() {
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
      <div className="flex items-center gap-4 text-xs text-muted">
        <span className="hidden sm:inline">Google Places</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          API
        </span>
      </div>
    </header>
  );
}
