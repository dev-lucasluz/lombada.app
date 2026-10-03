/**
 * Testa a lógica da cota de IA do Worker (server/ai.ts) sem rede: o Supabase e o Gemini são simulados.
 * Rodar: npm run test:logic
 */
import { build } from "esbuild";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)).replaceAll("\\", "/");
const outfile = `${root}node_modules/.tmp/ai.test-bundle.mjs`;
await build({ entryPoints: [`${root}server/ai.ts`], bundle: true, format: "esm", platform: "node", outfile, logLevel: "error" });
const { authorize, callGemini, precheckRequest, readJsonBody, dailyLimit, json, HttpError } = await import(pathToFileURL(outfile).href);

const env = { SUPABASE_URL: "https://sb.test", SUPABASE_PUBLISHABLE_KEY: "pk", GEMINI_API_KEY: "g", GEMINI_MODEL: "m", SCAN_DAILY_LIMIT: "30" };
let calls = [];
let gemini;
let consumeResult = true;
let refundOk = true;
let lastConsumeBody = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.endsWith("/rpc/consume_scan_quota")) lastConsumeBody = JSON.parse(init?.body ?? "{}");
  calls.push(u.replace("https://sb.test", "").replace("https://generativelanguage.googleapis.com/v1beta/models/m:", "gemini:"));
  if (u.endsWith("/auth/v1/user")) return new Response("{}", { status: 200 });
  if (u.endsWith("/rpc/consume_scan_quota")) return new Response(JSON.stringify(consumeResult), { status: 200 });
  if (u.endsWith("/rpc/refund_scan_quota")) return new Response(refundOk ? "true" : "{}", { status: refundOk ? 200 : 404 });
  if (u.includes("generateContent")) return gemini();
  throw new Error("fetch inesperado " + u);
};
const quiet = console.error;
console.error = () => {};
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realTimeout(fn, 0);

const ok = (value) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 });
const req = () => new Request("https://x.test/api/a", { method: "POST", headers: { Authorization: "Bearer t", "Content-Length": "10" }, body: "0123456789" });
const refunds = () => calls.filter((c) => c.includes("refund")).length;
let pass = 0;
let fail = 0;
const check = (name, cond, info = "") => {
  cond ? pass++ : fail++;
  console.log(cond ? "OK   " : "FALHA", name, cond ? "" : info);
};
const attempt = async (fn) => {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error };
  }
};

calls = [];
gemini = () => ok([1]);
let ctx = await authorize(req(), env);
let out = await callGemini(env, [{ text: "x" }], {}, ctx);
check("sucesso: consome antes e não devolve", calls.join(",") === "/auth/v1/user,/rest/v1/rpc/consume_scan_quota,gemini:generateContent" && JSON.stringify(out) === "[1]", calls.join(","));

calls = [];
let n = 0;
gemini = () => (n++, new Response("busy", { status: 503 }));
ctx = await authorize(req(), env);
let r = await attempt(() => callGemini(env, [{ text: "x" }], {}, ctx));
check("503 duas vezes: 2 tentativas, devolve 1 leitura, erro 502", n === 2 && refunds() === 1 && r.error instanceof HttpError && r.error.status === 502, `${n} ${calls}`);

calls = [];
n = 0;
gemini = () => (++n === 1 ? new Response("busy", { status: 503 }) : ok({ a: 1 }));
ctx = await authorize(req(), env);
out = await callGemini(env, [{ text: "x" }], {}, ctx);
check("503 e depois sucesso: sem devolução", n === 2 && refunds() === 0 && out.a === 1, calls.join(","));

calls = [];
gemini = () => new Response("quota", { status: 429 });
ctx = await authorize(req(), env);
r = await attempt(() => callGemini(env, [{ text: "x" }], {}, ctx));
check("429 do Google: devolve 1 leitura", r.error?.status === 429 && refunds() === 1, `${r.error?.status} ${calls}`);

calls = [];
gemini = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "isto não é json" }] } }] }), { status: 200 });
ctx = await authorize(req(), env);
r = await attempt(() => callGemini(env, [{ text: "x" }], {}, ctx));
check("resposta ilegível: devolve 1 leitura", r.error?.status === 502 && refunds() === 1, `${r.error?.status} ${calls}`);

calls = [];
consumeResult = false;
gemini = () => {
  throw new Error("não devia chamar o Gemini");
};
r = await attempt(() => authorize(req(), env));
check("cota esgotada: 429, sem chamar o Gemini e sem devolver", r.error?.status === 429 && !calls.some((c) => c.includes("gemini") || c.includes("refund")), `${r.error?.status} ${calls}`);
consumeResult = true;

calls = [];
refundOk = false;
gemini = () => new Response("x", { status: 500 });
ctx = await authorize(req(), env);
r = await attempt(() => callGemini(env, [{ text: "x" }], {}, ctx));
check("devolução recusada pelo banco: o erro original continua", r.error?.status === 502, `${r.error?.status}`);
refundOk = true;

calls = [];
gemini = () => new Response("x", { status: 500 });
await attempt(() => callGemini(env, [{ text: "x" }], {}));
check("sem contexto de cota: não devolve nada", refunds() === 0, calls.join(","));

// limite diário: valor inválido nunca desliga o limite
const limits = [["30", 30], ["12", 12], ["12.9", 12], ["abc", 30], ["", 30], ["0", 30], ["-5", 30], ["NaN", 30], [undefined, 30]];
check("dailyLimit: valores válidos e inválidos", limits.every(([raw, want]) => dailyLimit({ SCAN_DAILY_LIMIT: raw }) === want), JSON.stringify(limits.map(([raw]) => dailyLimit({ SCAN_DAILY_LIMIT: raw }))));
calls = [];
await authorize(req(), { ...env, SCAN_DAILY_LIMIT: "abc" });
check("authorize com limite inválido manda 30 ao banco", lastConsumeBody?.daily_limit === 30, JSON.stringify(lastConsumeBody));

const sample = json({ ok: true }, 201);
check("json(): status, no-store e nosniff", sample.status === 201 && sample.headers.get("Cache-Control") === "no-store" && sample.headers.get("X-Content-Type-Options") === "nosniff" && sample.headers.get("Content-Type") === "application/json");

// 400 do Gemini: chave inválida x foto/pedido recusado
calls = [];
gemini = () => new Response('{"error":{"message":"API key not valid. Please pass a valid API key."}}', { status: 400 });
ctx = await authorize(req(), env);
r = await attempt(() => callGemini(env, [{ text: "x" }], {}, ctx));
check("400 por chave inválida: mensagem da chave", r.error?.status === 502 && /GEMINI_API_KEY/.test(r.error.message), r.error?.message);
gemini = () => new Response('{"error":{"message":"Unable to process input image."}}', { status: 400 });
ctx = await authorize(req(), env);
r = await attempt(() => callGemini(env, [{ text: "x" }], {}, ctx));
check("400 por foto recusada: mensagem da foto, sem culpar a chave", r.error?.status === 502 && /não aceitou esta foto/.test(r.error.message) && !/GEMINI_API_KEY/.test(r.error.message), r.error?.message);

const pre = (headers, max) => {
  try {
    precheckRequest(new Request("https://x.test", { method: "POST", headers, body: "x" }), max);
    return "ok";
  } catch (error) {
    return error.status;
  }
};
check("precheck: sem Authorization → 401", pre({ "Content-Length": "5" }, 100) === 401);
check("precheck: sem Content-Length passa (o teto vale na leitura)", pre({ Authorization: "Bearer a" }, 100) === "ok");
check("precheck: grande demais → 413", pre({ Authorization: "Bearer a", "Content-Length": "999" }, 100) === 413);
check("precheck: normal → ok", pre({ Authorization: "Bearer a", "Content-Length": "50" }, 100) === "ok");

const body = (data, headers = {}) => new Request("https://x.test", { method: "POST", headers, body: data });
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const p of parts) controller.enqueue(new TextEncoder().encode(p)); controller.close(); } });
r = await attempt(() => readJsonBody(body('{"a":1}'), 100));
check("readJsonBody: JSON válido", r.value?.a === 1, JSON.stringify(r));
r = await attempt(() => readJsonBody(body("não é json"), 100));
check("readJsonBody: JSON inválido → 400", r.error?.status === 400);
r = await attempt(() => readJsonBody(body("null"), 100));
check("readJsonBody: null → 400", r.error?.status === 400);
r = await attempt(() => readJsonBody(body("[1,2]"), 100));
check("readJsonBody: lista → 400", r.error?.status === 400);
r = await attempt(() => readJsonBody(new Request("https://x.test", { method: "POST" }), 100));
check("readJsonBody: sem corpo → 400", r.error?.status === 400);
r = await attempt(() => readJsonBody(body(JSON.stringify({ x: "a".repeat(500) })), 100));
check("readJsonBody: corpo acima do teto → 413", r.error?.status === 413);
r = await attempt(() => readJsonBody(new Request("https://x.test", { method: "POST", body: streamOf(['{"x":"', "a".repeat(80), "b".repeat(80), '"}']), duplex: "half" }), 100));
check("readJsonBody: corpo em pedaços (sem Content-Length) também respeita o teto → 413", r.error?.status === 413, JSON.stringify(r.error?.status));

r = await attempt(() => authorize(req(), { ...env, GEMINI_API_KEY: "" }));
check("sem chave do Gemini: 503 claro", r.error?.status === 503);

globalThis.fetch = realFetch;
console.error = quiet;
globalThis.setTimeout = realTimeout;
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
