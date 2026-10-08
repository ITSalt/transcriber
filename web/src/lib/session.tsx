import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MeResponse } from "@transcrib/shared";
import {
  ApiError,
  apiGet,
  apiPostNoContent,
  onUnauthorized,
  setWorkspaceIdProvider,
} from "@/lib/api";

/** TanStack Query key of the current session; the only entry kept on workspace switch. */
export const ME_KEY = ["auth", "me"] as const;

const WORKSPACE_STORAGE_KEY = "transcrib.workspace";

function readStoredWorkspace(): string | null {
  try {
    return localStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeWorkspace(id: string): void {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
  } catch {
    // storage unavailable — the choice lasts until reload
  }
}

/** `null` = no valid session (401). */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await apiGet("/api/auth/me", MeResponse);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export interface Session {
  me: MeResponse;
  /** selected workspace: the stored one if the user still belongs to it, else the first */
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

/** Session of the signed-in user; null outside `SessionProvider` (e.g. isolated page tests). */
export function useSession(): Session | null {
  return useContext(SessionContext);
}

/** Selected workspace id, or undefined outside a session. */
export function useWorkspaceId(): string | undefined {
  return useContext(SessionContext)?.workspaceId;
}

export function SessionProvider({
  me,
  children,
}: {
  me: MeResponse;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [stored, setStored] = useState<string | null>(readStoredWorkspace);

  const workspaceId = useMemo(() => {
    const first = me.workspaces[0]?.id ?? "";
    return me.workspaces.some((w) => w.id === stored) ? (stored as string) : first;
  }, [me, stored]);

  // uploads (and anything else without its own context) read the selection here
  useEffect(() => {
    setWorkspaceIdProvider(() => workspaceId || undefined);
    return () => setWorkspaceIdProvider(() => undefined);
  }, [workspaceId]);

  // any 401 → session is gone; the guard in AppShell redirects to /login
  useEffect(
    () => onUnauthorized(() => queryClient.setQueryData(ME_KEY, null)),
    [queryClient],
  );

  const setWorkspaceId = useCallback(
    (id: string) => {
      if (id === workspaceId) return;
      storeWorkspace(id);
      setStored(id);
      // drop everything cached for the previous workspace, keep the session
      queryClient.removeQueries({
        predicate: (q) => q.queryKey[0] !== ME_KEY[0],
      });
    },
    [queryClient, workspaceId],
  );

  const logout = useCallback(async () => {
    try {
      await apiPostNoContent("/api/auth/logout");
    } finally {
      // forget everything; the next /api/auth/me decides: 401 → login screen,
      // 200 → legacy mode (AUTH_REQUIRED=false, D-20) keeps working without sign-in
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ me, workspaceId, setWorkspaceId, logout }),
    [me, workspaceId, setWorkspaceId, logout],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
