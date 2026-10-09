import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useProjectMeetings } from "./api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** «Встречи» of the project card: meetings filtered by project_id + upload with the project preselected. */
export function ProjectMeetings({ projectId }: { projectId: string }) {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation();
  const { data, isLoading, isError } = useProjectMeetings(projectId);

  return (
    <section className="mb-8" data-testid="project-meetings">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("meetings.title")}</h2>
        <Button asChild size="sm">
          <Link
            to={`/upload?project=${encodeURIComponent(projectId)}`}
            data-testid="project-upload"
          >
            {t("meetings.upload")}
          </Link>
        </Button>
      </div>
      {isLoading && (
        <p className="text-sm text-muted-foreground">{t("meetings.loading")}</p>
      )}
      {isError && (
        <p role="alert" className="text-sm text-red-600">
          {t("meetings.error")}
        </p>
      )}
      {data && data.items.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="project-meetings-empty">
          {t("meetings.empty")}
        </p>
      )}
      {data && data.items.length > 0 && (
        <ul className="grid gap-2">
          {data.items.map((m) => (
            <li key={m.id} data-testid={`project-meeting-${m.id}`}>
              <Link
                to={`/meetings/${m.id}`}
                className="flex items-center justify-between gap-3 rounded-sm border p-3 hover:bg-muted"
              >
                <span>
                  <span className="block font-medium">{m.title ?? m.filename}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(m.uploaded_at)}
                  </span>
                </span>
                <span className="text-xs">
                  {tc(`catalog.status.${m.status}`, { defaultValue: m.status })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
