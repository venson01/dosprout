import { redirect } from "next/navigation";

// The app's home is the Tasks page.
export default function Home() {
  redirect("/tasks");
}
