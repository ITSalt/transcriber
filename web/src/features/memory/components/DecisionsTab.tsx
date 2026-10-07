import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useDecisions } from "../api";
import { QueryState } from "./QueryState";

export function DecisionsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation("memory");
  const { data, isLoading, error } = useDecisions(projectId);

  return (
    <QueryState isLoading={isLoading} error={error}>
      {data && data.items.length === 0 ? (
        <p data-testid="decisions-empty">{t("decisions.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="decisions-list">
          {data?.items.map((d) => (
            <li key={d.id} className="rounded-md border p-3" data-testid={`decision-${d.code}`}>
              <span className="font-mono">{d.code}</span> <span>{d.text}</span>
              {d.superseded_by && (
                <span className="text-sm"> ({t("decisions.supersededBy", { code: d.superseded_by })})</span>
              )}
              {d.quote && <blockquote className="border-l-2 pl-2 text-sm italic">{d.quote}</blockquote>}
              {d.meeting_id && (
                <Link className="text-sm underline" to={`/meetings/${d.meeting_id}`}>
                  {new Date(d.created_at).toLocaleDateString()}
                </Link>
              )}
              {d.leads_to.length > 0 && (
                <p className="text-sm">
                  {t("decisions.leadsTo")}: {d.leads_to.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
