import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import Sidebar from "./sidebar";
import Header from "./header";
import { Button } from "@/components/ui/button";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  // Signed-out visitors (the login page) have no permissions to wait for, so only gate once signed in.
  const { accounts } = useMsal();
  const isSignedIn = accounts.length > 0;
  const { isSuperPowerUser, accessibleTenantGuids, isLoading, isError, refetch } = useSuperPowerUser();
  // UI-only: nothing tenant-scoped is mounted (so no API calls fire) until we know what the user may access.
  const hasNoWorkspaces = !isLoading && !isError && !isSuperPowerUser && accessibleTenantGuids.length === 0;

  let content: ReactNode = children;
  if (!isSignedIn) {
    content = children;
  } else if (isLoading) {
    content = (
      <main className="flex flex-1 items-center justify-center p-6" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading" />
      </main>
    );
  } else if (isError) {
    content = (
      <main role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
        <p>Couldn't load your permissions. Please contact Support.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </main>
    );
  } else if (hasNoWorkspaces) {
    content = (
      <main role="status" className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
        No workspaces are available. Please contact Support.
      </main>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        {content}
      </div>
    </div>
  );
}
