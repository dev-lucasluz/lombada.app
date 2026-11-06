/**
 * Worker agendado (1x por dia): faz uma consulta leve ao Supabase para
 * o projeto do plano grátis não ser pausado por inatividade.
 * Usa só a chave publishable; com RLS a resposta vem vazia, mas a
 * consulta passa pelo banco e conta como uso.
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

async function ping(env: Env): Promise<string> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/works?select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  const msg = `Supabase respondeu ${res.status}`;
  if (!res.ok) throw new Error(`${msg}: ${await res.text()}`);
  return msg;
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(ping(env).then((m) => console.log(m)));
  },
};
