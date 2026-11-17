import path from "node:path";
import { mergeConfig, type ConfigEnv, type Plugin, type PluginOption, type UserConfig } from "vite";
import baseConfig from "../vite.config.ts";

const E2E_PORT = Number(process.env.E2E_PORT ?? 5174);
const realAuthConfig = path.resolve(import.meta.dirname, "..", "client", "src", "authConfig.ts");
const fakeAuthConfig = path.resolve(import.meta.dirname, "support", "msal", "fake-auth-config.ts");
const realAuthService = path.resolve(import.meta.dirname, "..", "shared", "services", "auth-service.ts");
const fakeMsalBrowser = path.resolve(import.meta.dirname, "support", "msal", "fake-msal-browser.ts");

/**
 * Swaps client/src/authConfig.ts (the real MSAL instance) for a fake one. Every importer uses a
 * relative path, so the swap happens on the resolved file rather than on the specifier.
 *
 * Also swaps `@azure/msal-browser` for a thin fake, but only when shared/services/auth-service.ts
 * imports it (the chat's own azure-ad MSAL instance). Everything else keeps the real package.
 */
function fakeMsalPlugin(): Plugin {
  return {
    name: "e2e-fake-msal",
    enforce: "pre",
    // Dev server, or the dedicated e2e build (`npm run e2e:build`, mode "e2e", output dist-e2e/).
    // The fake must never end up in a real build.
    apply: (_config, env) => env.command === "serve" || env.mode === "e2e",
    async resolveId(source, importer, options) {
      if (source === "@azure/msal-browser" && importer && path.normalize(importer.split("?")[0]) === realAuthService) {
        return fakeMsalBrowser;
      }
      if (!importer || !/authConfig/.test(source)) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && path.normalize(resolved.id) === realAuthConfig ? fakeAuthConfig : null;
    },
  };
}

function withoutRuntimeErrorModal(plugins: UserConfig["plugins"]): PluginOption[] {
  const isRuntimeErrorModal = (plugin: PluginOption) =>
    typeof plugin === "object" && plugin !== null && "name" in plugin && String(plugin.name).includes("runtime-error-modal");
  return (plugins ?? []).filter((plugin) => !isRuntimeErrorModal(plugin));
}

export default async function e2eConfig(env: ConfigEnv): Promise<UserConfig> {
  if (env.command === "build" && env.mode !== "e2e") {
    throw new Error("e2e/vite.e2e.config.ts only builds with --mode e2e (it bundles the fake MSAL).");
  }
  const base = typeof baseConfig === "function" ? await baseConfig(env) : await baseConfig;
  const overrides: UserConfig = {
    plugins: [fakeMsalPlugin()],
    // Everything runs over plain HTTP on a dedicated port: dev mode (443 + .pem files) is unusable in CI.
    server: { port: E2E_PORT, strictPort: true, host: "127.0.0.1", open: false, watch: { usePolling: false } },
    preview: { port: E2E_PORT, strictPort: true, host: "127.0.0.1", open: false },
    // Its own folder, so it never overwrites or ships as the real dist/public.
    build: { outDir: path.resolve(import.meta.dirname, "..", "dist-e2e"), emptyOutDir: true, sourcemap: true },
  };
  return mergeConfig({ ...base, plugins: withoutRuntimeErrorModal(base.plugins) }, overrides);
}
