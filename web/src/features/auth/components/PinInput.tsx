import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const LENGTH = 6;

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  /** fired once, when the sixth digit is entered */
  onComplete: (pin: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** i18n label builder for the n-th cell (1-based) */
  cellLabel: (n: number) => string;
}

/** Six numeric cells; typing advances, Backspace goes back, paste fills all cells. */
export function PinInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  cellLabel,
}: PinInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // after a reset (wrong PIN) put the cursor back on the first cell
  useEffect(() => {
    if (value === "" && !disabled) refs.current[0]?.focus();
  }, [value, disabled]);

  function commit(next: string, focusIndex: number) {
    onChange(next);
    if (next.length === LENGTH) {
      onComplete(next);
    } else {
      refs.current[Math.min(focusIndex, LENGTH - 1)]?.focus();
    }
  }

  function handleInput(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    const next = (value.slice(0, index) + digits).slice(0, LENGTH);
    commit(next, next.length);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value.length === 0) return;
      const cut = index < value.length ? index : value.length - 1;
      commit(value.slice(0, cut), cut);
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (digits) commit(digits, digits.length);
  }

  return (
    <div className="flex justify-center gap-2" data-testid="pin-input">
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={LENGTH}
          aria-label={cellLabel(i + 1)}
          aria-invalid={invalid || undefined}
          data-testid={`pin-cell-${i}`}
          value={value[i] ?? ""}
          disabled={disabled}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-14 w-11 rounded-sm border border-input bg-card text-center font-mono text-2xl font-medium shadow-soft transition-colors sm:w-12",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid && "border-destructive",
          )}
        />
      ))}
    </div>
  );
}
