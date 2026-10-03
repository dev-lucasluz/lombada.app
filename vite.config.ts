import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const demoStub = fileURLToPath(new URL("./src/lib/demo.stub.ts", import.meta.url));

/** No build de produção troca `src/lib/demo.ts` por um stub vazio, para o modo demo não ir ao site. */
function dropDemo(): Plugin {
  return {
    name: "lombada-drop-demo",
    apply: "build",
    enforce: "pre",
    resolveId(source, importer) {
      if (importer && /(^|\/)demo$/.test(source) && !importer.includes("node_modules")) return demoStub;
    },
  };
}

export default defineConfig({
  plugins: [react(), dropDemo()],
  server: {
    port: 5173,
    // As rotas /api (foto e voz) rodam no servidor local da Cloudflare:
    // deixe `npm run pages:dev` aberto em outro terminal para testá-las.
    proxy: { "/api": "http://localhost:8788" },
    // No Windows o observador de arquivos às vezes perde alterações; a varredura é mais confiável.
    watch: { usePolling: true, interval: 300 },
  },
});
