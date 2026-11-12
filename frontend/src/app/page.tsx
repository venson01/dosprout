import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  // "absolute" skips the "%s · DoSprout" title template from layout.tsx.
  title: { absolute: "DoSprout · Plant a task, watch it grow" },
  description:
    "A free, calm todo app: tasks on a list or board, subtasks, goals, a focus timer, a calendar and a dashboard.",
};

// The landing page. The app itself starts at /tasks (in the app/(app) folder).
export default function Home() {
  return <LandingPage />;
}
