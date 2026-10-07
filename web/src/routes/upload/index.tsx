import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { apiPost } from "@/lib/api";
import {
  UploadFinalizeResponse,
  UploadInitResponse,
  MAX_UPLOAD_BYTES,
  ACCEPTED_UPLOAD_MIME_TYPES,
} from "@transcrib/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ContextForm } from "@/features/context/ContextForm";
import { putMeetingContext, startMeeting } from "@/features/context/api";
import {
  buildPutRequest,
  emptyDraft,
  isDraftEmpty,
  type ContextDraft,
} from "@/features/context/draft";
import { useLastProtocol } from "@/features/projects/api";
import { currentWorkspaceId } from "@/features/projects/workspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Both limits come from @transcrib/shared so the client and the server cannot
// disagree. These were previously re-declared here — the exact copy-paste the
// shared constants exist to prevent (logged in .tl/release-status.json).
const MAX_SIZE_BYTES = MAX_UPLOAD_BYTES; // RQ-008
const ACCEPTED_MIME_TYPES: readonly string[] = ACCEPTED_UPLOAD_MIME_TYPES;

const CONCURRENCY = 4; // parallel S3 part uploads

// "uploaded" = the file is in storage and the meeting waits for «Начать распознавание»
// (defer_start, D-9); recognition begins only on POST /api/meetings/:id/start.
type UploadState =
  | "idle"
  | "uploading"
  | "finalizing"
  | "uploaded"
  | "starting"
  | "error";

interface MultipartState {
  s3_key: string;
  s3_upload_id: string;
}

export default function UploadPage() {
  const { t } = useTranslation();
  const { t: tc } = useTranslation("context");
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"RU" | "EN" | "">("");
  const [speakerCountInput, setSpeakerCountInput] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContextDraft>(emptyDraft);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const lastProtocol = useLastProtocol(draft.projectId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const multipartStateRef = useRef<MultipartState | null>(null);

  function fileBasename(filename: string): string {
    return filename.replace(/\.[^.]+$/, "");
  }

  function validateFile(f: File): string | null {
    if (f.size > MAX_SIZE_BYTES) {
      return t("upload.errorFileTooLarge");
    }
    if (!ACCEPTED_MIME_TYPES.includes(f.type)) {
      return t("upload.errorUnsupportedMime");
    }
    return null;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setErrorMsg(null);
    setProgress(0);
    setUploadState("idle");
    if (selected && !title) {
      setTitle(fileBasename(selected.name));
    }
  }

  async function handleCancel() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const state = multipartStateRef.current;
    if (state) {
      multipartStateRef.current = null;
      apiPost(
        "/api/uploads/abort",
        {
          s3_key: state.s3_key,
          s3_upload_id: state.s3_upload_id,
          workspace_id: currentWorkspaceId(),
        },
        UploadFinalizeResponse,
      ).catch(() => {});
    }

    setUploadState("idle");
    setProgress(0);
    setErrorMsg(null);
  }

  function parseSpeakerCount(raw: string): { value: number | null; error: string | null } {
    const trimmed = raw.trim();
    if (trimmed === "") return { value: null, error: null };
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      return { value: null, error: t("upload.errorSpeakerCountRange") };
    }
    return { value: n, error: null };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const { value: speakerCount, error: speakerErr } = parseSpeakerCount(speakerCountInput);
    if (speakerErr) {
      setErrorMsg(speakerErr);
      return;
    }

    setErrorMsg(null);
    setUploadState("uploading");
    setProgress(0);

    const effectiveTitle = title.trim() || fileBasename(file.name);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. Init multipart upload
      const init = await apiPost(
        "/api/uploads/init",
        {
          filename: file.name,
          size_bytes: file.size,
          filetype: file.type,
          title: effectiveTitle,
          language: language || null,
          workspace_id: currentWorkspaceId(),
        },
        UploadInitResponse,
      );

      multipartStateRef.current = { s3_key: init.s3_key, s3_upload_id: init.s3_upload_id };

      // 2. Upload parts in parallel batches
      const completedParts: Array<{ part_number: number; etag: string }> = [];

      for (let i = 0; i < init.parts.length; i += CONCURRENCY) {
        if (controller.signal.aborted) throw new Error("cancelled");

        const batch = init.parts.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async ({ part_number, url }) => {
            const start = (part_number - 1) * init.part_size;
            const slice = file.slice(start, start + init.part_size);

            const res = await fetch(url, {
              method: "PUT",
              body: slice,
              signal: controller.signal,
            });

            if (!res.ok) {
              throw new Error(`Part ${part_number} upload failed: ${res.status}`);
            }

            // ETag comes back with double-quotes from S3; strip them
            const etag = (res.headers.get("ETag") ?? "").replace(/"/g, "");
            if (!etag) throw new Error(`Part ${part_number} returned empty ETag`);

            return { part_number, etag };
          }),
        );

        completedParts.push(...batchResults);
        setProgress(Math.round((completedParts.length / init.parts.length) * 100));
      }

      // 3. Complete multipart and finalize meeting
      setUploadState("finalizing");
      const result = await apiPost(
        "/api/uploads/complete",
        {
          s3_key: init.s3_key,
          s3_upload_id: init.s3_upload_id,
          filename: file.name,
          size_bytes: file.size,
          filetype: file.type,
          title: effectiveTitle,
          language: language || null,
          speaker_count: speakerCount,
          parts: completedParts,
          workspace_id: currentWorkspaceId(),
          defer_start: true,
        },
        UploadFinalizeResponse,
      );

      multipartStateRef.current = null;
      setMeetingId(result.meeting_id);
      setUploadState("uploaded");
    } catch (err: unknown) {
      if (controller.signal.aborted) return; // user cancelled — don't show error
      const msg = err instanceof Error ? err.message : t("common.error");
      setErrorMsg(msg);
      setUploadState("error");
    }
  }

  // Context is optional and only sent when the user filled something (skip = start as is).
  async function handleStart() {
    if (!meetingId) return;
    setErrorMsg(null);
    setUploadState("starting");
    try {
      if (!isDraftEmpty(draft)) {
        await putMeetingContext(
          meetingId,
          buildPutRequest(draft, lastProtocol.data?.meeting_id),
        );
      }
      await startMeeting(meetingId);
      void navigate(`/meetings/${meetingId}`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t("common.error"));
      setUploadState("uploaded");
    }
  }

  const isUploading =
    uploadState === "uploading" || uploadState === "finalizing";
  const canStart = uploadState === "uploaded";

  return (
    <div data-testid="upload-page" className="container mx-auto py-8 px-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">{t("upload.heading")}</h1>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* File field */}
        <div className="mb-4">
          <label
            htmlFor="upload-file"
            className="block text-sm font-medium mb-1"
          >
            {t("upload.fieldFile")}
          </label>
          <Input
            id="upload-file"
            type="file"
            accept="video/mp4,video/x-matroska,video/quicktime,video/webm,.mp4,.mkv,.mov,.webm"
            onChange={handleFileChange}
            disabled={isUploading}
            data-testid="upload-input-file"
          />
        </div>

        {/* Title field */}
        <div className="mb-4">
          <label
            htmlFor="upload-title"
            className="block text-sm font-medium mb-1"
          >
            {t("upload.fieldTitle")}
          </label>
          <Input
            id="upload-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isUploading}
            data-testid="upload-input-title"
            placeholder={t("upload.fieldTitlePlaceholder")}
          />
        </div>

        {/* Language field */}
        <div className="mb-4">
          <label
            htmlFor="upload-language-trigger"
            className="block text-sm font-medium mb-1"
          >
            {t("upload.fieldLanguage")}
          </label>
          <Select
            value={language}
            onValueChange={(v) => setLanguage(v === "auto" ? "" : (v as "RU" | "EN" | ""))}
            disabled={isUploading}
          >
            <SelectTrigger
              id="upload-language-trigger"
              data-testid="upload-select-language"
            >
              <SelectValue placeholder={t("upload.fieldLanguagePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t("upload.languageAuto")}</SelectItem>
              <SelectItem value="RU">{t("upload.languageRu")}</SelectItem>
              <SelectItem value="EN">{t("upload.languageEn")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Speaker count field — optional Deepgram diarization pin */}
        <div className="mb-4">
          <label
            htmlFor="upload-speaker-count"
            className="block text-sm font-medium mb-1"
          >
            {t("upload.fieldSpeakerCount")}
          </label>
          <Input
            id="upload-speaker-count"
            type="number"
            min={1}
            max={10}
            step={1}
            inputMode="numeric"
            value={speakerCountInput}
            onChange={(e) => setSpeakerCountInput(e.target.value)}
            disabled={isUploading}
            placeholder={t("upload.fieldSpeakerCountPlaceholder")}
            data-testid="upload-input-speaker-count"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t("upload.fieldSpeakerCountHint")}
          </p>
        </div>

        <ContextForm
          draft={draft}
          onChange={setDraft}
          disabled={uploadState === "starting"}
        />

        {/* Error message */}
        {errorMsg && (
          <p
            role="alert"
            data-testid="upload-error"
            className="text-sm text-red-600 mb-4"
          >
            {errorMsg}
          </p>
        )}

        {/* Progress bar */}
        {isUploading && (
          <div className="mb-4" data-testid="upload-progress-container">
            <Progress value={progress} data-testid="upload-progress" />
            <p className="text-sm mt-1 text-gray-500">
              {uploadState === "finalizing"
                ? t("upload.finalizing")
                : `${progress}%`}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={!file || isUploading || canStart || uploadState === "starting"}
            data-testid="upload-submit"
          >
            {t("common.upload")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleCancel()}
            disabled={!isUploading}
            data-testid="upload-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => void handleStart()}
            disabled={!canStart}
            data-testid="upload-start"
          >
            {uploadState === "starting"
              ? tc("start.starting")
              : tc("start.button")}
          </Button>
        </div>
        <p
          className="mt-2 text-xs text-muted-foreground"
          data-testid="upload-start-hint"
        >
          {!canStart && uploadState !== "starting"
            ? tc("start.hintWaiting")
            : isDraftEmpty(draft)
              ? tc("start.hintSkip")
              : tc("start.hintReady")}
        </p>
      </form>
    </div>
  );
}
