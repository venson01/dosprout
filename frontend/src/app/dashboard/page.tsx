import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  // The chart reads the URL (?per=week), which Next.js requires to be inside <Suspense>.
  return (
    <Suspense>
      <DashboardView />
    </Suspense>
  );
}
