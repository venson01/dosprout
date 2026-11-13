"use client";

import {
  AlarmClock,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  CircleCheck,
  ListTodo,
  LogOut,
  Settings,
  Sprout,
  Star,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId } from "react";
import { useAuth } from "@/hooks/auth-context";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: ChartColumn },
  // These two span all your teams (the other pages show the current team).
  { href: "/today", label: "Today", icon: CalendarCheck },
  { href: "/my-work", label: "My work", icon: ListTodo },
  { href: "/tasks", label: "Tasks", icon: CircleCheck },
  { href: "/goals", label: "Goals", icon: Star },
  { href: "/time", label: "Time", icon: AlarmClock },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/team", label: "Team", icon: Users },
  { href: "/organization", label: "Organization", icon: Building2 },
];

interface SidebarProps {
  /** Only used on small screens, where the sidebar slides in as a drawer. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { logOut } = useAuth();

  return (
    <>
      {/* Dark overlay behind the drawer on small screens */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 pb-6 pt-7">
          <Link href="/tasks" onClick={onClose} className="flex items-center gap-1.5 text-xl font-semibold">
            DoSprout
            <Sprout className="size-5 text-brand" strokeWidth={2.5} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <TeamSwitcher onSwitch={onClose} />

        <nav className="flex flex-1 flex-col justify-between pb-6">
          <ul>
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} onNavigate={onClose} />
              </li>
            ))}
          </ul>
          <ul>
            <li>
              <NavLink item={{ href: "/settings", label: "Settings", icon: Settings }} onNavigate={onClose} />
            </li>
            <li>
              <button
                type="button"
                onClick={logOut}
                className="flex w-full items-center gap-3 px-6 py-2.5 text-[15px] text-white/80 transition-colors hover:bg-white/5 hover:text-white"
              >
                <LogOut className="size-5" />
                Log Out
              </button>
            </li>
          </ul>
        </nav>
      </aside>
    </>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 px-6 py-2.5 text-[15px] transition-colors ${
        active ? "bg-sidebar-active text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon className="size-5" />
      {item.label}
    </Link>
  );
}

// The value of the "create a team" choice in the switcher (team ids are numbers).
const NEW_TEAM = "new";

/**
 * Picks which team the app shows: your personal space or one of your teams.
 * A plain <select>, so it works with the keyboard and screen readers out of the box.
 * Teams in an organization are grouped under its name (<optgroup>).
 */
function TeamSwitcher({ onSwitch }: { onSwitch: () => void }) {
  const { teams, organizations, team, switchTeam } = useAuth();
  const personal = teams.filter((t) => t.personal);
  const onTheirOwn = teams.filter((t) => !t.personal && t.organizationId === null);
  const option = (t: (typeof teams)[number]) => (
    <option key={t.id} value={t.id}>
      {t.personal ? "Personal (just you)" : t.name}
    </option>
  );
  const router = useRouter();
  const id = useId();

  function handleChange(value: string) {
    if (value === NEW_TEAM) {
      router.push("/team#new-team");
    } else {
      switchTeam(Number(value));
    }
    onSwitch();
  }

  return (
    <div className="px-6 pb-5">
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/60">
        Space
      </label>
      <select
        id={id}
        value={team.id}
        onChange={(event) => handleChange(event.target.value)}
        // The options get normal page colors: on some systems the list is drawn white.
        className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-brand focus:ring-2 focus:ring-brand/40 [&_option]:bg-surface [&_option]:text-ink"
      >
        {personal.map(option)}
        {onTheirOwn.length > 0 && <optgroup label="Teams">{onTheirOwn.map(option)}</optgroup>}
        {organizations.map((organization) => {
          const inIt = teams.filter((t) => t.organizationId === organization.id);
          return (
            inIt.length > 0 && (
              <optgroup key={organization.id} label={organization.name}>
                {inIt.map(option)}
              </optgroup>
            )
          );
        })}
        <option value={NEW_TEAM}>+ Create a team...</option>
      </select>
    </div>
  );
}
