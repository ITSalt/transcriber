import { useRef, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiGet, apiPut } from "@/lib/api";
import {
  ProtocolResponse,
  ProtocolSaveRequest,
  ProtocolSaveResponse,
} from "@transcrib/shared";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProtocolViewer } from "./components/ProtocolViewer";
import { ProtocolEditor, type ProtocolEditorHandle } from "./components/ProtocolEditor";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function useProtocol(meetingId: string) {
  return useQuery({
    queryKey: ["protocol", meetingId],
    queryFn: () => apiGet(`/api/meetings/${meetingId}/protocol`, ProtocolResponse),
    enabled: Boolean(meetingId),
  });
}

export default function ProtocolPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const meetingId = id ?? "";

  const { data, isLoading, isError, refetch } = useProtocol(meetingId);

  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const editorHandleRef = useRef<ProtocolEditorHandle | null>(null);

  // Track dirtiness — set when editing mode is entered
  const handleEnterEdit = () => {
    setIsEditing(true);
    setIsDirty(false);
    setSaveSuccess(false);
  };

  // Warn before navigating away with unsaved changes (RQ-031)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const saveMutation = useMutation({
    mutationFn: (body: ProtocolSaveRequest) =>
      apiPut(
        `/api/meetings/${meetingId}/protocol`,
        body,
        ProtocolSaveResponse,
      ),
    onSuccess: (result) => {
      // Patch query cache with updated fields
      queryClient.setQueryData(
        ["protocol", meetingId],
        (old: ProtocolResponse | undefined) =>
          old
            ? {
                ...old,
                version: result.version,
                edit_count: result.edit_count,
                last_edited_at: result.last_edited_at,
              }
            : old,
      );
      setIsEditing(false);
      setIsDirty(false);
      setSaveSuccess(true);
    },
  });

  const handleSave = useCallback(() => {
    const handle = editorHandleRef.current;
    const markdown = handle ? handle.getMarkdown() : (data?.markdown_content ?? "");
    if (!markdown.trim()) return;
    saveMutation.mutate({ markdown_content: markdown });
    setIsDirty(false);
  }, [data?.markdown_content, saveMutation]);

  const handleCancelEdit = () => {
    if (isDirty) {
      if (!window.confirm(t("protocol.unsavedChangesWarning"))) return;
    }
    setIsEditing(false);
    setIsDirty(false);
  };

  const handleBack = () => {
    if (isDirty) {
      if (!window.confirm(t("protocol.unsavedChangesWarning"))) return;
    }
    void navigate(`/meetings/${meetingId}`);
  };

  return (
    <div
      data-testid="protocol-page"
      className="container mx-auto py-8 px-4 max-w-5xl"
    >
      {/* Back button */}
      <div className="mb-4">
        <Button
          variant="outline"
          data-testid="btn-back-to-meeting"
          onClick={handleBack}
        >
          {t("protocol.backToMeeting")}
        </Button>
      </div>

      {isLoading && (
        <p data-testid="protocol-loading">{t("common.loading")}</p>
      )}

      {isError && (
        <div data-testid="protocol-error">
          <p>{t("common.error")}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Header card — metadata */}
          <Card>
            <CardHeader>
              <CardTitle data-testid="protocol-header">
                {t("protocol.header")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Version */}
              <div>
                <span className="text-sm text-muted-foreground">
                  {t("protocol.version")}
                </span>
                <p data-testid="protocol-version" className="font-medium">
                  {data.version}
                </p>
              </div>

              {/* Edit count */}
              <div>
                <span className="text-sm text-muted-foreground">
                  {t("protocol.edit_count")}
                </span>
                <p data-testid="protocol-edit_count" className="font-medium">
                  {data.edit_count}
                </p>
              </div>

              {/* Last edited at */}
              <div>
                <span className="text-sm text-muted-foreground">
                  {t("protocol.last_edited_at")}
                </span>
                <p data-testid="protocol-last_edited_at">
                  {formatDate(data.last_edited_at)}
                </p>
              </div>

              {/* Generated at */}
              <div>
                <span className="text-sm text-muted-foreground">
                  {t("protocol.generated_at")}
                </span>
                <p data-testid="protocol-generated_at">
                  {formatDate(data.generated_at)}
                </p>
              </div>

              {/* Save success indicator */}
              {saveSuccess && (
                <p
                  data-testid="protocol-save-success"
                  className="text-sm text-green-600"
                >
                  {t("protocol.saveSuccess")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {!isEditing ? (
              <Button
                data-testid="btn-edit"
                onClick={handleEnterEdit}
              >
                {t("protocol.editButton")}
              </Button>
            ) : (
              <>
                <Button
                  data-testid="btn-save"
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? t("common.loading") : t("common.save")}
                </Button>
                <Button
                  variant="outline"
                  data-testid="btn-cancel-edit"
                  onClick={handleCancelEdit}
                >
                  {t("common.cancel")}
                </Button>
              </>
            )}

            {/* Export PDF — anchor that triggers file download */}
            <a
              href={`/api/meetings/${meetingId}/protocol/pdf`}
              download
              data-testid="btn-export-pdf"
            >
              <Button variant="outline" asChild={false}>
                {t("protocol.exportPdf")}
              </Button>
            </a>
          </div>

          {/* Protocol content */}
          <Card>
            <CardHeader>
              <CardTitle>{t("protocol.contentLabel")}</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <ProtocolEditor
                  initialValue={data.markdown_content}
                  editorHandleRef={editorHandleRef}
                />
              ) : (
                <ProtocolViewer markdown={data.markdown_content} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
