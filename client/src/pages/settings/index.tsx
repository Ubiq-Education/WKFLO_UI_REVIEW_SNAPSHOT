import { Redirect, useParams } from "wouter";
import SettingsLayout from "@/components/settings/settings-layout";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";
import {
  DEFAULT_SETTINGS_SECTION_ID,
  findSettingsSection,
  settingsSectionPath,
} from "@/components/settings/settings-sections";

// Served at /settings/:section. Unknown sections fall back to the default one rather than a 404,
// so stale bookmarks keep working if a section is ever renamed or removed.
export default function SettingsPage() {
  const { section: sectionId } = useParams<{ section?: string }>();
  const section = findSettingsSection(sectionId);
  const { isSuperPowerUser, isLoading } = useSuperPowerUser();

  // Wait for permissions before deciding, so a super power user reloading the page is not bounced away.
  if (section?.requiresSuperPowerUser && isLoading) return null;

  if (!section || (section.requiresSuperPowerUser && !isSuperPowerUser)) {
    return <Redirect to={settingsSectionPath(DEFAULT_SETTINGS_SECTION_ID)} replace />;
  }

  const SectionComponent = section.component;
  return (
    <SettingsLayout activeSection={section}>
      <SectionComponent />
    </SettingsLayout>
  );
}
