import { z } from "zod";
import { isValidTimeZone } from "@/lib/time-zones";
import { DATE_FORMATS } from "@shared/utils/format-date-time";

// Mirrors the server-side rules for PUT /md/api/v1/tenant/settings: an IANA time zone id the
// runtime recognises, one of the whitelisted .NET date patterns, and a lowercase "12h" | "24h" time format.
export const generalSettingsFormSchema = z.object({
  timeZone: z
    .string()
    .min(1, "Select a time zone")
    .refine(isValidTimeZone, "Select a valid time zone"),
  dateFormat: z.enum(DATE_FORMATS, { error: "Select a date format" }),
  timeFormat: z.enum(["24h", "12h"], { error: "Select a time format" }),
});

export type GeneralSettingsFormValues = z.infer<typeof generalSettingsFormSchema>;

export interface GeneralSettingsFormProps {
  /** Current saved values; the form resets to these whenever they change (e.g. after a save). */
  values: GeneralSettingsFormValues;
  lastUpdatedOn?: string | null;
  onSubmit: (values: GeneralSettingsFormValues) => void;
  isSubmitting: boolean;
}
