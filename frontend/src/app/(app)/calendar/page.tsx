import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  // CalendarView reads the URL (?month=), which Next.js requires to be inside <Suspense>.
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}
