/**
 * Worker agendado (1x por dia): envia os lembretes cuja data chegou.
 * Usa a service role do Supabase (só aqui, nunca no navegador).
 *
 * Fase 2 — pronto: e-mail via Brevo.
 * Fase 2 — falta: web push (tabela push_subscriptions + chaves VAPID).
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  BREVO_API_KEY: string;
  MAIL_FROM_EMAIL: string;
  MAIL_FROM_NAME?: string;
  APP_URL: string;
}

type DueReminder = {
  id: string;
  message: string;
  remind_on: string;
  user_id: string;
  profile: { email: string | null; display_name: string | null; email_reminders: boolean } | null;
  reading: { title: string; last_chapter: number | null; source_url: string | null } | null;
};

function supabaseHeaders(env: Env) {
  // Secret keys novas (sb_secret_...) não são JWT: vão só no header apikey.
  return {
    apikey: env.SUPABASE_SECRET_KEY,
    "Content-Type": "application/json",
  };
}

function todayInBrazil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function sendEmail(env: Env, r: DueReminder) {
  if (!r.profile?.email || !r.profile.email_reminders) return;
  const chapter = r.reading?.last_chapter ? `<p>Você parou no capítulo ${r.reading.last_chapter}.</p>` : "";
  const link = r.reading?.source_url
    ? `<p><a href="${escapeHtml(r.reading.source_url)}">Continuar lendo</a></p>`
    : "";

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: env.MAIL_FROM_EMAIL, name: env.MAIL_FROM_NAME ?? "Lombada" },
      to: [{ email: r.profile.email, name: r.profile.display_name ?? undefined }],
      subject: `Lembrete: ${r.message}`,
      htmlContent: `<p><strong>${escapeHtml(r.message)}</strong></p>${
        r.reading ? `<p>${escapeHtml(r.reading.title)}</p>` : ""
      }${chapter}${link}<p><a href="${env.APP_URL}/leitura">Abrir o Lombada</a></p>`,
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}

async function run(env: Env) {
  const today = todayInBrazil();
  const select = "id,message,remind_on,user_id,reading:reading_entries(title,last_chapter,source_url)";
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/reminders?select=${encodeURIComponent(select)}&sent_at=is.null&remind_on=lte.${today}&limit=200`,
    { headers: supabaseHeaders(env) },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const due = (await res.json()) as DueReminder[];
  if (due.length === 0) return 0;

  // reminders.user_id aponta para auth.users, então os perfis vêm numa segunda consulta
  const ids = [...new Set(due.map((r) => r.user_id))].join(",");
  const profilesRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?select=id,email,display_name,email_reminders&id=in.(${ids})`,
    { headers: supabaseHeaders(env) },
  );
  const profiles = new Map(
    ((await profilesRes.json()) as (NonNullable<DueReminder["profile"]> & { id: string })[]).map((p) => [p.id, p]),
  );
  due.forEach((r) => (r.profile = profiles.get(r.user_id) ?? null));

  for (const r of due) {
    try {
      await sendEmail(env, r);
      await fetch(`${env.SUPABASE_URL}/rest/v1/reminders?id=eq.${r.id}`, {
        method: "PATCH",
        headers: supabaseHeaders(env),
        body: JSON.stringify({ sent_at: new Date().toISOString() }),
      });
    } catch (err) {
      console.error("Falha ao enviar lembrete", r.id, err);
    }
  }
  return due.length;
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
} satisfies ExportedHandler<Env>;
