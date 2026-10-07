import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFeedbackList } from "../api";

export function FeedbackList({
  meetingId,
  enabled,
}: {
  meetingId: string;
  enabled: boolean;
}) {
  const { t } = useTranslation("feedback");
  const { data, isLoading, isError, refetch } = useFeedbackList(
    meetingId,
    enabled,
  );

  return (
    <section data-testid="feedback-list" className="space-y-2 border-t pt-3">
      <h3 className="text-sm font-semibold">{t("list.title")}</h3>

      {isLoading && <p className="text-sm">{t("list.loading")}</p>}
      {isError && (
        <div data-testid="feedback-list-error" className="text-sm">
          <p>{t("list.error")}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("list.retry")}
          </Button>
        </div>
      )}
      {data && data.items.length === 0 && (
        <p data-testid="feedback-list-empty" className="text-sm text-muted-foreground">
          {t("list.empty")}
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className="space-y-2">
          {data.items.map((item) => (
            <li
              key={item.id}
              data-testid="feedback-item"
              className="space-y-1 rounded-sm border p-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{t(`list.kind.${item.kind}`)}</Badge>
                {item.category && (
                  <Badge variant="outline">{t(`category.${item.category}`)}</Badge>
                )}
                <span className="text-muted-foreground">
                  {item.author.name} · {new Date(item.created_at).toLocaleString()} ·{" "}
                  {t("list.version", { n: item.protocol_version_n })}
                </span>
              </div>
              {item.text && (
                <p className="line-clamp-3 whitespace-pre-wrap">{item.text}</p>
              )}
              {item.extracted_counts && !item.extracted_counts.error && (
                <p className="text-muted-foreground">
                  {t("extracted", {
                    comments: item.extracted_counts.comments,
                    revisions: item.extracted_counts.revisions,
                  })}
                </p>
              )}
              {item.file && (
                <a
                  href={item.file.download_path}
                  download={item.file.name}
                  data-testid="feedback-file-link"
                  className="inline-flex items-center gap-1 underline"
                >
                  <Download className="h-3 w-3" />
                  {t("list.download", { name: item.file.name })}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
