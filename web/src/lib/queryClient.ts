import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      // 4xx is an answer (401 no session, 404 not found), not a transient failure
      retry: (count, e) =>
        !(e instanceof ApiError && e.status >= 400 && e.status < 500) &&
        count < 1,
      refetchOnWindowFocus: false,
    },
  },
});
