import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { Globe, ShieldCheck, SlidersHorizontal } from "lucide-react";
import GeneralSettings from "@/components/settings/sections/general-settings";
import SuperPowerUsersSettings from "@/components/settings/sections/super-power-users-settings";
import WebOriginsSettings from "@/components/settings/sections/web-origins-settings";

export interface SettingsSection {
  /** URL segment: the section is served at /settings/:id. Must be unique and URL-safe. */
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  component: ComponentType;
  /** UI-only restriction: hidden from the nav and redirected away from for anyone who is not a super power user. */
  requiresSuperPowerUser?: boolean;
}

// Single source of truth for the Settings area: the left nav, the routing and the page header are
// all driven from this list. Adding a section = one entry here + its component under ./sections.
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: "general",
    label: "General",
    description: "Date, time and other tenant-wide preferences.",
    icon: SlidersHorizontal,
    component: GeneralSettings,
  },
  {
    id: "super-power-users",
    label: "Super Power Users",
    description: "Super power users are global; tenant access follows the tenant selected in the top bar.",
    icon: ShieldCheck,
    component: SuperPowerUsersSettings,
    requiresSuperPowerUser: true,
  },
  {
    id: "web-origins",
    label: "Web Origins",
    description: "The domains stored for the tenant selected in the top bar. Read-only.",
    icon: Globe,
    component: WebOriginsSettings,
    requiresSuperPowerUser: true,
  },
];

/** The sections the current user may open. */
export function visibleSettingsSections(isSuperPowerUser: boolean): readonly SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => !section.requiresSuperPowerUser || isSuperPowerUser);
}

export const DEFAULT_SETTINGS_SECTION_ID = SETTINGS_SECTIONS[0].id;

export function settingsSectionPath(id: string): string {
  return `/settings/${id}`;
}

export function findSettingsSection(id: string | undefined): SettingsSection | undefined {
  return id ? SETTINGS_SECTIONS.find((section) => section.id === id) : undefined;
}
