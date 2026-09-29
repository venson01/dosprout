"use client";

import { Menu, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Notifications } from "./notifications";

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white px-4 py-3 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="rounded-md p-2 text-ink hover:bg-page lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* useSearchParams() must be inside <Suspense> (Next.js rule for static pages). */}
      <Suspense fallback={<div className="w-full max-w-sm" />}>
        {/* key: start fresh when you move to another page */}
        <SearchBox key={pathname} />
      </Suspense>

      <div className="ml-auto flex items-center gap-3">
        <Notifications />
        <div
          aria-hidden
          className="grid size-9 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
        >
          G
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-medium">Guest</p>
          <p className="text-xs text-muted">Not signed in</p>
        </div>
      </div>
    </header>
  );
}

/**
 * Keeps the search text in the URL (?q=...) so the Tasks page can filter by it.
 * On the Tasks page it filters as you type; on other pages press Enter to search.
 */
function SearchBox() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);

  // If something else changes ?q= (like the "Clear" button), show the new text.
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  function handleChange(text: string) {
    setValue(text);
    if (pathname !== "/tasks") return;
    const params = new URLSearchParams(searchParams);
    if (text) params.set("q", text);
    else params.delete("q");
    const query = params.toString();
    // Update the URL without a page load; useSearchParams() still sees the change.
    window.history.replaceState(null, "", query ? `?${query}` : pathname);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pathname !== "/tasks") {
      router.push(value ? `/tasks?q=${encodeURIComponent(value)}` : "/tasks");
    }
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="w-full max-w-sm">
      <SearchInput value={value} onChange={handleChange} />
    </form>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <label className="relative block w-full">
      <span className="sr-only">Search for tasks</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search for tasks..."
        className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}
