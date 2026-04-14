import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => ({
  base: "/",
  plugins: [
    preact(),
    VitePWA({
      registerType: "prompt",
      // Use injectManifest so we can add custom push/notificationclick handlers
      // in src/sw.ts while still letting Workbox inject the precache manifest.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      includeAssets: ["*.png", "*.svg", "*.ico"],
      manifest: {
        name: "OriginChats",
        short_name: "OriginChats",
        description: "Real-time chat client for the Rotur/OriginChats network",
        theme_color: "#050505",
        background_color: "#050505",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/dms.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/dms.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  publicDir: "public",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      "@": "/src",
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
}));
