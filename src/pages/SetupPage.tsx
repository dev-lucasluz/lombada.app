/** Mostrada quando o .env.local ainda não tem as chaves do Supabase. */
export function SetupPage() {
  return (
    <div className="page" style={{ paddingTop: "4rem" }}>
      <h1>Falta configurar o Supabase</h1>
      <p>
        Copie <code>.env.example</code> para <code>.env.local</code>, preencha{" "}
        <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> e reinicie o{" "}
        <code>npm run dev</code>. O passo a passo está no <code>README.md</code>.
      </p>
    </div>
  );
}
