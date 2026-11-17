import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PassthroughInputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "value" | "onChange" | "type" | "min" | "step" | "placeholder" | "disabled" | "className"
>;

interface NumberStepperInputProps extends PassthroughInputProps {
  /** null represents "no value" (e.g. no cap) - distinct from 0. */
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  min?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Applied to the outer container (buttons + input row) - e.g. to control overall width. Every
   * other prop (id, aria-*, name, onBlur, ...) is forwarded to the inner <input> instead: FormControl
   * (see form.tsx) injects those onto whichever single child it wraps via Radix's Slot, expecting the
   * child to pass them down to its real interactive element - dropping them silently breaks
   * FormLabel's htmlFor association and screen-reader-announced validation/description text. */
  className?: string;
}

/** A nullable integer input with +/- stepper buttons - null (empty) is a first-class value here,
 * not just "unset", so callers can distinguish "no limit configured" from any specific number. */
export const NumberStepperInput = React.forwardRef<HTMLInputElement, NumberStepperInputProps>(
  ({ value, onChange, min = 1, step = 1, placeholder = "No limit", disabled, className, ...inputProps }, ref) => {
    const numericValue = typeof value === "number" && Number.isFinite(value) ? value : null;

    const clamp = (next: number) => (next < min ? min : next);

    const decrement = () => {
      if (numericValue === null) return;
      onChange(clamp(numericValue - step));
    };

    const increment = () => {
      onChange(clamp((numericValue ?? min - step) + step));
    };

    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled || numericValue === null}
          onClick={decrement}
          aria-label="Decrease"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          {...inputProps}
          ref={ref}
          type="number"
          inputMode="numeric"
          min={min}
          step={step}
          value={numericValue ?? ""}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isFinite(parsed) ? clamp(parsed) : null);
          }}
          className="text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          onClick={increment}
          aria-label="Increase"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    );
  }
);
NumberStepperInput.displayName = "NumberStepperInput";
