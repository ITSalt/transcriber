import * as React from "react";

type ToastVariant = "default" | "destructive";

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type ToastAction =
  | { type: "ADD"; toast: ToastItem }
  | { type: "REMOVE"; id: string };

function reducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case "ADD":
      return [...state, action.toast];
    case "REMOVE":
      return state.filter((t) => t.id !== action.id);
    default:
      return state;
  }
}

const ToastContext = React.createContext<{
  toasts: ToastItem[];
  toast: (opts: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
} | null>(null);

let counter = 0;

export function ToastContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, dispatch] = React.useReducer(reducer, []);

  const toast = React.useCallback((opts: Omit<ToastItem, "id">) => {
    const id = String(++counter);
    const duration = opts.duration ?? 4000;
    dispatch({ type: "ADD", toast: { ...opts, id } });
    setTimeout(() => {
      dispatch({ type: "REMOVE", id });
    }, duration);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    dispatch({ type: "REMOVE", id });
  }, []);

  return React.createElement(
    ToastContext.Provider,
    { value: { toasts, toast, dismiss } },
    children,
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Fallback for components rendered outside provider (e.g., tests without provider)
    return {
      toasts: [] as ToastItem[],
      toast: (_opts: Omit<ToastItem, "id">) => {
        /* no-op outside provider */
      },
      dismiss: (_id: string) => {
        /* no-op outside provider */
      },
    };
  }
  return ctx;
}
