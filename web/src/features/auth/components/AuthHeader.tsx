import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";

/** header.right slot: workspace switcher + user menu. */
export function AuthHeader() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const session = useSession();
  if (!session) return null;

  const { me, workspaceId, setWorkspaceId, logout } = session;
  const label = (w: { name: string; personal: boolean }) =>
    w.personal ? `${w.name} (${t("personal")})` : w.name;

  return (
    <>
      {me.workspaces.length > 1 ? (
        <select
          aria-label={t("workspace")}
          data-testid="workspace-switcher"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="h-9 max-w-[12rem] rounded-sm border border-input bg-card px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {me.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {label(w)}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm font-medium" data-testid="workspace-name">
          {me.workspaces[0] ? label(me.workspaces[0]) : ""}
        </span>
      )}

      <div
        className="flex items-center gap-1"
        role="group"
        aria-label={t("userMenu")}
        data-testid="user-menu"
      >
        <span className="text-sm text-muted-foreground" data-testid="user-name">
          {me.user.name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          data-testid="logout-button"
          onClick={() => void logout().then(() => navigate("/", { replace: true }))}
        >
          {t("logout")}
        </Button>
      </div>
    </>
  );
}
