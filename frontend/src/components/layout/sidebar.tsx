"use client";

import {
  AlarmClock,
  CalendarDays,
  ChartColumn,
  CircleCheck,
  LogOut,
  Settings,
  Sprout,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: ChartColumn },
  { href: "/tasks", label: "Tasks", icon: CircleCheck },
  { href: "/goals", label: "Goals", icon: Star },
  { href: "/time", label: "Time", icon: AlarmClock },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

interface SidebarProps {
  /** Only used on small screens, where the sidebar slides in as a drawer. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
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
              {/* There are no user accounts yet, so logging out isn't possible. */}
              <button
                type="button"
                disabled
                title="Accounts aren't set up yet"
                className="flex w-full cursor-not-allowed items-center gap-3 px-6 py-2.5 text-[15px] text-white/50"
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
