/**
 * Worker do Lombada (Cloudflare Workers + arquivos estáticos).
 * Os arquivos do site (dist/) são servidos pela Cloudflare; só /api/* passa por
 * aqui (ver `run_worker_first` no wrangler.toml).
 */
import type { AiEnv } from "../server/ai";
import { json } from "../server/ai";
import { handleScanShelf } from "./api/scan-shelf";
import { handleParseVoice } from "./api/parse-voice";

export default {
  async fetch(request: Request, env: AiEnv): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/scan-shelf" || pathname === "/api/parse-voice") {
      if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
      return pathname === "/api/scan-shelf" ? handleScanShelf(request, env) : handleParseVoice(request, env);
    }

    return json({ error: "Rota não encontrada." }, 404);
  },
} satisfies ExportedHandler<AiEnv>;
