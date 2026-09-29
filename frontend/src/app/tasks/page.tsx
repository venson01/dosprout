import type { Metadata } from "next";
import { Suspense } from "react";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata: Metadata = { title: "My Tasks" };

export default function TasksPage() {
  // TasksView reads the URL (?q=, ?view=), which Next.js requires to be inside <Suspense>.
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  );
}
