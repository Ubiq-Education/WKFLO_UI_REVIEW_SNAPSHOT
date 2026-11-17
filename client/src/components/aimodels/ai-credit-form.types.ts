import { UseFormReturn } from "react-hook-form";
import { z } from "zod";

// Mirrors the server-side validation on AICredit (WI 7384): multiplierIn/multiplierOut must be
// greater than 0 (fractional values like 0.01 are intentional, to allow a small number of
// credits per token), every other numeric field must be >= 0. Kept in sync with the backend's
// CreateAICreditCommand/UpdateAICreditCommand validators so the UI surfaces the same rule
// instantly instead of round-tripping to the server to find out.
export const aiCreditFormSchema = z.object({
  aiModelId: z.number(),
  tokensIn: z.number({ error: "Tokens In is required" }).min(0, "Must be 0 or greater"),
  costInMTok: z.number({ error: "Cost In is required" }).min(0, "Must be 0 or greater"),
  tokensOut: z.number({ error: "Tokens Out is required" }).min(0, "Must be 0 or greater"),
  costOutMTok: z.number({ error: "Cost Out is required" }).min(0, "Must be 0 or greater"),
  multiplierIn: z.number({ error: "Multiplier In is required" }).gt(0, "Multiplier must be greater than 0"),
  multiplierOut: z.number({ error: "Multiplier Out is required" }).gt(0, "Multiplier must be greater than 0"),
});

export type AICreditFormValues = z.infer<typeof aiCreditFormSchema>;

export interface AICreditFormProps {
  form: UseFormReturn<AICreditFormValues>;
  onSubmit: (values: AICreditFormValues) => void;
  isSubmitting: boolean;
  /** True when editing an existing AICredit (the GET returned 200), false when configuring one
   * for the first time (the GET 404'd) - drives the submit button label and Update/Create copy. */
  isEditMode: boolean;
}
