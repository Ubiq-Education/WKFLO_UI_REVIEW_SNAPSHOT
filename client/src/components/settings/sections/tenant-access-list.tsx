import { useContext, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Trash2 } from "lucide-react";
import { DataContext } from "@shared/models/chat-models";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  useAddTenantAccess,
  useAllTenants,
  useRemoveTenantAccess,
  useTenantAccess,
} from "@/hooks/use-tenant-access-admin";
import { parseErrorMessage } from "@/lib/utils";
import type { TenantAccessEntry } from "@/models/definitions";
import SettingsGroup from "@/components/settings/settings-group";

const addAccessSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address")
    .max(320, "Email address is too long")
    .email("Enter a valid email address"),
});

type AddAccessValues = z.infer<typeof addAccessSchema>;

function formatAddedOn(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

// Scoped to the tenant selected in the top bar (DataContext.selectedTenantGuid, which the header updates),
// so switching tenants there re-scopes the list and the add target without a reload.
export default function TenantAccessList() {
  const { selectedTenantGuid } = useContext(DataContext);
  const { data: entries, isPending, isError } = useTenantAccess();
  const { data: tenants } = useAllTenants();
  const addAccess = useAddTenantAccess();
  const removeAccess = useRemoveTenantAccess();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<TenantAccessEntry | null>(null);

  const form = useForm<AddAccessValues>({
    resolver: zodResolver(addAccessSchema),
    defaultValues: { email: "" },
  });

  // A dialog opened for the previous tenant's row must not survive a tenant switch.
  useEffect(() => {
    setPendingRemoval(null);
  }, [selectedTenantGuid]);

  const hasTenant = !!selectedTenantGuid;
  const tenantName = tenants?.find((t) => t.guid === selectedTenantGuid)?.name;

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) => e.tenantGuid === selectedTenantGuid && (!term || e.email.toLowerCase().includes(term))
    );
  }, [entries, selectedTenantGuid, search]);

  const handleAdd = (values: AddAccessValues) => {
    if (!selectedTenantGuid) return;
    addAccess.mutate(
      { tenantGuid: selectedTenantGuid, email: values.email },
      {
        onSuccess: () => {
          form.reset({ email: "" });
          toast({ title: "Tenant access added", description: values.email });
        },
        onError: (err) =>
          toast({
            title: "Couldn't add tenant access",
            description: parseErrorMessage(err.message, "Couldn't add tenant access").message,
            variant: "destructive",
          }),
      }
    );
  };

  const handleConfirmRemove = () => {
    if (!pendingRemoval) return;
    const target = pendingRemoval;
    setPendingRemoval(null);
    removeAccess.mutate(target.id, {
      onSuccess: () => toast({ title: "Tenant access removed", description: target.email }),
      onError: (err) =>
        toast({
          title: "Couldn't remove tenant access",
          description: parseErrorMessage(err.message, "Couldn't remove tenant access").message,
          variant: "destructive",
        }),
    });
  };

  const title = tenantName ? `Who can access ${tenantName}` : "Tenant access";

  return (
    <SettingsGroup
      title={title}
      description="Users who are not super power users can only switch to tenants they are listed on. This list follows the tenant selected in the top bar; switch tenants there to manage another one."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleAdd)} noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                {/* Input and button share one row so they stay aligned; the validation message goes below it. */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      autoComplete="off"
                      disabled={!hasTenant}
                      className="flex-1"
                      {...field}
                    />
                  </FormControl>
                  <Button type="submit" disabled={!hasTenant || addAccess.isPending}>
                    {addAccess.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Add access
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
      {!hasTenant ? <p className="text-sm text-muted-foreground">Select a tenant in the top bar.</p> : null}

      <Input
        type="search"
        aria-label="Search by email"
        placeholder="Search by email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isPending ? (
        <Skeleton className="h-24 w-full" aria-label="Loading tenant access" />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Couldn't load tenant access. Please contact Support.</AlertDescription>
        </Alert>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead>Added on</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No tenant access found.
                </TableCell>
              </TableRow>
            ) : (
              visibleEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.email}</TableCell>
                  <TableCell>{entry.createdBy ?? "-"}</TableCell>
                  <TableCell>{formatAddedOn(entry.createdOn)}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${entry.email}`}
                      title="Remove"
                      disabled={removeAccess.isPending}
                      onClick={() => setPendingRemoval(entry)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!pendingRemoval} onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove tenant access?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.email} will no longer be able to switch to {pendingRemoval?.tenantName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsGroup>
  );
}
