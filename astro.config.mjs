import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://elplacerdecompartir.com",
  security: {
    checkOrigin: false,
  },
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["webdev", "webprod", ".zerops.app", "localhost", "127.0.0.1", "elplacerdecompartir.com", ".elplacerdecompartir.com"],
    },
  },
});
