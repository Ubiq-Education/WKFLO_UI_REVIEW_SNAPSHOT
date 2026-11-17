import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { settingsSectionPath, visibleSettingsSections } from "@/components/settings/settings-sections";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";

interface SettingsNavProps {
  activeSectionId: string;
}

export default function SettingsNav({ activeSectionId }: SettingsNavProps) {
  const { isSuperPowerUser } = useSuperPowerUser();
  return (
    <nav aria-label="Settings sections" className="flex flex-row gap-1 md:flex-col">
      {visibleSettingsSections(isSuperPowerUser).map(({ id, label, icon: Icon }) => {
        const isActive = id === activeSectionId;
        return (
          <Link
            key={id}
            href={settingsSectionPath(id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-orange-700 text-white" : "text-text hover:bg-gray-100"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
