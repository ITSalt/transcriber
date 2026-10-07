import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { collectFeatures, featureRegistry } from "@/lib/features";
import { createAppRoutes } from "@/App";

beforeAll(async () => {
  await import("@/i18n/config");
});

function renderAt(path: string, registry = featureRegistry) {
  const router = createMemoryRouter(createAppRoutes(registry), {
    initialEntries: [path],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("feature auto-registration (D-15)", () => {
  it("picks up features/*/index.ts through the glob (shell feature)", () => {
    // Contains, not equals: other features add their own items (D-15).
    expect(featureRegistry.navItems.map((n) => n.to)).toEqual(
      expect.arrayContaining(["/catalog", "/upload"]),
    );
  });

  it("a temporary feature contributes route, nav item and slot without touching App.tsx", () => {
    const registry = collectFeatures({
      "../features/shell/index.ts": { navItems: [] },
      "../features/tmp/index.tsx": {
        routes: [{ path: "/tmp", element: <div data-testid="tmp-page" /> }],
        navItems: [{ to: "/tmp", labelKey: "nav.catalog", order: 5 }],
        slots: {
          "header.right": () => <span data-testid="tmp-slot">user</span>,
        },
      },
    });

    renderAt("/tmp", registry);

    expect(screen.getByTestId("tmp-page")).toBeInTheDocument();
    expect(screen.getByTestId("slot-header-right")).toContainElement(
      screen.getByTestId("tmp-slot"),
    );
    expect(screen.getByRole("link", { name: /Встречи|Meetings/ })).toHaveAttribute(
      "href",
      "/tmp",
    );
  });

  it("renders existing pages inside AppShell with an empty header.right slot", () => {
    // Explicit registry: independent of which features exist globally.
    renderAt("/catalog", collectFeatures({}));
    const shell = screen.getByTestId("app-shell");
    expect(shell).toContainElement(screen.getByTestId("catalog-page"));
    expect(screen.getByTestId("slot-header-right")).toBeEmptyDOMElement();
  });
});
