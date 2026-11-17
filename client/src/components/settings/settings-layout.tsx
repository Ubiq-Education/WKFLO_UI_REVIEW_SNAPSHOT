import type { ReactNode } from "react";
import SettingsNav from "@/components/settings/settings-nav";
import type { SettingsSection } from "@/components/settings/settings-sections";

interface SettingsLayoutProps {
  activeSection: SettingsSection;
  children: ReactNode;
}

export default function SettingsLayout({ activeSection, children }: SettingsLayoutProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage settings that apply to everyone in this tenant.</p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <aside className="md:w-56 md:shrink-0">
          <SettingsNav activeSectionId={activeSection.id} />
        </aside>

        <section aria-labelledby="settings-section-title" className="min-w-0 flex-1 max-w-3xl space-y-6">
          <div>
            <h2 id="settings-section-title" className="text-xl font-semibold">
              {activeSection.label}
            </h2>
            <p className="text-sm text-muted-foreground">{activeSection.description}</p>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
