import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMsal } from "@azure/msal-react";
import { z } from "zod";
import { Loader2, Trash2 } from "lucide-react";
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
  useAddSuperPowerUser,
  useRemoveSuperPowerUser,
  useSuperPowerUsers,
} from "@/hooks/use-super-power-users-admin";
import { parseErrorMessage } from "@/lib/utils";
import type { SuperPowerUserEntry } from "@/models/definitions";
import SettingsGroup from "@/components/settings/settings-group";

const addUserSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address")
    .max(320, "Email address is too long")
    .email("Enter a valid email address"),
});

type AddUserValues = z.infer<typeof addUserSchema>;

function formatAddedOn(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

export default function SuperPowerUsersList() {
  const { data: users, isPending, isError } = useSuperPowerUsers();
  const addUser = useAddSuperPowerUser();
  const removeUser = useRemoveSuperPowerUser();
  const { toast } = useToast();
  const { instance, accounts } = useMsal();
  const [pendingRemoval, setPendingRemoval] = useState<SuperPowerUserEntry | null>(null);

  const myEmail = ((instance.getActiveAccount() ?? accounts[0])?.username ?? "").trim().toLowerCase();

  const form = useForm<AddUserValues>({
    resolver: zodResolver(addUserSchema),
    defaultValues: { email: "" },
  });

  const handleAdd = (values: AddUserValues) => {
    addUser.mutate(
      { email: values.email },
      {
        onSuccess: () => {
          form.reset({ email: "" });
          toast({ title: "Super power user added", description: values.email });
        },
        onError: (err) =>
          toast({
            title: "Couldn't add super power user",
            description: parseErrorMessage(err.message, "Couldn't add super power user").message,
            variant: "destructive",
          }),
      }
    );
  };

  const handleConfirmRemove = () => {
    if (!pendingRemoval) return;
    const target = pendingRemoval;
    setPendingRemoval(null);
    removeUser.mutate(target.id, {
      onSuccess: () => toast({ title: "Super power user removed", description: target.email }),
      onError: (err) =>
        toast({
          title: "Couldn't remove super power user",
          description: parseErrorMessage(err.message, "Couldn't remove super power user").message,
          variant: "destructive",
        }),
    });
  };

  return (
    <SettingsGroup
      title="Super Power Users"
      description="Super power users see every tenant and can share to, install from and manage the marketplace."
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
                    <Input type="email" placeholder="user@example.com" autoComplete="off" className="flex-1" {...field} />
                  </FormControl>
                  <Button type="submit" disabled={addUser.isPending}>
                    {addUser.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Add super power user
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>

      {isPending ? (
        <Skeleton className="h-24 w-full" aria-label="Loading super power users" />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Couldn't load super power users. Please contact Support.</AlertDescription>
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
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No super power users.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const isSelf = !!myEmail && user.email.trim().toLowerCase() === myEmail;
                return (
                  <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.createdBy ?? "-"}</TableCell>
                    <TableCell>{formatAddedOn(user.createdOn)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${user.email}`}
                        title={isSelf ? "You can't remove your own access" : "Remove"}
                        disabled={isSelf || removeUser.isPending}
                        onClick={() => setPendingRemoval(user)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!pendingRemoval} onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove super power user?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.email} will no longer see every tenant or use the marketplace actions reserved for
              super power users.
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
