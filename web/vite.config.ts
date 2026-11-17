import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    target: "es2020",
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-router") || id.includes("/react/") || id.includes("/react-dom/")) {
            return "react";
          }
          if (id.includes("@tanstack/react-query")) return "query";
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    // PWA/Service Worker intentionally disabled: the app runs inside a native
    // WebView from local assets, so a service worker only causes stale-cache bugs.
  ],
});
