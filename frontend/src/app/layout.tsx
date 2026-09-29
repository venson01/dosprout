import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
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
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
