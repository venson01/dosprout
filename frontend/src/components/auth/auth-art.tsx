import { Check, Timer, TrendingUp } from "lucide-react";

// The illustrated blue panel next to the login / sign-up / invite forms (large screens only).
// Everything here is decoration (aria-hidden) apart from the headline and the three points.
// The movement is CSS only (see "Whimsical extras" in globals.css) and stops with "reduce motion".

export type AuthMood = "login" | "signup" | "invite";

const COPY: Record<AuthMood, { title: string; text: string }> = {
  login: {
    title: "Welcome back. Your day is ready to grow.",
    text: "Your plan, your teams and your focus timer are right where you left them.",
  },
  signup: {
    title: "Plant a task. Watch it grow into done.",
    text: "Tasks, goals, focus time and a calendar in one calm place, for you and your teams.",
  },
  invite: {
    title: "Plans grow faster together.",
    text: "Share tasks, goals and a calendar with your team, and see who is doing what.",
  },
};

const POINTS = [
  "Learns how long your tasks really take",
  "Plans your day across all your teams",
  "Free to use, no card needed",
];

/** Turns off every animation below for people who asked their system for less motion. */
const CALM = "motion-reduce:animate-none";

/** The panel's centered column: the same width for the headline, the scene and the points. */
const COLUMN = "mx-auto w-full max-w-md big:max-w-xl huge:max-w-3xl";

/** The round icon badge in a sticker, and the icon inside it (both grow on large monitors). */
const STICKER_BADGE = "grid size-6 shrink-0 place-items-center rounded-full big:size-8 huge:size-10";
const STICKER_ICON = "size-3.5 big:size-4 huge:size-5";

export function AuthArt({ mood }: { mood: AuthMood }) {
  const { title, text } = COPY[mood];
  return (
    // The headline, the sprout scene and the three points sit together in the middle (justify-center),
    // so there's no big empty gap and nothing ends up squashed against the bottom edge.
    // The scene shrinks first when the screen is short (flex-1 + min-h-0), so it always fits.
    // On large monitors ("big:" / "huge:" in globals.css) everything grows, so it doesn't look lost.
    <aside className="relative isolate m-3 hidden min-h-0 flex-col justify-center gap-8 overflow-clip rounded-3xl bg-brand-solid px-8 py-8 text-white lg:flex xl:px-10 big:m-4 big:gap-10 big:rounded-[2rem] big:px-14 huge:m-5 huge:gap-14 huge:px-20">
      <PanelBackground />

      {/* Headline, scene and points share one centered column (COLUMN), so they line up. */}
      <div className={COLUMN}>
        <h2 className="text-2xl leading-tight font-bold tracking-tight text-balance xl:text-[1.75rem] big:text-4xl huge:text-5xl">
          {title}
        </h2>
        <p className="mt-2.5 text-sm text-pretty text-white/80 big:mt-4 big:text-base huge:text-xl">{text}</p>
      </div>

      <GardenScene />

      {/* Only on really short screens does the scene need the room more than these three lines. */}
      <ul
        className={`space-y-2 text-sm [@media(max-height:620px)]:hidden big:space-y-3 big:text-base huge:space-y-4 huge:text-xl ${COLUMN}`}
      >
        {POINTS.map((point) => (
          <li key={point} className="flex items-center gap-2.5 big:gap-3">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/15 big:size-6 huge:size-8">
              <Check className="size-3 big:size-3.5 huge:size-4.5" strokeWidth={3} aria-hidden />
            </span>
            {point}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Big faint rings and a dot grid, so the blue isn't flat. */
function PanelBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.12)_1.5px,transparent_1.5px)] bg-size-[26px_26px] mask-[radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="absolute -top-32 -right-32 size-[28rem] rounded-full border border-white/10" />
      <div className="absolute -top-16 -right-16 size-[20rem] rounded-full border border-white/10" />
      <div className={`absolute -bottom-40 -left-24 size-[26rem] animate-drift rounded-full bg-white/10 blur-3xl ${CALM}`} />
    </div>
  );
}

/**
 * The sprout in its pot, with little app "stickers" floating around it. The scene stretches
 * to the panel's free height, so the stickers are placed in % and the sprout scales with it.
 */
function GardenScene() {
  return (
    // 18rem tall (h-72; bigger on large monitors), but on short screens it shrinks first,
    // down to 10rem (shrink, min-h-40).
    <div
      aria-hidden
      className={`relative h-72 min-h-40 shrink big:h-[26rem] huge:h-[36rem] ${COLUMN}`}
    >
      <Sprout />

      {/* A task that keeps ticking itself off. */}
      <Floating className="top-0 left-0 -rotate-3" delay="0s" popDelay="1.9s">
        <span className="relative grid size-5 shrink-0 place-items-center rounded-full border-2 border-low big:size-6 huge:size-8">
          <span className={`absolute inset-0 grid animate-tick place-items-center rounded-full bg-low ${CALM}`}>
            <Check className={`text-white ${STICKER_ICON}`} strokeWidth={3.5} />
          </span>
        </span>
        <span className="relative">
          Send the project brief
          <span
            className={`absolute top-1/2 left-0 h-0.5 w-full origin-left animate-tick rounded-full bg-muted ${CALM}`}
          />
        </span>
      </Floating>

      {/* "Plan my day": the day's load against your hours. */}
      <Floating className="top-[12%] right-0 w-40 rotate-2 big:w-52 huge:w-72" delay="-2s" popDelay="2.1s">
        <div className="w-full">
          <p className="flex items-center justify-between gap-2">
            Today
            <span className="text-[0.6875rem] font-normal text-muted big:text-xs huge:text-base">5h 10m of 6h</span>
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-soft big:mt-2 big:h-2 huge:h-2.5">
            <div className={`h-full w-[86%] origin-left animate-bar-grow rounded-full bg-brand ${CALM}`} />
          </div>
        </div>
      </Floating>

      {/* Estimate accuracy, the app's signature idea. */}
      <Floating className="bottom-[26%] left-0 rotate-2" delay="-4s" popDelay="2.3s">
        <span className={`bg-goal-violet-bg text-goal-violet ${STICKER_BADGE}`}>
          <TrendingUp className={STICKER_ICON} />
        </span>
        Work tasks: 1.5× longer
      </Floating>

      <Floating className="right-2 bottom-[6%] -rotate-2" delay="-1s" popDelay="2.5s">
        <span className={`bg-brand-soft text-brand ${STICKER_BADGE}`}>
          <Timer className={STICKER_ICON} />
        </span>
        Focus 25:00
      </Floating>
    </div>
  );
}

/**
 * One floating sticker: it pops in (popDelay, after the sprout has grown) and then bobs.
 * Two wrappers because each animation needs its own "transform".
 */
function Floating({
  className,
  delay,
  popDelay,
  children,
}: {
  className: string;
  delay: string;
  popDelay: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`absolute animate-float ${CALM} ${className}`} style={{ animationDelay: delay }}>
      <div
        className={`flex animate-pop items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink shadow-lg shadow-black/15 big:gap-2.5 big:rounded-2xl big:px-4 big:py-3 big:text-sm huge:gap-3 huge:px-5 huge:py-4 huge:text-lg ${CALM}`}
        style={{ animationDelay: popDelay }}
      >
        {children}
      </div>
    </div>
  );
}

// A leaf drawn from its stalk at (0, 0) towards the right; it's placed and mirrored with
// "transform" on a wrapper <g>.
const LEAF = "M0 0 C 18 -26, 54 -28, 74 -8 C 54 10, 18 12, 0 0 Z";
const LEAF_VEIN = "M6 -1 C 26 -7, 46 -9, 66 -8";
// A four-pointed sparkle around (0, 0).
const SPARKLE = "M0 -9 C 1.5 -2, 2 -1.5, 9 0 C 2 1.5, 1.5 2, 0 9 C -1.5 2, -2 1.5, -9 0 C -2 -1.5, -1.5 -2, 0 -9 Z";

const LEAVES = [
  { at: "translate(118 194) scale(-1 1)", delay: "900ms" },
  { at: "translate(123 160) rotate(-12)", delay: "1150ms" },
  { at: "translate(121 126) scale(-0.72 0.72) rotate(12)", delay: "1400ms" },
];

const SPARKLES = [
  { at: "translate(52 96)", delay: "0s", className: "fill-goal-yellow" },
  { at: "translate(190 58) scale(0.7)", delay: "-1s", className: "fill-white" },
  { at: "translate(200 182) scale(0.8)", delay: "-2s", className: "fill-goal-yellow" },
  { at: "translate(40 200) scale(0.6)", delay: "-0.5s", className: "fill-white" },
];

/**
 * The sprout grows when the page opens: the stem draws itself, then each leaf pops out,
 * then the flower opens. After that it sways in the breeze. In SVG, a CSS animation on an
 * element replaces its transform="" attribute, so the position sits on an outer <g> and
 * the animation on an inner one. "transform-fill" makes origin-* use the shape's own box.
 */
function Sprout() {
  return (
    <svg viewBox="0 0 240 300" className="absolute bottom-0 left-1/2 h-full -translate-x-1/2 overflow-visible">
      {SPARKLES.map(({ at, delay, className }) => (
        <g key={at} transform={at}>
          <path
            d={SPARKLE}
            className={`origin-center animate-twinkle transform-fill ${className} ${CALM}`}
            style={{ animationDelay: delay }}
          />
        </g>
      ))}

      {/* Shadow and pot. */}
      <ellipse cx="120" cy="284" rx="72" ry="8" className="fill-black/15" />
      <path d="M82 230 H158 L149 280 H91 Z" className="fill-white/20 stroke-white/40" strokeWidth="2" />
      <rect x="74" y="218" width="92" height="16" rx="5" className="fill-white/30" />

      <g className={`origin-bottom animate-breeze transform-fill ${CALM}`}>
        <path
          d="M120 220 C 112 186, 130 152, 120 92"
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          className={`animate-draw stroke-white ${CALM}`}
        />
        {LEAVES.map(({ at, delay }) => (
          <g key={at} transform={at}>
            <g className={`origin-left animate-pop transform-fill ${CALM}`} style={{ animationDelay: delay }}>
              <path d={LEAF} className="fill-white" />
              <path d={LEAF_VEIN} fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-brand-solid/25" />
            </g>
          </g>
        ))}
        {/* The flower: five yellow petals around a white middle. */}
        <g transform="translate(120 86)">
          <g className={`origin-center animate-pop transform-fill ${CALM}`} style={{ animationDelay: "1700ms" }}>
            {[0, 72, 144, 216, 288].map((angle) => (
              <circle key={angle} cx="0" cy="-10" r="8" transform={`rotate(${angle})`} className="fill-goal-yellow" />
            ))}
            <circle r="6" className="fill-white" />
          </g>
        </g>
      </g>
    </svg>
  );
}
