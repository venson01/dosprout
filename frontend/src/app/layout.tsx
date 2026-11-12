import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { InlineScript } from "@/components/inline-script";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Poppins is the font used in the moodboard. 700 (bold) is for the landing page's big headings.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      {/* The sidebar and top bar are added by app/(app)/layout.tsx, not here, so the landing page doesn't get them. */}
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
