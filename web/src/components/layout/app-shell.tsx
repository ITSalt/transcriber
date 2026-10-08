import { useContext, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { SessionProvider, useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { FeatureRegistryContext, SlotOutlet } from "./slot";

function Brand() {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      className="font-display text-xl font-extrabold tracking-tight text-foreground"
    >
      {t("shell.brand")}
      <span className="ml-1 inline-block h-1.5 w-1.5 rounded-pill bg-brand align-middle" />
    </Link>
  );
}

function Frame({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" data-testid="app-shell">
      <header className="border-b bg-card shadow-soft">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          {header}
        </div>
      </header>
      <main className="flex-1" data-testid="app-shell-content">
        {children}
      </main>
    </div>
  );
}

function SignedInShell() {
  const { t } = useTranslation();
  const { navItems } = useContext(FeatureRegistryContext);

  return (
    <Frame
      header={
        <>
          <Brand />
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

          {/* header.right: workspace switcher / user menu, contributed by features */}
          <div
            className="ml-auto flex items-center gap-3"
            data-testid="slot-header-right"
          >
            <SlotOutlet name="header.right" />
          </div>
        </>
      }
    >
      <Outlet />
    </Frame>
  );
}

/** Everything except /login needs a session: no session (401) → /login?next=<here>. */
function SessionGate() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: me, isLoading, isError, refetch } = useMe();

  if (isLoading) {
    return (
      <Frame header={<Brand />}>
        <p className="container mx-auto px-4 py-8" data-testid="session-loading">
          {t("common.loading")}
        </p>
      </Frame>
    );
  }

  if (isError) {
    return (
      <Frame header={<Brand />}>
        <div className="container mx-auto px-4 py-8" data-testid="session-error">
          <p>{t("common.error")}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      </Frame>
    );
  }

  if (!me) {
    const next = location.pathname + location.search;
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(next)}`}
        replace
      />
    );
  }

  return (
    <SessionProvider me={me}>
      <SignedInShell />
    </SessionProvider>
  );
}

export function AppShell() {
  const { pathname } = useLocation();

  if (pathname === "/login") {
    return (
      <Frame header={<Brand />}>
        <Outlet />
      </Frame>
    );
  }
  return <SessionGate />;
}
