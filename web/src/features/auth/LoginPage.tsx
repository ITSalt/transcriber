import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MeResponse } from "@transcrib/shared";
import { ApiError, apiPost } from "@/lib/api";
import { ME_KEY, useMe } from "@/lib/session";
import { PinInput } from "./components/PinInput";

/** Only in-app paths: "/x" yes, "//evil.com" and "https://…" no. */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && raw !== "/login"
    ? raw
    : "/";
}

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const next = safeNext(params.get("next"));
  const { data: existing } = useMe();

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const login = useMutation({
    mutationFn: (value: string) =>
      apiPost("/api/auth/login", { pin: value }, MeResponse),
    onSuccess: (me) => {
      queryClient.setQueryData(ME_KEY, me);
      // D-20: the session is confirmed by GET /api/auth/me, not by the login response alone
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      void navigate(next, { replace: true });
    },
    onError: (e) => {
      setPin("");
      if (e instanceof ApiError && e.status === 423) {
        setBlocked(true);
        setError(e.message); // text comes from the response (D-8)
      } else if (e instanceof ApiError && e.status === 401) {
        setError(t("invalidPin"));
      } else if (e instanceof ApiError && e.status === 400) {
        setError(e.message);
      } else {
        setError(t("failed"));
      }
    },
  });

  if (existing) return <Navigate to={next} replace />;

  return (
    <div
      data-testid="login-page"
      className="mx-auto flex max-w-sm flex-col items-center gap-6 px-4 py-16"
    >
      <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
      <p className="text-center text-muted-foreground">{t("hint")}</p>

      <PinInput
        value={pin}
        onChange={(v) => {
          setPin(v);
          if (error && !blocked) setError(null);
        }}
        onComplete={(v) => login.mutate(v)}
        disabled={blocked || login.isPending}
        invalid={Boolean(error)}
        cellLabel={(n) => t("digit", { n })}
      />

      <p
        role="alert"
        data-testid="login-error"
        className="min-h-6 text-center font-medium text-destructive"
      >
        {error}
      </p>
    </div>
  );
}
