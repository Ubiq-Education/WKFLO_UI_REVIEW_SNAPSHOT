import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite'
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(async ({ mode }) => {
  console.log(`Vite config mode: ${mode}`);
  const isLocalDev = mode === "development";

  return {
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          // Main authenticated SPA (unchanged default entry).
          main: path.resolve(import.meta.dirname, "client", "index.html"),
        },
      },
    },
    publicDir: path.resolve(import.meta.dirname, "client", "public"),
    server: isLocalDev
      ? {
          host: "0.0.0.0",
          port: 443,
          open: true,
          allowedHosts: ["localhost"],
          https: {
            key: fs.readFileSync("localhost-key.pem"),
            cert: fs.readFileSync("localhost.pem"),
          },
          watch: {
            usePolling: true,
          },
          hmr: {
            overlay: false,
          },
        }
      : {
          host: true,
          port: 80,
          open: true,
          allowedHosts: ["localhost"],
          watch: {
            usePolling: true,
          },
          hmr: {
            overlay: false,
          },
        },
    preview: isLocalDev
      ? {
          host: "0.0.0.0",
          port: 443,
          allowedHosts: ["localhost"],
          https: {
            key: fs.readFileSync("localhost-key.pem"),
            cert: fs.readFileSync("localhost.pem"),
          },
        }
      : {
          host: "0.0.0.0",
          port: 80,
          allowedHosts: ["localhost"],
        },
  };
});
