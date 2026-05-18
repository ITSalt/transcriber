import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import * as tus from "tus-js-client";
import { apiPost } from "@/lib/api";
import { UploadFinalizeResponse } from "@transcrib/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_SIZE_BYTES = 524_288_000; // 500 MB (RQ-008)

// Map browser MIME types to VideoMimeType enum values used in TUS metadata
const MIME_TO_ENUM: Record<string, string> = {
  "video/mp4": "VIDEO_MP4",
  "video/x-matroska": "VIDEO_MKV",
  "video/quicktime": "VIDEO_MOV",
  "video/webm": "VIDEO_WEBM",
  "video/avi": "VIDEO_AVI",
  "video/x-msvideo": "VIDEO_AVI",
};

const ACCEPTED_MIME_TYPES = Object.keys(MIME_TO_ENUM);

type UploadState = "idle" | "uploading" | "finalizing" | "done" | "error";

export default function UploadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"RU" | "EN" | "">("");
  const [progress, setProgress] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

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

  function handleCancel() {
    if (uploadRef.current) {
      uploadRef.current.abort();
      uploadRef.current = null;
    }
    setUploadState("idle");
    setProgress(0);
    setErrorMsg(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setErrorMsg(null);
    setUploadState("uploading");
    setProgress(0);

    const effectiveTitle = title.trim() || fileBasename(file.name);
    const mimeEnum = MIME_TO_ENUM[file.type] ?? "VIDEO_MP4";

    // Encode metadata as base64 key-value pairs for TUS Upload-Metadata header
    function encodeMetadataValue(value: string): string {
      return btoa(unescape(encodeURIComponent(value)));
    }

    const metadataParts: Record<string, string> = {
      filename: encodeMetadataValue(file.name),
      mime_type: encodeMetadataValue(mimeEnum),
      size_bytes: encodeMetadataValue(String(file.size)),
      title: encodeMetadataValue(effectiveTitle),
    };
    if (language) {
      metadataParts["language"] = encodeMetadataValue(language);
    }

    const metadataHeader = Object.entries(metadataParts)
      .map(([k, v]) => `${k} ${v}`)
      .join(",");

    const upload = new tus.Upload(file, {
      endpoint: "/api/uploads",
      retryDelays: [0, 1000, 3000, 5000],
      metadata: { filename: file.name, filetype: file.type },
      headers: {
        "Upload-Metadata": metadataHeader,
      },
      onProgress(bytesUploaded, bytesTotal) {
        const pct = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
        setProgress(pct);
      },
      onError(error) {
        const msg =
          error instanceof tus.DetailedError && error.originalResponse
            ? (() => {
                try {
                  const body = JSON.parse(
                    error.originalResponse.getBody(),
                  ) as { message?: string };
                  return body.message ?? t("common.error");
                } catch {
                  return t("common.error");
                }
              })()
            : t("common.error");
        setErrorMsg(msg);
        setUploadState("error");
      },
      onSuccess() {
        const uploadUrl = upload.url;
        if (!uploadUrl) {
          setErrorMsg(t("common.error"));
          setUploadState("error");
          return;
        }
        const uploadId = uploadUrl.split("/").pop() ?? "";
        setUploadState("finalizing");
        apiPost(
          `/api/uploads/${uploadId}/finalize`,
          {},
          UploadFinalizeResponse,
        )
          .then((res) => {
            setUploadState("done");
            void navigate(`/meetings/${res.meeting_id}`);
          })
          .catch((err: unknown) => {
            const msg =
              err instanceof Error ? err.message : t("common.error");
            setErrorMsg(msg);
            setUploadState("error");
          });
      },
    });

    uploadRef.current = upload;
    upload.start();
  }

  const isUploading =
    uploadState === "uploading" || uploadState === "finalizing";

  return (
    <div data-testid="upload-page" className="container mx-auto py-8 px-4 max-w-lg">
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
            accept="video/mp4,video/x-matroska,video/quicktime,.mp4,.mkv,.mov"
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
            onValueChange={(v) => setLanguage(v as "RU" | "EN" | "")}
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
            disabled={!file || isUploading}
            data-testid="upload-submit"
          >
            {t("common.upload")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={!isUploading}
            data-testid="upload-cancel"
          >
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
