/** "Ada Lovelace" -> "AL", "bob" -> "B". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0]?.[0] ?? "?");
  return letters.toUpperCase();
}

const SIZES = {
  sm: "size-5 text-[10px]",
  md: "size-9 text-sm",
} as const;

/**
 * A round badge with someone's initials. Decorative: always show the person's name
 * next to it (or in an aria-label), since initials alone can be ambiguous.
 */
export function Avatar({ name, size = "md" }: { name: string; size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand ${SIZES[size]}`}
    >
      {initials(name)}
    </span>
  );
}
