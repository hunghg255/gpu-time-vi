import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  site: "https://gpu-time-vi.pages.dev",
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: { strictPort: true },
    resolve: {
      alias: {
        // The schedule entry is built but not published; the site reads it
        // straight from the workspace build to show token roles.
        "gpu-time-vi/schedule": fileURLToPath(
          new URL("../../packages/core/dist/schedule.js", import.meta.url),
        ),
      },
    },
  },
});
