import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  // SignupForm reads ?invite=, ?email= and ?next= from the URL, so it must be inside <Suspense>.
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
