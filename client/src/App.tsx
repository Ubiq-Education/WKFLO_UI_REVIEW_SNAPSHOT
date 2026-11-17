import { Redirect, Route, Switch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import AgentsPage from "@/pages/agents/index";
import CreateAgent from "@/pages/agents/create";
import EditAgent from "@/pages/agents/edit";
import ViewAgent from "@/pages/agents/view";
import AgentChatUIPage from "@/pages/agents/share/chat-ui";
import AgentChatWidgetPage from "@/pages/agents/share/chat-widget";
import ToolsIndex from "@/pages/tools/index";
import CreateTool from "@/pages/tools/create";
import EditTool from "@/pages/tools/edit";
import TagsIndex from "@/pages/tags/index";
import CreateTag from "@/pages/tags/create";
import EditTag from "@/pages/tags/edit";
import MarketplacePage from "@/pages/marketplace/index";
import BrowseMarketplace from "@/pages/marketplace/browse";
import MyPurchases from "@/pages/marketplace/purchases";
import ManageMarketplaceAgents from "@/pages/marketplace/manage-agents";
import VaultPage from "@/pages/vault/index";
import KnowledgePage from "@/pages/knowledge/index";
import AIModelsPage from "@/pages/aimodels/index";
import AIModelAICreditPage from "@/pages/aimodels/ai-credit";
import AuditIndex from "@/pages/audit/index";
import SettingsPage from "@/pages/settings/index";
import AppLayout from "@/components/layout/app-layout";

import Login from '@/pages/login';

import ProtectedRoute from '@/components/security/ProtectedRoute';
import SuperPowerUserRoute from '@/components/security/SuperPowerUserRoute';
import { DataProvider } from "@shared/provider/data-provider";

function Router() {
  return (
    <ProtectedRoute>
      {/* ProtectedRoute has no path, so the Switch must live inside it: as a sibling it matched every URL and hid the 404 fallback. */}
      <Switch>
        <Route path="/login" component={Login} />
        
        {/* Dashboard */}
        <Route path="/" component={Dashboard} />
        
        {/* Agent routes */}
        <Route path="/agents" component={AgentsPage} />
        <Route path="/agents/create" component={CreateAgent} />
        <Route path="/agents/:id/edit" component={EditAgent} />
        <Route path="/agents/view/:id" component={ViewAgent} />
        <Route path="/agents/:id/share/chat-ui" component={AgentChatUIPage} />
        <Route path="/agents/:id/share/chat-widget" component={AgentChatWidgetPage} />
        
        {/* Tool routes */}
        <Route path="/tools" component={ToolsIndex} />
        <Route path="/tools/create" component={CreateTool} />
        <Route path="/tools/:id/edit" component={EditTool} />

        {/* Tag routes */}
        <Route path="/tags">
          <SuperPowerUserRoute redirectTo="/">
            <TagsIndex />
          </SuperPowerUserRoute>
        </Route>
        <Route path="/tags/create">
          <SuperPowerUserRoute redirectTo="/">
            <CreateTag />
          </SuperPowerUserRoute>
        </Route>
        <Route path="/tags/:id/edit">
          <SuperPowerUserRoute redirectTo="/">
            <EditTag />
          </SuperPowerUserRoute>
        </Route>

        {/* Marketplace routes */}
        <Route path="/marketplace" component={MarketplacePage} />
        <Route path="/marketplace/browse" component={BrowseMarketplace} />
        <Route path="/marketplace/purchases" component={MyPurchases} />
        <Route path="/marketplace/manage-agents">
          <SuperPowerUserRoute>
            <ManageMarketplaceAgents />
          </SuperPowerUserRoute>
        </Route>
        
        {/* AI Models routes */}
        <Route path="/aimodels">
          <SuperPowerUserRoute redirectTo="/">
            <AIModelsPage />
          </SuperPowerUserRoute>
        </Route>
        <Route path="/aimodels/:id/ai-credit">
          <SuperPowerUserRoute redirectTo="/">
            <AIModelAICreditPage />
          </SuperPowerUserRoute>
        </Route>

        {/* Vault routes */}
        <Route path="/vault">
          <SuperPowerUserRoute redirectTo="/">
            <VaultPage />
          </SuperPowerUserRoute>
        </Route>
        
        {/* Knowledge routes */}
        <Route path="/knowledge" component={KnowledgePage} />
        
        {/* Workflows are hidden for everyone: send stale links home (pages/workflows is kept in the repo) */}
        <Route path="/workflows">
          <Redirect to="/" replace />
        </Route>

        {/* Audit routes */}
        <Route path="/audit">
          <SuperPowerUserRoute redirectTo="/">
            <AuditIndex />
          </SuperPowerUserRoute>
        </Route>

        {/* Settings routes - bare /settings has no section, so SettingsPage redirects it to the default one */}
        <Route path="/settings" component={SettingsPage} />
        <Route path="/settings/:section" component={SettingsPage} />

        {/* Fallback to 404 */}
        <Route component={NotFound} />
      </Switch>
    </ProtectedRoute>
  );
}

function App() {

  return (
   
    <div>
      
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <DataProvider>
            <Toaster />
            <AppLayout>
              <Router />
            </AppLayout>
          </DataProvider>
        </TooltipProvider>
      </QueryClientProvider>

    </div>
    
  );
}

export default App;
