import {
  ArrowRight,
  CalendarDays,
  ChartColumn,
  Check,
  CircleCheck,
  Flower2,
  Leaf,
  Shovel,
  Sparkles,
  Sprout,
  Star,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { AppPreview } from "./app-preview";

/*
  The landing page at "/" (designed in Figma: "DoSprout Landing Page").
  It has no data and no state, so it's a server component: plain HTML + CSS, no JavaScript needed.
  The app itself starts at /tasks (after signing up or logging in).

  Playful touches (floating leaves, swaying sprouts, the drawn underline, card effects) use the
  animations in globals.css. Every moving part has motion-reduce:... so people who turn on
  "reduce motion" on their device get a still page.
*/

// Links in the header that jump to sections further down this page.
const SECTION_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#focus", label: "Focus timer" },
  { href: "#get-started", label: "It's free" },
];

// Each feature card links to the page where you can try it.
const FEATURES: { icon: LucideIcon; title: string; text: string; href: string }[] = [
  {
    icon: CircleCheck,
    title: "Tasks your way",
    text: "A tidy list or a drag-and-drop board, with tags, priorities, dates, and subtasks that move the task along by themselves.",
    href: "/tasks",
  },
  {
    icon: Users,
    title: "Plan together",
    text: "Create a team, invite people with a link, and assign tasks and shared goals to each other.",
    href: "/team",
  },
  {
    icon: Star,
    title: "Goals with real progress",
    text: "Group tasks under a goal and watch its progress bar fill up as you finish them.",
    href: "/goals",
  },
  {
    icon: Timer,
    title: "Time tracking and focus",
    text: "Time any task, or run focus sessions with breaks and a gentle chime when it's time to rest.",
    href: "/time",
  },
  {
    icon: CalendarDays,
    title: "Calendar view",
    text: "See every task from start day to due day on a month calendar. Drag a task to reschedule it.",
    href: "/calendar",
  },
  {
    icon: ChartColumn,
    title: "Dashboard at a glance",
    text: "Spot what's overdue, what's due soon and how much you finished this week.",
    href: "/dashboard",
  },
];

// The three steps grow like a plant: dig, sprout, flower.
const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Shovel,
    title: "Plant a task",
    text: "Give it a title, a due date and a priority. Break big jobs into small subtasks.",
  },
  {
    icon: Sprout,
    title: "Focus on it",
    text: "Start a timer or a focus session. DoSprout counts the time and reminds you to take breaks.",
  },
  {
    icon: Flower2,
    title: "Watch it grow",
    text: "Each finished subtask fills the progress bar, and your dashboard shows how far you've come.",
  },
];

const FOCUS_POINTS = [
  "Focus and break cycle with a gentle chime",
  "Pop-out timer that stays on top",
  "Time tracked per task, day, week and month",
];

const APP_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/goals", label: "Goals" },
  { href: "/time", label: "Time" },
  { href: "/calendar", label: "Calendar" },
];

// Leaves and sparkles floating around the hero heading. A negative delay starts each one at a
// different point of the same animation, so they don't all bob together.
const HERO_DECORATIONS: { icon: LucideIcon; className: string; delay: string }[] = [
  { icon: Leaf, className: "-left-1 top-0 size-7 -rotate-20 text-goal-aqua sm:-left-20 sm:top-6 sm:size-9", delay: "0s" },
  { icon: Sparkles, className: "right-0 top-1 size-6 text-goal-yellow sm:-right-16 sm:size-8", delay: "-2s" },
  { icon: Leaf, className: "hidden -right-24 top-44 size-10 rotate-200 text-low sm:block", delay: "-4s" },
  { icon: Leaf, className: "hidden -left-28 bottom-4 size-6 rotate-45 text-brand/60 sm:block", delay: "-1s" },
  { icon: Sprout, className: "hidden -right-8 -bottom-2 size-8 text-goal-aqua/80 md:block", delay: "-3s" },
];

// Shared classes, so every button looks the same (they match the Figma "Button" component).
const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2";
const PRIMARY = `${BUTTON} bg-brand text-white hover:bg-brand-hover focus-visible:outline-brand`;
const SECONDARY = `${BUTTON} border border-line bg-surface text-ink hover:bg-page focus-visible:outline-brand`;
// White button for blue backgrounds. brand-solid stays dark enough in dark mode (see globals.css).
const INVERSE = `${BUTTON} bg-white text-brand-solid hover:bg-brand-soft focus-visible:outline-white`;

/*
  Feature card effects. The cards are links, so (like the Dashboard's top cards) they lift on
  hover with a shadow and a blue border. "group" lets the icon, the corner glow and the arrow
  inside react to hovering the whole card.
*/
const FEATURE_CARD =
  "group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-8 shadow-sm transition duration-300 ease-out hover:-translate-y-1.5 hover:border-brand/40 hover:shadow-xl hover:shadow-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0";

// Space at the top of each section when a header link jumps to it, so the sticky header doesn't cover it.
const SECTION = "scroll-mt-20 px-4 py-20 sm:px-6 lg:py-30";

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-page text-ink">
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        {/* Wavy edges around the dark section, like rolling hills. */}
        <Wave className="bg-surface text-sidebar" />
        <FocusSection />
        <Wave className="rotate-180 bg-page text-sidebar" />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-1.5 text-xl font-semibold">
      DoSprout
      {/* Sways when the logo link is hovered (the link has the "group" class). */}
      <Sprout
        className="size-5 origin-bottom text-brand group-hover:animate-sway motion-reduce:group-hover:animate-none"
        strokeWidth={2.5}
        aria-hidden
      />
    </span>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="group rounded-md focus-visible:outline-2 focus-visible:outline-brand">
          <Logo />
        </Link>
        {/* The section links only fit from tablet width up; phones can just scroll. */}
        <nav aria-label="Page sections" className="hidden items-center gap-8 md:flex">
          {SECTION_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-muted hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/login" className="rounded-md px-2 py-1 text-sm font-medium text-muted hover:text-ink">
            Log in
          </Link>
          <Link href="/signup" className={`${PRIMARY} px-4 py-2 text-sm sm:px-6 sm:py-3 sm:text-base`}>
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    // "isolate" makes a new layer, so the -z-10 background stays behind the text but above the section color.
    <section className="relative isolate flex flex-col items-center gap-16 overflow-hidden bg-surface px-4 pt-16 pb-20 text-center sm:px-6 lg:pb-24">
      <HeroBackground />

      <div className="relative flex max-w-4xl flex-col items-center gap-6">
        {HERO_DECORATIONS.map(({ icon: Icon, className, delay }, index) => (
          <Icon
            key={index}
            aria-hidden
            style={{ animationDelay: delay }}
            className={`pointer-events-none absolute animate-float motion-reduce:animate-none ${className}`}
          />
        ))}

        <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-4 py-1 text-xs font-medium text-brand">
          <Sprout className="size-3.5 origin-bottom animate-sway motion-reduce:animate-none" aria-hidden />
          Free to use · Plan alone or with your team
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl lg:leading-[1.12]">
          Plant a task.
          <br />
          Watch it grow into <DrawnUnderline>done.</DrawnUnderline>
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted">
          DoSprout keeps your tasks, goals, focus time and calendar in one calm place, so you always know what to
          do next.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className={`${PRIMARY} group`}>
            Start planning
            <ArrowRight
              className="size-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
              aria-hidden
            />
          </Link>
          <a href="#how-it-works" className={SECONDARY}>
            See how it works
          </a>
        </div>
      </div>

      <div className="relative w-full max-w-6xl">
        <AppPreview />
        <PreviewStickers />
      </div>
    </section>
  );
}

/** Soft colored blobs and a faint dot grid behind the hero. Only decoration. */
function HeroBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(var(--color-line)_1.5px,transparent_1.5px)] bg-size-[28px_28px] mask-[radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="absolute -top-40 -left-32 size-112 rounded-full bg-brand-soft blur-3xl" />
      <div className="absolute top-10 -right-40 size-104 rounded-full bg-goal-aqua/10 blur-3xl" />
      <div className="absolute top-112 left-1/3 size-88 rounded-full bg-goal-yellow/10 blur-3xl" />
    </div>
  );
}

/** A hand-drawn-looking green line under a word, which "draws itself" when the page opens. */
function DrawnUnderline({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        aria-hidden
        viewBox="0 0 200 16"
        preserveAspectRatio="none"
        className="absolute -bottom-2 left-0 h-3 w-full text-goal-aqua sm:-bottom-3 sm:h-4"
      >
        {/* pathLength="1" lets the "draw" animation work for any line length (see globals.css). */}
        <path
          d="M3 11 C 40 3, 75 3, 105 9 S 170 15, 197 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          className="animate-draw motion-reduce:animate-none"
        />
      </svg>
    </span>
  );
}

/** Little "notification" stickers that float over the corners of the app preview. */
function PreviewStickers() {
  return (
    <>
      <div
        aria-hidden
        className="absolute -top-6 right-2 rotate-3 animate-float motion-reduce:animate-none sm:-top-7 sm:-right-6"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xl shadow-brand/10">
          <span className="grid size-7 place-items-center rounded-full bg-low-bg text-low">
            <Check className="size-4" strokeWidth={3} />
          </span>
          Task done! Your sprout grew.
          <Sprout className="size-4 text-goal-aqua" />
        </div>
      </div>
      <div
        aria-hidden
        style={{ animationDelay: "-3s" }}
        className="absolute -bottom-6 -left-6 hidden -rotate-3 animate-float motion-reduce:animate-none md:block"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xl shadow-brand/10">
          <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-brand">
            <Timer className="size-4" />
          </span>
          Focus time: 25 min
        </div>
      </div>
    </>
  );
}

/** The small blue label, big heading and optional sentence at the top of a section. */
function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center gap-4 text-center lg:mb-16">
      <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-brand">
        <Leaf className="size-3.5 -rotate-12" aria-hidden />
        {eyebrow}
        <Leaf className="size-3.5 scale-x-[-1] rotate-12" aria-hidden />
      </p>
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {text && <p className="text-lg text-pretty text-muted">{text}</p>}
    </div>
  );
}

function Features() {
  return (
    <section id="features" className={SECTION}>
      <SectionHeading
        eyebrow="FEATURES"
        title="Everything you need to get things done"
        text="One app for the whole journey: plan it, focus on it, finish it, and see how far you've come."
      />
      <ul className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text, href }) => (
          // The <li> fades in while scrolling; the link inside lifts on hover (two elements, so they don't clash).
          <li key={title} className="reveal-on-scroll">
            <Link href={href} className={FEATURE_CARD}>
              {/* A soft glow that appears in the corner on hover */}
              <span
                aria-hidden
                className="pointer-events-none absolute -top-14 -right-14 size-40 rounded-full bg-brand-soft opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              />
              <span className="relative grid size-12 place-items-center rounded-xl bg-brand-soft text-brand transition duration-300 group-hover:-rotate-8 group-hover:scale-110 group-hover:bg-brand group-hover:text-white motion-reduce:transition-none">
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="relative text-xl font-semibold">{title}</h3>
              <p className="relative text-muted">{text}</p>
              <span className="relative mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-brand">
                Try it
                <ArrowRight
                  className="size-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
                  aria-hidden
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className={`${SECTION} bg-surface`}>
      <SectionHeading eyebrow="HOW IT WORKS" title="From idea to done in three steps" />
      <ol className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, index) => (
          /*
            Step cards aren't links, so they don't lift (a lift says "click me"). Instead the
            border turns blue, the number grows a little and the plant icon wakes up and sways.
          */
          <li
            key={title}
            className="reveal-on-scroll group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-line bg-page p-8 transition-colors duration-300 hover:border-brand/40"
          >
            <Icon
              aria-hidden
              className="absolute top-7 right-7 size-12 origin-bottom text-brand/20 transition-colors duration-300 group-hover:animate-sway group-hover:text-brand motion-reduce:group-hover:animate-none"
            />
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-full bg-brand font-medium text-white transition-transform duration-300 group-hover:scale-115 motion-reduce:transition-none"
            >
              {index + 1}
            </span>
            <h3 className="text-xl font-semibold">{title}</h3>
            <p className="text-muted">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A wavy strip. Its own background is the section above; currentColor (text-*) is the wave. */
function Wave({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 56"
      preserveAspectRatio="none"
      className={`block h-10 w-full overflow-visible sm:h-14 ${className}`}
    >
      {/* The fill goes 2 units past the bottom edge (y=58) and overlaps the dark section, so no
          thin light line shows where they meet. */}
      <path
        d="M0 58V30c120 18 240 26 360 16S600 6 720 6s240 22 360 26 240-6 360-22v48Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FocusSection() {
  return (
    // bg-sidebar is dark in both themes, so the white text works in light and dark mode.
    <section id="focus" className="scroll-mt-20 bg-sidebar px-4 py-16 text-white sm:px-6 lg:py-24">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 lg:flex-row lg:gap-16">
        <div className="flex flex-1 flex-col gap-6">
          <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-goal-aqua">
            <Leaf className="size-3.5 -rotate-12" aria-hidden />
            FOCUS MODE
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Stay in the zone, even when the browser is minimized
          </h2>
          <p className="text-lg text-white/70">
            Run focus sessions with short breaks in between. Pop the timer out into a small window that stays on
            top, and get a desktop notification when it&apos;s time to rest.
          </p>
          <ul className="flex flex-col gap-3">
            {FOCUS_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-3">
                <Check className="size-5 shrink-0 text-goal-aqua" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative w-full max-w-md">
          {/* A soft blue glow that breathes behind the timer */}
          <div
            aria-hidden
            className="absolute inset-8 rounded-full bg-brand/40 blur-3xl animate-pulse motion-reduce:animate-none"
          />
          {/* A picture of the focus timer (its buttons are only drawn, so they aren't real buttons). */}
          <div
            role="img"
            aria-label="Focus timer for the task Website Development, with 18 minutes 42 seconds left."
            className="relative flex flex-col items-center gap-6 rounded-3xl bg-sidebar-active p-8 ring-1 ring-white/10 sm:p-12"
          >
            <div aria-hidden className="flex w-full flex-col items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-brand-solid px-3 py-1 text-xs font-medium">Focus</span>
                <span className="text-sm font-medium text-white/70">Website Development</span>
              </div>
              <p className="text-7xl font-bold tracking-tight tabular-nums sm:text-8xl">
                18<span className="animate-pulse motion-reduce:animate-none">:</span>42
              </p>
              <div className="h-1.5 w-full rounded-full bg-white/10">
                <div className="h-full w-1/4 origin-left animate-bar-grow rounded-full bg-brand motion-reduce:animate-none" />
              </div>
              <p className="text-xs text-white/60">5-minute break after this session</p>
              <div className="flex gap-3">
                <span className={`${BUTTON} bg-white text-brand-solid`}>Pause</span>
                <span className={`${BUTTON} bg-brand-solid text-white`}>Pop out</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section id="get-started" className={SECTION}>
      <div className="relative isolate mx-auto flex max-w-6xl flex-col items-center gap-6 overflow-hidden rounded-3xl bg-brand-solid px-6 py-16 text-center text-white sm:px-16">
        {/* Big faint plants and circles in the corners, only decoration */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <Sprout className="absolute -bottom-10 -left-6 size-44 -rotate-12 text-white/10" />
          <Leaf
            style={{ animationDelay: "-2s" }}
            className="absolute top-6 right-10 size-16 rotate-12 animate-float text-white/15 motion-reduce:animate-none"
          />
          <Sparkles className="absolute bottom-8 right-1/4 size-8 animate-pulse text-white/25 motion-reduce:animate-none" />
          <div className="absolute -top-24 -right-24 size-72 rounded-full border-[28px] border-white/5" />
          <div className="absolute -bottom-32 left-1/3 size-64 rounded-full bg-white/5" />
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Your to-do list is ready to sprout
        </h2>
        <p className="max-w-xl text-lg text-pretty text-white/85">
          It&apos;s free and there&apos;s nothing to install. Create an account, add your first task, and invite
          your team when you&apos;re ready.
        </p>
        <Link href="/signup" className={`${INVERSE} group`}>
          Create your free account
          <ArrowRight
            className="size-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
            aria-hidden
          />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-surface px-4 py-12 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2">
            <Link href="/" className="group w-fit rounded-md focus-visible:outline-2 focus-visible:outline-brand">
              <Logo />
            </Link>
            <p className="text-sm font-medium text-muted">Plan it, focus on it, finish it.</p>
          </div>
          <nav aria-label="App pages" className="flex flex-wrap gap-x-8 gap-y-2">
            {APP_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm font-medium text-muted hover:text-ink">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="border-t border-line pt-8 text-xs font-medium text-muted">
          © 2026 DoSprout · Built with Next.js, Fastify and Turso
        </p>
      </div>
    </footer>
  );
}
