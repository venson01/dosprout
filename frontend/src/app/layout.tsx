import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { InlineScript } from "@/components/inline-script";
import { AppShell } from "@/components/layout/app-shell";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Poppins is the font used in the moodboard.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "DoSprout", template: "%s · DoSprout" },
  description: "A simple todo app built with Next.js, Tailwind CSS and Fastify.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script below may add data-theme to <html> before React
    // loads, so React shouldn't treat that difference as an error.
    <html lang="en" className={`${poppins.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies a saved light / dark theme before the first paint (see lib/theme.ts). */}
        <InlineScript html={THEME_SCRIPT} />
      </head>
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
