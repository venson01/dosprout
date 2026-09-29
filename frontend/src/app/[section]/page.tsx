import { Construction } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

// Sidebar pages that aren't built yet. Add a real page folder (e.g. app/goals/page.tsx)
// and remove the name from this list when you build one.
const SECTIONS: Record<string, string> = {
  dashboard: "Dashboard",
  goals: "Goals",
  time: "Time",
  calendar: "Calendar",
  settings: "Settings",
};

// Only the names above are valid; anything else shows the 404 page.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SECTIONS).map((section) => ({ section }));
}

export async function generateMetadata(props: PageProps<"/[section]">): Promise<Metadata> {
  const { section } = await props.params;
  return { title: SECTIONS[section] };
}

export default async function ComingSoonPage(props: PageProps<"/[section]">) {
  const { section } = await props.params;
  const title = SECTIONS[section];
  if (!title) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-5 text-2xl font-semibold">{title}</h1>
      <div className="rounded-xl border border-line bg-white p-10 text-center">
        <Construction className="mx-auto size-10 text-brand" />
        <h2 className="mt-3 text-lg font-semibold">Coming soon</h2>
        <p className="mt-1 text-sm text-muted">
          The {title} page hasn&apos;t been built yet. Your tasks are waiting for you.
        </p>
        <Link
          href="/tasks"
          className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Go to Tasks
        </Link>
      </div>
    </div>
  );
}
