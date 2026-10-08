import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProtocolVersionSummary } from "@transcrib/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useProtocolVersion, useProtocolVersions } from "../api";
import { diffLines } from "../diff";

interface Props {
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The first GENERATED version is the original; LEGACY means the original was lost. */
function findOriginal(items: ProtocolVersionSummary[]) {
  return items.find((v) => v.kind === "GENERATED") ?? null;
}

export function VersionHistoryDialog({ meetingId, open, onOpenChange }: Props) {
  const { t } = useTranslation("feedback");
  const [selected, setSelected] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);

  const versions = useProtocolVersions(meetingId, open);
  const items = versions.data?.items ?? [];
  const original = findOriginal(items);

  const version = useProtocolVersion(meetingId, selected);
  const originalVersion = useProtocolVersion(
    meetingId,
    compare && original ? original.n : null,
  );

  const diff = useMemo(
    () =>
      compare && version.data && originalVersion.data
        ? diffLines(originalVersion.data.markdown, version.data.markdown)
        : null,
    [compare, version.data, originalVersion.data],
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelected(null);
      setCompare(false);
    }
    onOpenChange(next);
  };

  const view = (n: number, withDiff: boolean) => {
    setSelected(n);
    setCompare(withDiff);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="version-history-dialog"
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t("history.title")}</DialogTitle>
          <DialogDescription>{t("history.description")}</DialogDescription>
        </DialogHeader>

        {versions.isLoading && <p>{t("history.loading")}</p>}
        {versions.isError && (
          <div data-testid="history-error">
            <p>{t("history.error")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void versions.refetch()}
            >
              {t("history.retry")}
            </Button>
          </div>
        )}
        {versions.data && items.length === 0 && (
          <p data-testid="history-empty">{t("history.empty")}</p>
        )}

        {items.length > 0 && (
          <ul className="space-y-2" data-testid="history-list">
            {items.map((v) => (
              <li
                key={v.n}
                data-testid="history-item"
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-sm border p-2 text-sm",
                  selected === v.n && "border-brand",
                )}
              >
                <span className="font-semibold">
                  {t("history.version", { n: v.n })}
                </span>
                <Badge>{t(`history.kind.${v.kind}`)}</Badge>
                {v.n === versions.data?.current_n && (
                  <Badge variant="outline">{t("history.current")}</Badge>
                )}
                <span className="text-muted-foreground">
                  {v.author ? `${t("history.by", { name: v.author.name })} · ` : ""}
                  {new Date(v.created_at).toLocaleString()}
                </span>
                <span className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`history-view-${v.n}`}
                    onClick={() => view(v.n, false)}
                  >
                    {t("history.view")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`history-compare-${v.n}`}
                    onClick={() => view(v.n, true)}
                  >
                    {t("history.compare")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {selected !== null && (
          <section data-testid="history-version" className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {compare
                  ? `${t("history.diffTitle")} — ${t("history.version", { n: selected })}`
                  : `${t("history.markdown")} — ${t("history.version", { n: selected })}`}
              </h3>
              <Button
                size="sm"
                variant="ghost"
                data-testid="history-close"
                onClick={() => setSelected(null)}
              >
                {t("history.close")}
              </Button>
            </div>

            {version.isLoading && <p>{t("history.loading")}</p>}
            {version.isError && <p>{t("history.error")}</p>}

            {!compare && version.data && (
              <pre
                data-testid="history-markdown"
                className="max-h-96 overflow-auto whitespace-pre-wrap rounded-sm bg-muted p-3 text-sm"
              >
                {version.data.markdown}
              </pre>
            )}

            {compare && !original && (
              <p data-testid="history-no-original">{t("history.noOriginal")}</p>
            )}
            {compare && original && (
              <p className="text-xs text-muted-foreground">
                {t("history.original", { n: original.n })}
              </p>
            )}
            {compare && original && !diff && !version.isError && (
              <p>{t("history.loading")}</p>
            )}
            {diff && diff.every((l) => l.op === "same") && (
              <p data-testid="history-identical">{t("history.identical")}</p>
            )}
            {diff && !diff.every((l) => l.op === "same") && (
              <pre
                data-testid="history-diff"
                className="max-h-96 overflow-auto rounded-sm border text-sm"
              >
                {diff.map((l, i) => (
                  <div
                    key={i}
                    data-diff={l.op}
                    className={cn(
                      "whitespace-pre-wrap px-2",
                      l.op === "add" && "bg-green-100 text-green-900",
                      l.op === "del" && "bg-red-100 text-red-900 line-through",
                    )}
                  >
                    {l.op === "add" ? "+ " : l.op === "del" ? "- " : "  "}
                    {l.text}
                  </div>
                ))}
              </pre>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
