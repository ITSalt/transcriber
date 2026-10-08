import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/api";

interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  children: ReactNode;
}

/** Loading / error wrapper; 503 means Neo4j is down (MEMORY_UNAVAILABLE). */
export function QueryState({ isLoading, error, children }: QueryStateProps) {
  const { t } = useTranslation(["memory", "translation"]);
  if (isLoading) {
    return <p data-testid="memory-loading">{t("common.loading", { ns: "translation" })}</p>;
  }
  if (error) {
    const unavailable = error instanceof ApiError && error.status === 503;
    return (
      <p role="alert" data-testid={unavailable ? "memory-unavailable" : "memory-error"}>
        {unavailable ? t("unavailable", { ns: "memory" }) : t("loadError", { ns: "memory" })}
      </p>
    );
  }
  return <>{children}</>;
}

export function formatTimecode(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
