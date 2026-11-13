"use client";

import { useState } from "react";
import { avatarUrl } from "@/lib/api";

/** "Ada Lovelace" -> "AL", "bob" -> "B". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0]?.[0] ?? "?");
  return letters.toUpperCase();
}

const SIZES = {
  sm: "size-5 text-[10px]",
  md: "size-9 text-sm",
  lg: "size-20 text-2xl",
} as const;

/** What the avatar needs to know about someone (a User, Member or OrganizationMember all fit). */
export interface AvatarPerson {
  id: number;
  name: string;
  avatarUpdatedAt: string | null;
}

/**
 * A round picture of someone: their profile picture, or their initials when they have
 * none (or it can't be loaded). Decorative: always show the person's name next to it
 * (or in an aria-label), since a picture or initials alone can be ambiguous.
 */
export function Avatar({ person, size = "md" }: { person: AvatarPerson; size?: keyof typeof SIZES }) {
  const src = person.avatarUpdatedAt ? avatarUrl(person.id, person.avatarUpdatedAt) : null;
  // The picture that failed to load, if any: then show the initials instead of a broken image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && src !== failedSrc) {
    return (
      // A plain <img>, not next/image: the picture is private (it needs the login cookie),
      // and Next's image optimizer fetches pictures from the server, without that cookie.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={`shrink-0 rounded-full bg-brand-soft object-cover ${SIZES[size]}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand ${SIZES[size]}`}
    >
      {initials(person.name)}
    </span>
  );
}
