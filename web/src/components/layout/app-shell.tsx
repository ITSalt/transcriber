import { useContext } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FeatureRegistryContext, SlotOutlet } from "./slot";

export function AppShell() {
  const { t } = useTranslation();
  const { navItems } = useContext(FeatureRegistryContext);

  return (
    <div className="flex min-h-screen flex-col" data-testid="app-shell">
      <header className="border-b bg-card shadow-soft">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link
            to="/"
            className="font-display text-xl font-extrabold tracking-tight text-foreground"
          >
            {t("shell.brand")}
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-pill bg-brand align-middle" />
          </Link>

          <nav
            aria-label={t("shell.navLabel")}
            className="flex flex-1 flex-wrap items-center gap-1"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-sm px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    isActive && "bg-accent text-foreground",
                  )
                }
              >
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>

          {/* header.right: workspace switcher / user — empty slot, filled by features */}
          <div
            className="ml-auto flex items-center gap-3"
            data-testid="slot-header-right"
          >
            <SlotOutlet name="header.right" />
          </div>
        </div>
      </header>

      <main className="flex-1" data-testid="app-shell-content">
        <Outlet />
      </main>
    </div>
  );
}
