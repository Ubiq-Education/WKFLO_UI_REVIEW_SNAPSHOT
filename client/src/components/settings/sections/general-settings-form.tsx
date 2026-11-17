import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SettingsGroup from "@/components/settings/settings-group";
import TimeZoneSelect from "@/components/settings/sections/time-zone-select";
import type { TimeFormat } from "@/models/definitions";
import { DATE_FORMATS, formatTenantDate, formatTenantDateTime } from "@shared/utils/format-date-time";
import {
  generalSettingsFormSchema,
  type GeneralSettingsFormProps,
  type GeneralSettingsFormValues,
} from "./general-settings-form.types";

const TIME_FORMAT_OPTIONS: ReadonlyArray<{ value: TimeFormat; label: string; example: string }> = [
  { value: "24h", label: "24-hour", example: "14:30" },
  { value: "12h", label: "12-hour", example: "2:30 PM" },
];

export default function GeneralSettingsForm({ values, lastUpdatedOn, onSubmit, isSubmitting }: GeneralSettingsFormProps) {
  // `values` (rather than only defaultValues) makes react-hook-form reset the form whenever the
  // saved settings change, e.g. after a successful save, so isDirty goes back to false.
  const form = useForm<GeneralSettingsFormValues>({
    resolver: zodResolver(generalSettingsFormSchema),
    defaultValues: values,
    values,
  });

  // Fixed for the lifetime of the form so the preview only changes when the user changes a setting.
  const [previewDate] = useState(() => new Date());
  const [timeZone, dateFormat, timeFormat] = useWatch({
    control: form.control,
    name: ["timeZone", "dateFormat", "timeFormat"],
  });
  const preview = formatTenantDateTime(previewDate, { timeZone, dateFormat, timeFormat });
  const lastUpdated = lastUpdatedOn ? new Date(lastUpdatedOn) : undefined;

  const isDirty = form.formState.isDirty;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <SettingsGroup
          title="Date & time"
          description="Default time zone, date format and time format for this tenant."
          footer={
            <>
              {lastUpdated && !Number.isNaN(lastUpdated.getTime()) ? (
                <p className="mr-auto text-xs text-muted-foreground">
                  Last updated {formatTenantDateTime(lastUpdated, values)}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={!isDirty || isSubmitting}
                onClick={() => form.reset(values)}
              >
                Discard changes
              </Button>
              <Button type="submit" disabled={!isDirty || isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </>
          }
        >
          <FormField
            control={form.control}
            name="timeZone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Time zone</FormLabel>
                <FormControl>
                  <TimeZoneSelect value={field.value} onChange={field.onChange} disabled={isSubmitting} />
                </FormControl>
                <FormDescription>Times are shown in this zone, with daylight saving applied automatically.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dateFormat"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date format</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full md:w-[420px]">
                      <SelectValue placeholder="Select a date format" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DATE_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {format}{" "}
                        <span className="text-muted-foreground">({formatTenantDate(previewDate, { timeZone, dateFormat: format })})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Examples show today's date in the selected time zone.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="timeFormat"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Time format</FormLabel>
                <FormControl>
                  <RadioGroup
                    aria-label="Time format"
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isSubmitting}
                    className="flex flex-col gap-3 sm:flex-row sm:gap-6"
                  >
                    {TIME_FORMAT_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center gap-2">
                        <RadioGroupItem value={option.value} id={`time-format-${option.value}`} />
                        <Label htmlFor={`time-format-${option.value}`} className="font-normal">
                          {option.label} <span className="text-muted-foreground">({option.example})</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <p className="text-sm" data-testid="time-preview" aria-live="polite">
              {preview}
            </p>
          </div>
        </SettingsGroup>
      </form>
    </Form>
  );
}
