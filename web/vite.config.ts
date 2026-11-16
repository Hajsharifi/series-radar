import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "رادار",
        short_name: "رادار",
        description: "پیگیری سریال و فیلم‌هایی که به‌زودی می‌آیند",
        theme_color: "#070b16",
        background_color: "#070b16",
        display: "standalone",
        dir: "rtl",
        lang: "fa",
        start_url: "./",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
});