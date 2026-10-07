import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FEEDBACK_FILE_MAX_BYTES,
  FeedbackCategory,
  checkFeedbackSubmission,
  type FeedbackCreateResponse,
  type FeedbackFields,
  type FeedbackKind,
  type FeedbackSubmissionError,
} from "@transcrib/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FeedbackApiError, useSubmitFeedback } from "../api";
import { FeedbackList } from "./FeedbackList";

const TABS: { kind: FeedbackKind; tab: "comment" | "corrected" | "docx" }[] = [
  { kind: "COMMENT", tab: "comment" },
  { kind: "CORRECTED_PROTOCOL", tab: "corrected" },
  { kind: "DOCX_REVIEW", tab: "docx" },
];

const SERVER_ERRORS: readonly string[] = [
  "FEEDBACK_TEXT_REQUIRED",
  "FEEDBACK_FILE_REQUIRED",
  "FEEDBACK_FILE_TYPE",
  "FEEDBACK_FILE_TOO_LARGE",
];

const MAX_MB = FEEDBACK_FILE_MAX_BYTES / (1024 * 1024);

interface Props {
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ meetingId, open, onOpenChange }: Props) {
  const { t } = useTranslation("feedback");
  const [kind, setKind] = useState<FeedbackKind>("COMMENT");
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeedbackCreateResponse | null>(null);
  const submit = useSubmitFeedback(meetingId);

  const resetForm = () => {
    setText("");
    setCategory("");
    setFile(null);
    setFileInputKey((k) => k + 1);
  };

  const selectTab = (next: FeedbackKind) => {
    setKind(next);
    setError(null);
    setResult(null);
    setText("");
    setCategory("");
    setFile(null);
    setFileInputKey((k) => k + 1);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setKind("COMMENT");
      setError(null);
      setResult(null);
      resetForm();
    }
    onOpenChange(next);
  };

  const errorMessage = (code: string) =>
    t(`errors.${code}`, { max: MAX_MB, defaultValue: t("errors.generic") });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    const fields: FeedbackFields = {
      kind,
      category:
        kind === "COMMENT" && category
          ? FeedbackCategory.parse(category)
          : null,
      text: text.trim() ? text.trim() : null,
    };
    const problem: FeedbackSubmissionError | null = checkFeedbackSubmission(
      fields,
      file
        ? { fileName: file.name, mime: file.type || "application/octet-stream", sizeBytes: file.size }
        : null,
    );
    if (problem) {
      setError(errorMessage(problem));
      return;
    }
    setError(null);

    submit.mutate(
      { fields, file },
      {
        onSuccess: (created) => {
          setResult(created);
          resetForm();
        },
        onError: (err) => {
          const code = err instanceof FeedbackApiError ? err.code : undefined;
          setError(
            code && SERVER_ERRORS.includes(code)
              ? errorMessage(code)
              : t("errors.generic"),
          );
        },
      },
    );
  };

  const extracted = result?.extracted;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="feedback-dialog"
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div
          role="tablist"
          aria-label={t("tabs.label")}
          className="flex flex-wrap gap-1 border-b"
        >
          {TABS.map(({ kind: k, tab }) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`feedback-tab-${tab}`}
              aria-selected={kind === k}
              aria-controls="feedback-tabpanel"
              data-testid={`feedback-tab-${tab}`}
              onClick={() => selectTab(k)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
                kind === k
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>

        <form
          id="feedback-tabpanel"
          role="tabpanel"
          aria-labelledby={`feedback-tab-${TABS.find((x) => x.kind === kind)!.tab}`}
          onSubmit={handleSubmit}
          className="space-y-3"
          data-testid="feedback-form"
        >
          {kind === "COMMENT" && (
            <>
              <label className="block text-sm font-medium">
                {t("comment.label")}
                <Textarea
                  data-testid="feedback-text"
                  className="mt-1"
                  rows={6}
                  maxLength={200000}
                  placeholder={t("comment.placeholder")}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                {t("category.label")}
                <select
                  data-testid="feedback-category"
                  className="mt-1 flex h-10 w-full rounded-sm border border-[var(--color-input)] bg-card px-3 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">{t("category.none")}</option>
                  {FeedbackCategory.options.map((c) => (
                    <option key={c} value={c}>
                      {t(`category.${c}`)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {kind === "CORRECTED_PROTOCOL" && (
            <>
              <label className="block text-sm font-medium">
                {t("corrected.label")}
                <Textarea
                  data-testid="feedback-text"
                  className="mt-1"
                  rows={8}
                  maxLength={200000}
                  placeholder={t("corrected.placeholder")}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                {t("corrected.or")}
                <input
                  key={fileInputKey}
                  type="file"
                  data-testid="feedback-file"
                  aria-label={t("corrected.file")}
                  accept=".md,.txt,.docx"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </>
          )}

          {kind === "DOCX_REVIEW" && (
            <label className="block text-sm font-medium">
              {t("docx.file")}
              <input
                key={fileInputKey}
                type="file"
                data-testid="feedback-file"
                aria-label={t("docx.file")}
                accept=".docx"
                className="mt-1 block w-full text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}

          {error && (
            <p
              role="alert"
              data-testid="feedback-error"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {result && (
            <div
              role="status"
              data-testid="feedback-success"
              className="space-y-1 text-sm text-green-600"
            >
              <p>{t("sent")}</p>
              {kind === "DOCX_REVIEW" && extracted && (
                <p data-testid="feedback-extracted">
                  {extracted.error
                    ? t("extractedError")
                    : t("extracted", {
                        comments: extracted.comments.length,
                        revisions: extracted.revisions.length,
                      })}
                </p>
              )}
            </div>
          )}

          <Button
            type="submit"
            data-testid="feedback-submit"
            disabled={submit.isPending}
          >
            {submit.isPending ? t("sending") : t("submit")}
          </Button>
        </form>

        <FeedbackList meetingId={meetingId} enabled={open} />
      </DialogContent>
    </Dialog>
  );
}
