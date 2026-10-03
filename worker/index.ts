/**
 * Worker do Lombada (Cloudflare Workers + arquivos estáticos).
 * Os arquivos do site (dist/) são servidos pela Cloudflare; só /api/* e o vídeo da tela de login passam por
 * aqui (ver `run_worker_first` no wrangler.toml).
 */
import type { AiEnv } from "../server/ai";
import { json } from "../server/ai";
import { handleScanShelf } from "./api/scan-shelf";
import { handleParseVoice } from "./api/parse-voice";
import { handleScanQuota } from "./api/scan-quota";

type Env = AiEnv & { ASSETS: Fetcher };

/** Vídeos servidos com suporte a Range (o nome leva versão: ao trocar o vídeo, troque o nome aqui e no wrangler.toml). */
const RANGE_VIDEOS = new Set(["/media/login-intro-2.mp4"]);

/**
 * Entrega um arquivo pequeno de /media respondendo a pedidos parciais (Range → 206), que o Safari exige para
 * tocar <video>. O arquivo vem inteiro dos ativos do site e é fatiado aqui; o nome versionado permite cache longo.
 */
async function serveVideo(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Método não permitido." }, 405);
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: "GET" }));
  if (!asset.ok) return new Response("Não encontrado.", { status: 404 });

  const bytes = await asset.arrayBuffer();
  const total = bytes.byteLength;
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  const head = request.method === "HEAD";

  const match = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get("Range") ?? "").trim());
  if (match && (match[1] !== "" || match[2] !== "")) {
    let start: number;
    let end: number;
    if (match[1] === "") {
      // "bytes=-N": os últimos N bytes
      start = Math.max(0, total - Number(match[2]));
      end = total - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? total - 1 : Math.min(Number(match[2]), total - 1);
    }
    if (start >= total || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(head ? null : bytes.slice(start, end + 1), { status: 206, headers });
  }

  headers.set("Content-Length", String(total));
  return new Response(head ? null : bytes, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (RANGE_VIDEOS.has(pathname)) return serveVideo(request, env);

    const handlers: Record<string, { method: "GET" | "POST"; run: (request: Request, env: AiEnv) => Promise<Response> }> = {
      "/api/scan-shelf": { method: "POST", run: handleScanShelf },
      "/api/parse-voice": { method: "POST", run: handleParseVoice },
      "/api/scan-quota": { method: "GET", run: handleScanQuota },
    };
    const handler = handlers[pathname];
    if (handler) {
      if (request.method !== handler.method) return json({ error: "Método não permitido." }, 405);
      return handler.run(request, env);
    }

    return json({ error: "Rota não encontrada." }, 404);
  },
} satisfies ExportedHandler<Env>;
