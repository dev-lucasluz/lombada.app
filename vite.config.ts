import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // As rotas /api (foto e voz) rodam no servidor local da Cloudflare:
    // deixe `npm run pages:dev` aberto em outro terminal para testá-las.
    proxy: { "/api": "http://localhost:8788" },
  },
});
