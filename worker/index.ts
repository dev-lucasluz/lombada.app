/**
 * Worker do Lombada (Cloudflare Workers + arquivos estáticos).
 * Os arquivos do site (dist/) são servidos pela Cloudflare; só /api/* passa por
 * aqui (ver `run_worker_first` no wrangler.toml).
 */
import type { AiEnv } from "../server/ai";
import { json } from "../server/ai";
import { handleScanShelf } from "./api/scan-shelf";
import { handleParseVoice } from "./api/parse-voice";
import { handleScanCover } from "./api/scan-cover";
import { handleScanQuota } from "./api/scan-quota";

export default {
  async fetch(request: Request, env: AiEnv): Promise<Response> {
    const { pathname } = new URL(request.url);

    const handlers: Record<string, { method: "GET" | "POST"; run: (request: Request, env: AiEnv) => Promise<Response> }> = {
      "/api/scan-shelf": { method: "POST", run: handleScanShelf },
      "/api/parse-voice": { method: "POST", run: handleParseVoice },
      "/api/scan-cover": { method: "POST", run: handleScanCover },
      "/api/scan-quota": { method: "GET", run: handleScanQuota },
    };
    const handler = handlers[pathname];
    if (handler) {
      if (request.method !== handler.method) return json({ error: "Método não permitido." }, 405);
      return handler.run(request, env);
    }

    return json({ error: "Rota não encontrada." }, 404);
  },
} satisfies ExportedHandler<AiEnv>;
