import { NavLink } from "react-router-dom";
import { navigationItems } from "@/data/mock-data";
import { cn } from "@/lib/utils";

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-[76px] shrink-0 border-r border-line bg-warm/86 px-3 py-7 backdrop-blur-xl lg:block">
      <div className="flex h-full flex-col items-center">
        <NavLink
          to="/dashboard"
          className="mb-10 flex h-11 w-11 items-center justify-center rounded-[14px] bg-white text-coral shadow-panel"
          aria-label="Momentum home"
        >
          <span className="text-xl leading-none">M</span>
        </NavLink>

        <nav className="flex flex-col gap-4">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  "flex h-10 w-10 items-center justify-center rounded-[14px] text-stone transition duration-200",
                  "hover:bg-white hover:text-ink hover:shadow-sm",
                  isActive && "bg-white text-coral shadow-sm ring-1 ring-line",
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
