import { useLocation } from "wouter";
import { 
  LayoutDashboard,
  Wrench,
Settings,
  KeyRound,
  LucideIcon,
  BookOpen,
  Brain,
  UsersRound,
  Blocks,
  Store,
  Tags,
  History,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItemProps {
  icon: LucideIcon;
  href: string;
  isActive: boolean;
  label: string;
}

function NavItem({ icon: Icon, href, isActive, label }: NavItemProps) {
  const [_, navigate] = useLocation();
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            aria-label={label}
            onClick={(e) => {
              e.preventDefault();
              navigate(href);
            }}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 ease-in-out",
              isActive 
                ? "bg-orange-500 text-white" 
                : "text-text hover:bg-gray-100"
            )}
          >
            <Icon className="h-5 w-5" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function Sidebar() {
  const [location] = useLocation();
  const { isSuperPowerUser } = useSuperPowerUser();
  
  const navItems = [
    { icon: LayoutDashboard, href: "/", label: "Dashboard" },
    { icon: UsersRound, href: "/agents", label: "Agents" },
    { icon: Wrench, href: "/tools", label: "Tools & Plugins" },
    { icon: Brain, href: "/aimodels", label: "AI Models", requiresSuperPowerUser: true },
    { icon: KeyRound, href: "/vault", label: "API Keys Vault", requiresSuperPowerUser: true },
    { icon: BookOpen, href: "/knowledge", label: "Knowledge Base" }, 
{ icon: Tags, href: "/tags", label: "Tags", requiresSuperPowerUser: true },
    // { icon: Blocks, href: "/integrations", label: "Integrations" },
    { icon: Store, href: "/marketplace/browse", label: "Marketplace" },
    { icon: Package, href: "/marketplace/manage-agents", label: "Manage Marketplace Agents", requiresSuperPowerUser: true },
    { icon: History, href: "/audit", label: "Audit Log", requiresSuperPowerUser: true }
  ].filter((item) => !item.requiresSuperPowerUser || isSuperPowerUser);
  
  return (
    <div className="w-20 bg-white border-r border-border flex flex-col items-center py-6 h-full">
      <nav className="flex-1 flex flex-col items-center space-y-4">
        {navItems.map((item) => (
          <NavItem 
            key={item.href}
            icon={item.icon}
            href={item.href}
            isActive={location === item.href || (item.href !== "/" && location.startsWith(item.href))}
            label={item.label}
          />
        ))}
      </nav>
      
      <div className="mt-auto">
        <NavItem
          icon={Settings}
          href="/settings"
          isActive={location === "/settings" || location.startsWith("/settings/")}
          label="Settings"
        />
        <div className="mt-6 w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-text font-medium">
          JS
        </div>
      </div>
    </div>
  );
}
