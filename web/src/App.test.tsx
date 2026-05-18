import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import CatalogPage from "@/routes/catalog";

// i18n must be initialised before rendering
beforeAll(async () => {
  await import("./i18n/config");
});

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("App", () => {
  it("renders CatalogPage without crashing", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
      [{ path: "/", element: <CatalogPage /> }, { path: "/upload", element: <div /> }],
      { initialEntries: ["/"] },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("catalog-page")).toBeInTheDocument();
  });

  it("RouterProvider renders catalog route via memory router", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
      [{ path: "/catalog", element: <CatalogPage /> }],
      { initialEntries: ["/catalog"] },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("catalog-page")).toBeInTheDocument();
  });
});
