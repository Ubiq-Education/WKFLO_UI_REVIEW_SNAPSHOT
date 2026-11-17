import { useState } from "react";
import { Eye, EyeOff, Trash2, Undo2 } from "lucide-react";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseScopes, readScopes } from "./mcp-oauth-client-credentials";

interface McpOAuthClientCredentialsFieldsProps {
  /** McpConfigEditor's live config accessors (useJsonConfigField) - read fresh on every render. */
  getField: (fieldName: string, defaultValue?: any) => any;
  updateField: (fieldName: string, value: any) => void;
  /** Saving now would drop the stored secret (endpoint or Client ID changed, no new secret). */
  willDropSavedSecret: boolean;
}

function sameScopes(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((scope, i) => scope === b[i]);
}

/**
 * US 7849: Client ID, Client Secret and Scopes for an Http + OAuth2 MCP tool. Values are only
 * written to the form; nothing here saves on its own (no auto-save, unlike Connection Mode).
 *
 * The secret is write-only: the backend never returns it, only `hasClientSecret`. That flag is
 * read live through `getField` on every render (never cached at mount), so the field reflects a
 * save + refetch straight away. Its states:
 * - a new secret typed: shown as typed (masked unless revealed);
 * - `clearClientSecret`: empty, "Will be removed when you save" + Undo;
 * - `hasClientSecret`: dots placeholder, "Secret saved. Leave blank to keep it" + Clear;
 * - none: optional, for public / PKCE-only clients.
 */
export default function McpOAuthClientCredentialsFields({
  getField,
  updateField,
  willDropSavedSecret,
}: McpOAuthClientCredentialsFieldsProps) {
  const [isSecretVisible, setIsSecretVisible] = useState(false);

  const clientId: string = typeof getField("clientId", "") === "string" ? getField("clientId", "") : "";
  const rawSecret = getField("clientSecret", "");
  const typedSecret: string = typeof rawSecret === "string" ? rawSecret : "";
  const hasSavedSecret = getField("hasClientSecret", false) === true;
  const isClearPending = getField("clearClientSecret", false) === true && typedSecret === "";
  const storedScopes = readScopes(getField("scopes", []));

  // The Scopes box keeps the admin's raw text (so a trailing space or comma survives while
  // typing); the config holds the parsed array. Re-sync from the config when it changes
  // underneath, e.g. after a save + refetch.
  const [scopesText, setScopesText] = useState(() => storedScopes.join(" "));
  if (!sameScopes(parseScopes(scopesText), storedScopes)) {
    setScopesText(storedScopes.join(" "));
  }

  let secretHelp: string;
  if (typedSecret !== "") {
    secretHelp = hasSavedSecret
      ? "Replaces the saved secret when you save."
      : "Stored encrypted when you save.";
  } else if (isClearPending) {
    secretHelp = "Will be removed when you save.";
  } else if (hasSavedSecret) {
    secretHelp = "Secret saved. Leave blank to keep it.";
  } else {
    secretHelp = "Optional for public / PKCE-only clients.";
  }

  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="space-y-2">
        <FormLabel htmlFor="mcp-oauth-client-id" className="text-xs">Client ID</FormLabel>
        <Input
          id="mcp-oauth-client-id"
          value={clientId}
          onChange={(e) => updateField("clientId", e.target.value)}
          placeholder="Client ID issued by the MCP server's provider"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Leave blank if the MCP server supports dynamic client registration.
        </p>
      </div>

      <div className="space-y-2">
        <FormLabel htmlFor="mcp-oauth-client-secret" className="text-xs">Client Secret</FormLabel>
        <div className="flex items-center gap-2">
          <Input
            id="mcp-oauth-client-secret"
            type={isSecretVisible ? "text" : "password"}
            value={typedSecret}
            onChange={(e) => updateField("clientSecret", e.target.value)}
            placeholder={hasSavedSecret && !isClearPending ? "••••••••" : "Client secret"}
            autoComplete="new-password"
            spellCheck={false}
            aria-describedby="mcp-oauth-client-secret-help"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => setIsSecretVisible((visible) => !visible)}
            aria-label={isSecretVisible ? "Hide client secret" : "Show client secret"}
            aria-pressed={isSecretVisible}
          >
            {isSecretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          {hasSavedSecret && typedSecret === "" && !isClearPending ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => updateField("clearClientSecret", true)}
              aria-label="Clear saved client secret"
              title="Clear saved client secret"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <p
            id="mcp-oauth-client-secret-help"
            className={isClearPending ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
          >
            {secretHelp}
          </p>
          {isClearPending ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => updateField("clearClientSecret", false)}
            >
              <Undo2 className="mr-1 h-3 w-3" />
              Undo
            </Button>
          ) : null}
        </div>
        {typedSecret.trim() !== "" && clientId.trim() === "" ? (
          <p className="text-xs text-destructive">Enter a Client ID to use a client secret.</p>
        ) : null}
        {willDropSavedSecret ? (
          <p className="text-xs text-amber-700" data-testid="mcp-oauth-secret-will-drop">
            Changing the endpoint or Client ID removes the saved secret when you save. Enter the secret again to keep using one.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <FormLabel htmlFor="mcp-oauth-scopes" className="text-xs">Scopes</FormLabel>
        <Input
          id="mcp-oauth-scopes"
          value={scopesText}
          onChange={(e) => {
            setScopesText(e.target.value);
            updateField("scopes", parseScopes(e.target.value));
          }}
          placeholder="e.g. profile:read design:meta:read"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Separate scopes with spaces or commas. Leave blank to request every scope the MCP server advertises.
        </p>
      </div>
    </div>
  );
}
