import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useReviewEvent, useReviewQueue } from "../api";
import { QueryState } from "./QueryState";

export function ReviewQueueTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation("memory");
  const { data, isLoading, error } = useReviewQueue(projectId);
  const review = useReviewEvent(projectId);
  const pendingId = review.isPending ? review.variables?.eventId : null;

  return (
    <QueryState isLoading={isLoading} error={error}>
      {review.isError && (
        <p role="alert" data-testid="review-error">
          {t("review.error", { message: review.error.message })}
        </p>
      )}
      {data && data.items.length === 0 ? (
        <p data-testid="review-empty">{t("review.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="review-list">
          {data?.items.map(({ event, task, meeting_title }) => (
            <li key={event.id} className="rounded-md border p-3" data-testid={`review-item-${event.id}`}>
              <p>
                <span className="font-mono">{task.code}</span> <span className="font-medium">{task.title}</span>
              </p>
              <p className="text-sm font-medium">{t(`field.${event.field}`)}</p>
              <p className="text-sm">
                {t("review.was")}: <span data-testid="review-old">{event.old_value ?? t("detail.empty")}</span>
                {" → "}
                {t("review.became")}: <span data-testid="review-new">{event.new_value ?? t("detail.empty")}</span>
              </p>
              {event.quote && <blockquote className="border-l-2 pl-2 text-sm italic">{event.quote}</blockquote>}
              <p className="text-sm">
                {meeting_title && <span>{t("review.meeting", { title: meeting_title })}</span>}
                {event.confidence !== null && (
                  <span> · {t("review.confidence", { value: Math.round(event.confidence * 100) })}</span>
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  disabled={pendingId === event.id}
                  onClick={() => review.mutate({ eventId: event.id, action: "confirm" })}
                  data-testid={`review-confirm-${event.id}`}
                >
                  {t("review.confirm")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === event.id}
                  onClick={() => review.mutate({ eventId: event.id, action: "reject" })}
                  data-testid={`review-reject-${event.id}`}
                >
                  {t("review.reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
