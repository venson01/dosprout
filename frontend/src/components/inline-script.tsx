"use client";

/**
 * A <script> that runs once while the browser reads the page's HTML (before the first
 * paint). This is the pattern from the Next.js guide "Preventing flash before hydration":
 * on the server it's a normal script; when React renders it in the browser it becomes
 * type="text/plain" (so React doesn't warn about rendering a script, and it doesn't run
 * twice). suppressHydrationWarning accepts that the two types differ.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
