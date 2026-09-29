import type { Metadata } from "next";
import { Suspense } from "react";
import { TimeView } from "@/components/time/time-view";

export const metadata: Metadata = { title: "Time" };

export default function TimePage() {
  // The chart reads the URL (?per=week), which Next.js requires to be inside <Suspense>.
  return (
    <Suspense>
      <TimeView />
    </Suspense>
  );
}
