import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useJsonConfigField } from "../hooks/use-json-config-field";
import { ContactFormToolConfig } from "../tool-form.types";

interface ContactFormConfigEditorProps {
  form: UseFormReturn<any>;
}

// `enabled` is intentionally absent: the tool's IsActive flag (tool-card switch) is the
// on/off control. A legacy `enabled` key is preserved as-is if already present (see below).
const DEFAULT_CONTACT_FORM_CONFIG: ContactFormToolConfig = {
  mandatory: false,
  firstNameRequired: false,
  lastNameRequired: false,
  emailRequired: false,
  whenToUse: "",
  submitButtonText: "Submit",
  successMessageEnabled: false,
  successMessageText: "",
};

/** Config editor for the Contact_Form tool type: toggles + text fields. */
export default function ContactFormConfigEditor({ form }: ContactFormConfigEditorProps) {
  const [configContactFormStr, setConfigContactFormStr] = useState<ContactFormToolConfig | null>(null);

  const { getField, updateField } = useJsonConfigField(form, {
    errorMessage: "Failed to update config.",
    onSaved: (config) => setConfigContactFormStr(config),
  });

  // Parse and sanitize the config once when this editor mounts (i.e. whenever the tool
  // type switches to Contact_Form), mirroring the original parseContactFormConfig effect
  // that ran on `toolType` change in the monolith.
  useEffect(() => {
    try {
      const configStr = form.getValues("config");
      try {
        const parsedConfig = configContactFormStr || JSON.parse(configStr);
        const config: ContactFormToolConfig = {
          // Legacy key: older per-site CMS versions still read `enabled` as the on/off toggle,
          // so keep whatever value is stored - never add it and never drop it.
          ...("enabled" in parsedConfig ? { enabled: parsedConfig.enabled } : {}),
          // US 8021: the CMS owns the admin email notification settings and stores them in this
          // same config. Keep them exactly as stored - never add, change or drop them.
          ...("adminNotificationsEnabled" in parsedConfig ? { adminNotificationsEnabled: parsedConfig.adminNotificationsEnabled } : {}),
          ...("adminNotificationEmails" in parsedConfig ? { adminNotificationEmails: parsedConfig.adminNotificationEmails } : {}),
          mandatory: typeof parsedConfig.mandatory === "boolean" ? parsedConfig.mandatory : DEFAULT_CONTACT_FORM_CONFIG.mandatory,
          firstNameRequired: typeof parsedConfig.firstNameRequired === "boolean" ? parsedConfig.firstNameRequired : DEFAULT_CONTACT_FORM_CONFIG.firstNameRequired,
          lastNameRequired: typeof parsedConfig.lastNameRequired === "boolean" ? parsedConfig.lastNameRequired : DEFAULT_CONTACT_FORM_CONFIG.lastNameRequired,
          emailRequired: typeof parsedConfig.emailRequired === "boolean" ? parsedConfig.emailRequired : DEFAULT_CONTACT_FORM_CONFIG.emailRequired,
          whenToUse: parsedConfig.whenToUse ?? DEFAULT_CONTACT_FORM_CONFIG.whenToUse,
          submitButtonText: parsedConfig.submitButtonText || DEFAULT_CONTACT_FORM_CONFIG.submitButtonText,
          successMessageEnabled: typeof parsedConfig.successMessageEnabled === "boolean" ? parsedConfig.successMessageEnabled : DEFAULT_CONTACT_FORM_CONFIG.successMessageEnabled,
          successMessageText: parsedConfig.successMessageText ?? DEFAULT_CONTACT_FORM_CONFIG.successMessageText,
        };
        setConfigContactFormStr(config);
        form.setValue("config", JSON.stringify(config, null, 2));
      } catch (e) {
        setConfigContactFormStr(DEFAULT_CONTACT_FORM_CONFIG);
        form.setValue("config", JSON.stringify(DEFAULT_CONTACT_FORM_CONFIG, null, 2));
      }
    } catch (e) {
      console.error("Error initializing Contact Form config:", e);
    }
    // Intentionally runs only on mount - matches the original effect's practical behavior
    // of firing once per toolType change into "Contact_Form".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <h3 className="text-base font-medium">Contact Form Configuration</h3>

      {/* mandatory */}
      <div className="space-y-1">
        <FormLabel>Mandatory</FormLabel>
        <div className="flex items-center space-x-2">
          <Switch
            checked={getField("mandatory", false)}
            onCheckedChange={(v) => updateField("mandatory", v)}
          />
          <span className="text-sm text-muted-foreground">
            {getField("mandatory", false)
              ? "Block chat until the form is submitted"
              : "User can continue without submitting"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Fields to collect</h4>

        {/* firstNameRequired */}
        <div className="flex items-center space-x-2">
          <Switch
            checked={getField("firstNameRequired", false)}
            onCheckedChange={(v) => updateField("firstNameRequired", v)}
          />
          <FormLabel className="font-normal">First Name</FormLabel>
        </div>

        {/* lastNameRequired */}
        <div className="flex items-center space-x-2">
          <Switch
            checked={getField("lastNameRequired", false)}
            onCheckedChange={(v) => updateField("lastNameRequired", v)}
          />
          <FormLabel className="font-normal">Last Name</FormLabel>
        </div>

        {/* emailRequired */}
        <div className="flex items-center space-x-2">
          <Switch
            checked={getField("emailRequired", false)}
            onCheckedChange={(v) => updateField("emailRequired", v)}
          />
          <FormLabel className="font-normal">Email</FormLabel>
        </div>
      </div>

      {/* whenToUse */}
      <div className="space-y-2">
        <FormLabel>When to use <span className="text-red-500">*</span></FormLabel>
        <Textarea
          value={getField("whenToUse", "")}
          onChange={(e) => updateField("whenToUse", e.target.value)}
          placeholder="Show the contact form when the user asks for a quote or wants to be contacted by the sales team."
          className="min-h-[100px]"
        />
        <p className="text-xs text-muted-foreground">
          Instruction for the AI agent describing when to trigger the contact form.
        </p>
      </div>

      {/* submitButtonText */}
      <div className="space-y-2">
        <FormLabel>Submit button text</FormLabel>
        <Input
          value={getField("submitButtonText", "Submit")}
          onChange={(e) => updateField("submitButtonText", e.target.value)}
          placeholder="Submit"
        />
      </div>

      {/* successMessageEnabled */}
      <div className="space-y-1">
        <FormLabel>Success message</FormLabel>
        <div className="flex items-center space-x-2">
          <Switch
            checked={getField("successMessageEnabled", false)}
            onCheckedChange={(v) => updateField("successMessageEnabled", v)}
          />
          <span className="text-sm text-muted-foreground">
            Show a confirmation message after submit
          </span>
        </div>
      </div>

      {/* successMessageText — only visible when successMessageEnabled */}
      {getField("successMessageEnabled", false) && (
        <div className="space-y-2">
          <FormLabel>Confirmation message text</FormLabel>
          <Input
            value={getField("successMessageText", "")}
            onChange={(e) => updateField("successMessageText", e.target.value)}
            placeholder="Thank you! We will get back to you shortly."
          />
        </div>
      )}
    </div>
  );
}
