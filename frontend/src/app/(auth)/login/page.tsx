import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  // LoginForm reads ?next= from the URL, which Next.js requires to be inside <Suspense>.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
