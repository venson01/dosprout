import type { Metadata } from "next";
import { InviteView } from "@/components/auth/invite-view";

export const metadata: Metadata = { title: "You're invited" };

/*
  The page an invite link opens: /invite/<token>.
  "(auth)" is a route group like "(app)": the brackets keep it out of the URL. Pages in it
  have no sidebar, and don't require a login.
*/
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  return <InviteView token={token} />;
}
