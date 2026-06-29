import { NavLink } from "react-router-dom";
import { navigationItems, type NavItem } from "@/data/mock-data";
import { cn } from "@/lib/utils";

export function MobileNav() {
  // Grid is a fixed 6-column layout â€” swapping which 6 items show here
  // (rather than expanding to 7 columns) keeps the existing layout intact.
  // Settings now holds the only sign-out control, so it takes priority over
  // "Why" (an audit/explainability page) for the limited mobile slots.
  const mobilePaths = ["/dashboard", "/day", "/calendar", "/recovery", "/reflection", "/settings"];
  const visibleItems = mobilePaths
    .map(path => navigationItems.find(item => item.path === path))
    .filter((item): item is NavItem => Boolean(item));

  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-6 gap-1 rounded-[22px] border border-line bg-white/88 p-2 shadow-panel backdrop-blur-xl lg:hidden">
      {visibleItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          aria-label={item.label}
          className={({ isActive }) =>
            cn(
              "flex h-11 items-center justify-center rounded-[16px] text-stone transition",
              isActive && "bg-soft text-coral",
            )
          }
        >
          <item.icon className="h-[18px] w-[18px]" />
        </NavLink>
      ))}
    </nav>
  );
}


