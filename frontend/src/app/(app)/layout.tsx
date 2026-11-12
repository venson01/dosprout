import { AppShell } from "@/components/layout/app-shell";

/*
  Layout for the app pages (Dashboard, Tasks, Goals, Time, Calendar, Settings).
  "(app)" is a route group: the brackets keep the folder name out of the URL, so these pages
  stay at /tasks, /goals, ... but they get the sidebar and top bar, and the landing page at /
  (outside this folder) doesn't.
*/
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
