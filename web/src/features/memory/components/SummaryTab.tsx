import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useProjectMemory } from "../api";
import { QueryState } from "./QueryState";

export function SummaryTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation("memory");
  const { data, isLoading, error } = useProjectMemory(projectId);

  return (
    <QueryState isLoading={isLoading} error={error}>
      {data && !data.current ? (
        <p data-testid="summary-empty">{t("summary.empty")}</p>
      ) : (
        data?.current && (
          <div className="flex flex-col gap-4">
            <section data-testid="summary-current">
              <h3 className="font-medium">{t("summary.current", { version: data.current.version })}</h3>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{data.current.summary_md}</ReactMarkdown>
              </div>
            </section>
            <section>
              <h3 className="font-medium">{t("summary.history")}</h3>
              <ul data-testid="summary-versions" className="text-sm">
                {data.versions.map((v) => (
                  <li key={v.version}>
                    {t("summary.version", {
                      version: v.version,
                      date: new Date(v.created_at).toLocaleDateString(),
                    })}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )
      )}
    </QueryState>
  );
}
