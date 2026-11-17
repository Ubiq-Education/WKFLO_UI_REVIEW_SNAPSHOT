import { AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTenantSettings, useUpdateTenantSettings } from "@/hooks/use-tenant-settings";
import { resolveDateFormat } from "@shared/utils/format-date-time";
import GeneralSettingsForm from "./general-settings-form";
import type { GeneralSettingsFormValues } from "./general-settings-form.types";

export default function GeneralSettings() {
  const { data: settings, isPending, isError, error, refetch, isFetching } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const { toast } = useToast();

  // isPending (not isLoading) also covers the window before the auth token / tenant are known,
  // while the query is still disabled.
  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Couldn't load settings</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error instanceof Error ? error.message : "An error occurred loading the settings."}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const values: GeneralSettingsFormValues = {
    timeZone: settings.timeZone || "UTC",
    timeFormat: settings.timeFormat === "12h" ? "12h" : "24h",
    // Servers from before the date format setting omit it.
    dateFormat: resolveDateFormat(settings.dateFormat),
  };

  const handleSubmit = (submitted: GeneralSettingsFormValues) => {
    updateSettings.mutate(submitted, {
      onSuccess: () => toast({ title: "Settings saved", description: "Date and time settings have been updated." }),
      onError: (err) =>
        toast({
          title: "Couldn't save settings",
          description: err instanceof Error ? err.message : "An error occurred.",
          variant: "destructive",
        }),
    });
  };

  return (
    <GeneralSettingsForm
      values={values}
      lastUpdatedOn={settings.lastUpdatedOn}
      onSubmit={handleSubmit}
      isSubmitting={updateSettings.isPending}
    />
  );
}
