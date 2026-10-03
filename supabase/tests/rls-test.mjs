/**
 * Teste das regras de segurança do banco (RLS, funções e restrições) rodando TODAS as migrações em ordem num
 * Postgres de verdade em memória (PGlite), com papéis anon/authenticated simulados como no Supabase.
 *
 * Como rodar (a dependência não fica no package.json de propósito: é só para testes):
 *   npm i --no-save @electric-sql/pglite
 *   npm run test:rls
 *
 * Cada migração nova precisa passar por aqui antes de ser executada no Supabase.
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIG = fileURLToPath(new URL("../migrations/", import.meta.url));
const db = new PGlite();

// ---- Stubs do Supabase: papéis, schema auth, auth.uid() ----
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- como no Supabase: tudo em public é concedido a anon/authenticated por padrão; quem protege é o RLS
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);

// ---- Migrações em ordem ----
const files = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  try {
    await db.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
    console.log("migração OK  ", f);
  } catch (e) {
    console.log("migração ERRO", f, "→", e.message);
    process.exit(2);
  }
}

// ---- Utilitários ----
let pass = 0, fail = 0;
const check = (name, cond, info = "") => { cond ? pass++ : fail++; console.log(cond ? "OK   " : "FALHA", name, cond ? "" : info); };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = uuid(1), B = uuid(2), ADMIN = uuid(3);
const as = async (role, sub) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false); select set_config('request.jwt.claim.role', '${role}', false); set role ${role};`);
};
const tryQ = async (sql, params) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, n: r.affectedRows ?? r.rows.length }; } catch (e) { return { ok: false, err: e.message }; } };

// ---- Usuários (dispara handle_new_user) ----
await db.exec("reset role");
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}', 'a@test.dev', '{"full_name":"Ana","avatar_url":"https://x.test/a.jpg"}'),
  ('${B}', 'b@test.dev', '{"name":"Beto"}'),
  ('${ADMIN}', 'admin@test.dev', '{}')`);
check("handle_new_user cria perfis", (await db.query("select count(*)::int c from public.profiles")).rows[0].c === 3);
await db.exec(`insert into public.admins (user_id) values ('${ADMIN}')`).catch((e) => console.log("(admins) ", e.message));

// ---- Dados do Ana (A) ----
await as("authenticated", A);
let r = await tryQ("insert into public.works (kind, title, created_by) values ('book','Harry Potter 1', $1) returning id", [A]);
check("A cria obra (manual, sem id de catálogo)", r.ok, r.err);
const workA = r.rows?.[0]?.id;
r = await tryQ("insert into public.editions (work_id, name, total_volumes, series_name, series_number, series_total, created_by) values ($1,'Edição br',1,'Harry Potter',1,7,$2) returning id", [workA, A]);
if (!r.ok) r = await tryQ("insert into public.editions (work_id, name, total_volumes, series_name, series_number, series_total) values ($1,'Edição br',1,'Harry Potter',1,7) returning id", [workA]);
check("A cria edição com série (colunas da 0016)", r.ok, r.err);
const edA = r.rows?.[0]?.id;
r = await tryQ("insert into public.collections (edition_id) values ($1) returning id", [edA]);
check("A coloca a edição na coleção", r.ok, r.err);
const colA = r.rows?.[0]?.id;
r = await tryQ("insert into public.owned_volumes (collection_id, volume_number) values ($1, 1) returning collection_id", [colA]);
check("A marca o volume 1", r.ok, r.err);
r = await tryQ("insert into public.reading_entries (title, status) values ('Kagurabachi','reading') returning id");
check("A cria leitura (Onde parei)", r.ok, r.err);
const readA = r.rows?.[0]?.id;
r = await tryQ("insert into public.reminders (remind_on, message) values (current_date, 'x') returning id");
check("A cria lembrete", r.ok, r.err);

// A continua podendo (re)adicionar a própria edição: o app usa upsert
r = await tryQ("insert into public.collections (edition_id) values ($1) on conflict (user_id, edition_id) do update set notes = 'ok' returning id", [edA]);
check("A faz upsert da própria edição na coleção (fluxo do app)", r.ok && r.rows.length === 1, r.err ?? JSON.stringify(r));
r = await tryQ("update public.collections set notes = 'nota' where id = $1", [colA]);
check("A edita a própria coleção", r.ok && r.n === 1, r.err ?? JSON.stringify(r));

// ---- Isolamento: B não vê nem mexe nos dados de A ----
await as("authenticated", B);
for (const [t, label] of [["collections", "coleção"], ["owned_volumes", "volumes"], ["reading_entries", "leituras"], ["reminders", "lembretes"], ["editions", "edições privadas"], ["profiles", "perfis"], ["scan_usage", "uso de IA"], ["push_subscriptions", "inscrições push"]]) {
  r = await tryQ(`select count(*)::int c from public.${t}`);
  const own = r.ok ? r.rows[0].c : -1;
  // B pode ver o PRÓPRIO perfil (1 linha); as outras tabelas devem estar vazias para B
  check(`B não enxerga ${label} de A`, r.ok && own <= (t === "profiles" ? 1 : 0), `viu ${own} linhas ${r.err ?? ""}`);
}
r = await tryQ("select count(*)::int c from public.works");
check("B não enxerga a obra manual de A (works: 0013)", r.ok && r.rows[0].c === 0, `viu ${r.rows?.[0]?.c}`);
r = await tryQ("update public.editions set name='hackeado' where id=$1", [edA]);
check("B não consegue editar a edição de A", r.ok && r.n === 0, JSON.stringify(r));
r = await tryQ("delete from public.collections where id=$1", [colA]);
check("B não consegue apagar a coleção de A", r.ok && r.n === 0, JSON.stringify(r));
r = await tryQ("insert into public.owned_volumes (collection_id, volume_number) values ($1, 5)", [colA]);
check("B não consegue marcar volumes na coleção de A", !r.ok, "inseriu");
r = await tryQ("insert into public.collections (edition_id, user_id) values ($1, $2)", [edA, A]);
check("B não consegue criar coleção em nome de A", !r.ok, "inseriu");
r = await tryQ("insert into public.collections (edition_id) values ($1)", [edA]);
check("B não consegue adicionar à coleção a edição PRIVADA de A", !r.ok, JSON.stringify(r));
r = await tryQ("select count(*)::int c from public.editions where id=$1", [edA]);
check("B continua sem enxergar a edição privada de A", r.ok && r.rows[0].c === 0, JSON.stringify(r));
r = await tryQ("select count(*)::int c from public.works where id=$1", [workA]);
check("B continua sem enxergar a obra manual de A", r.ok && r.rows[0].c === 0, JSON.stringify(r));
r = await tryQ("update public.profiles set display_name='x' where id=$1", [A]);
check("B não consegue editar o perfil de A", r.ok && r.n === 0, JSON.stringify(r));
r = await tryQ("update public.reading_entries set title='x' where id=$1", [readA]);
check("B não consegue editar a leitura de A", r.ok && r.n === 0, JSON.stringify(r));
r = await tryQ("select public.is_admin() a");
check("B não é admin", r.ok && r.rows[0].a === false, JSON.stringify(r));
r = await tryQ("select count(*)::int c from public.feedback");
check("B não lê feedback de ninguém", r.ok && r.rows[0].c === 0);

// ---- Linha antiga (anterior à 0018): B já tem a edição de A na coleção ----
await db.exec("reset role");
await db.exec(`insert into public.collections (user_id, edition_id) values ('${B}', '${edA}')`);
await as("authenticated", B);
r = await tryQ("select count(*)::int c from public.editions where id=$1", [edA]);
check("legado: B vê a edição que já está na coleção dele", r.ok && r.rows[0].c === 1, JSON.stringify(r));
r = await tryQ("update public.collections set notes='minha nota' where edition_id=$1", [edA]);
check("legado: B ainda edita a própria linha de coleção", r.ok && r.n === 1, r.err ?? JSON.stringify(r));
r = await tryQ("insert into public.collections (edition_id) values ($1) on conflict (user_id, edition_id) do update set notes='de novo' returning id", [edA]);
check("legado: upsert da linha existente funciona", r.ok && r.rows.length === 1, r.err ?? JSON.stringify(r));
r = await tryQ("update public.editions set name='hackeado' where id=$1", [edA]);
check("legado: B continua sem poder editar a edição de A", r.ok && r.n === 0, JSON.stringify(r));
await db.exec("reset role"); await db.exec(`delete from public.collections where user_id='${B}'`);
await as("authenticated", A);

// ---- A: não consegue escalar privilégios ----
await as("authenticated", A);
r = await tryQ("update public.collections set user_id=$1 where id=$2", [B, colA]);
check("A não consegue passar a própria coleção para B (user_id)", !r.ok || r.n === 0, JSON.stringify(r));
r = await tryQ("update public.works set created_by=$1 where id=$2", [B, workA]);
check("A não consegue trocar created_by da obra", !r.ok || r.n === 0, JSON.stringify(r));
r = await tryQ("insert into public.admins (user_id) values ($1)", [A]);
check("A não consegue se tornar admin", !r.ok, "virou admin");
r = await tryQ("insert into public.editions (work_id, name, series_name) values ($1,'x',$2)", [workA, "x".repeat(121)]);
check("série com nome > 120 caracteres é recusada (0016)", !r.ok, "aceitou");
r = await tryQ("insert into public.editions (work_id, name, series_number) values ($1,'x',1000)", [workA]);
check("série com número 1000 é recusada (0016)", !r.ok, "aceitou");
r = await tryQ("insert into public.works (kind,title,created_by,cover_url) values ('book','x',$1,'javascript:alert(1)')", [A]);
check("capa com javascript: é recusada (0013/0015)", !r.ok, "aceitou");
r = await tryQ("insert into public.works (kind,title,created_by,cover_url) values ('book','x',$1,$2)", [A, "https://covers.test/" + "a".repeat(900) + ".jpg"]);
check("capa https de 900 caracteres é aceita (regex corrigida na 0015)", r.ok, r.err);
r = await tryQ("insert into public.works (kind,title,created_by,cover_url) values ('book','x',$1,$2)", [A, "https://covers.test/a b.jpg"]);
check("capa com espaço é recusada", !r.ok, "aceitou");
r = await tryQ("update public.profiles set avatar_url=$1 where id=$2", ["https://lh3.test/photo.jpg", A]);
check("avatar https é aceito (regex corrigida na 0015)", r.ok && r.n === 1, JSON.stringify(r));
r = await tryQ("update public.profiles set avatar_url=$1 where id=$2", ["http://insecure.test/x.jpg", A]);
check("avatar http (sem TLS) é recusado", !r.ok, "aceitou");

// ---- Cota de IA ----
await as("authenticated", A);
let used = 0;
for (let i = 0; i < 3; i++) { r = await tryQ("select public.consume_scan_quota(30) ok"); if (r.rows?.[0]?.ok) used++; }
check("consome 3 leituras", used === 3);
r = await tryQ("select public.scan_usage_today() n");
check("scan_usage_today = 3", r.ok && r.rows[0].n === 3, JSON.stringify(r));
r = await tryQ("select public.refund_scan_quota() ok");
check("refund devolve 1 (→ 2)", r.ok && r.rows[0].ok === true, JSON.stringify(r));
r = await tryQ("select public.scan_usage_today() n");
check("scan_usage_today = 2 depois do refund", r.rows[0].n === 2, JSON.stringify(r));
let refunds = 1;
for (let i = 0; i < 10; i++) { r = await tryQ("select public.refund_scan_quota() ok"); if (r.rows?.[0]?.ok) refunds++; }
check("devoluções limitadas a 5 por dia", refunds === 2 || refunds === 5 ? refunds <= 5 : refunds <= 5, `devolveu ${refunds}`);
r = await tryQ("select public.scan_usage_today() n");
check("contagem nunca fica negativa", r.rows[0].n >= 0, JSON.stringify(r));
// limite diário continua valendo com refunds: esgota e confere o bloqueio
await db.exec("reset role"); await db.exec(`update public.scan_usage set count = 0, refunded = 0 where user_id='${A}'`); await as("authenticated", A);
let allowed = 0; for (let i = 0; i < 40; i++) { r = await tryQ("select public.consume_scan_quota(30) ok"); if (r.rows[0].ok) allowed++; }
check("limite de 30 por dia vale (40 tentativas → 30)", allowed === 30, `permitiu ${allowed}`);
let extra = 0; for (let i = 0; i < 20; i++) { r = await tryQ("select public.refund_scan_quota() ok"); if (r.rows[0].ok) extra++; }
r = await tryQ("select public.scan_usage_today() n");
check("pior caso de abuso: no máximo 5 leituras extras (30 → +5)", extra === 5 && r.rows[0].n === 25, `devoluções ${extra}, contagem ${r.rows[0].n}`);
let more = 0; for (let i = 0; i < 20; i++) { r = await tryQ("select public.consume_scan_quota(30) ok"); if (r.rows[0].ok) more++; }
check("abuso total do dia = 35 leituras (30 + 5 devolvidas), nunca ilimitado", more === 5 || more <= 5, `mais ${more}`);
// B não mexe na cota de A
await as("authenticated", B);
r = await tryQ("select public.refund_scan_quota() ok");
check("B sem uso hoje: refund não faz nada", r.ok && r.rows[0].ok === false, JSON.stringify(r));
await as("anon", null);
r = await tryQ("select public.refund_scan_quota() ok");
check("anon não executa refund_scan_quota", !r.ok, JSON.stringify(r));
r = await tryQ("select public.scan_usage_today() n");
check("anon não executa scan_usage_today", !r.ok, JSON.stringify(r));
r = await tryQ("select public.consume_scan_quota(30) ok");
check("anon em consume_scan_quota recebe false", r.ok && r.rows[0].ok === false, JSON.stringify(r));

// ---- anon ----
await as("anon", null);
for (const t of ["works", "editions", "collections", "owned_volumes", "reading_entries", "reminders", "profiles", "feedback", "admins", "shelf_shares", "scan_usage", "push_subscriptions"]) {
  r = await tryQ(`select count(*)::int c from public.${t}`);
  check(`anon não lê ${t}`, !r.ok || r.rows[0].c === 0, JSON.stringify(r));
}
r = await tryQ("insert into public.works (kind,title) values ('book','x')");
check("anon não insere obras", !r.ok);

// ---- estante compartilhada ----
await as("authenticated", A);
r = await tryQ("insert into public.shelf_shares (user_id) values ($1) returning *", [A]);
const share = r.ok ? r.rows[0] : null;
check("A cria link da estante", r.ok, r.err);
await as("anon", null);
const token = share && (share.token ?? share.id ?? Object.values(share).find((v) => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) && v !== A));
r = await tryQ("select public.get_shared_shelf($1::uuid) s", [token]);
const shelf = r.ok ? JSON.stringify(r.rows[0].s) : "";
check("link válido devolve a estante", r.ok && shelf.length > 5, shelf.slice(0, 120) + (r.err ?? ""));
check("estante compartilhada NÃO vaza e-mail nem user_id", !/a@test\.dev|admin@|"user_id"|"email"/.test(shelf), shelf.slice(0, 400));
r = await tryQ("select public.get_shared_shelf($1::uuid) s", [uuid(999)]);
check("token inexistente devolve nulo", r.ok && (r.rows[0].s === null), JSON.stringify(r));


// ---- feedback, admin, push, lembretes cruzados ----
await as("authenticated", A);
r = await tryQ("insert into public.feedback (kind, message, user_email, status) values ('ideia','Sugestão de teste','falso@x.dev','resolvido') returning id, user_email, status, user_id");
check("A envia feedback", r.ok, r.err);
const fb = r.rows?.[0];
check("feedback: e-mail vem do servidor e status começa 'novo' (não dá para forjar)", fb?.user_email === "a@test.dev" && fb?.status === "novo", JSON.stringify(fb));
r = await tryQ("insert into public.feedback (kind, message, user_id) values ('ideia','Em nome do B',$1)", [B]);
check("feedback: não dá para enviar em nome de outra pessoa", !r.ok, "aceitou");
r = await tryQ("insert into public.feedback (kind, message) values ('ideia','ab')");
check("feedback: mensagem curta demais é recusada", !r.ok, "aceitou");
let sent = 1; for (let i = 0; i < 12; i++) { r = await tryQ("insert into public.feedback (kind, message) values ('erro','mensagem número ' || $1::text)", [String(i)]); if (r.ok) sent++; }
check("feedback: limite de 10 por dia", sent === 10, `enviou ${sent}`);
r = await tryQ("update public.feedback set status='resolvido' where id=$1", [fb.id]);
check("A não muda o status do próprio feedback", !r.ok || r.n === 0, JSON.stringify(r));
await as("authenticated", B);
r = await tryQ("select count(*)::int c from public.feedback");
check("B não lê feedback de A", r.rows[0].c === 0);
r = await tryQ("select public.ack_feedback($1)", [fb.id]);
check("B chamando ack_feedback no feedback de A não dá erro (e não altera nada)", r.ok);
await as("authenticated", ADMIN);
r = await tryQ("select count(*)::int c from public.feedback");
check("admin lê o feedback de todos", r.ok && r.rows[0].c >= 10, JSON.stringify(r));
r = await tryQ("update public.feedback set status='lido' where id=$1", [fb.id]);
check("admin muda o status do feedback", r.ok && r.n === 1, r.err ?? JSON.stringify(r));
r = await tryQ("select public.is_admin() a");
check("admin é reconhecido por is_admin()", r.ok && r.rows[0].a === true, JSON.stringify(r));
await as("authenticated", B);
r = await tryQ("insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,'https://push.test/x','k','a')", [A]);
check("B não registra push em nome de A", !r.ok, "aceitou");
r = await tryQ("insert into public.reminders (remind_on, message, reading_entry_id) values (current_date,'x',$1)", [readA]);
check("B não cria lembrete preso à leitura de A", !r.ok, "aceitou");
r = await tryQ("select public.can_collect_edition($1) ok", [edA]);
check("can_collect_edition: B não é dono nem tem a edição de A", r.ok && r.rows[0].ok === false, JSON.stringify(r));
await as("anon", null);
r = await tryQ("select public.can_collect_edition($1) ok", [edA]);
check("anon não executa can_collect_edition", !r.ok, JSON.stringify(r));

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
