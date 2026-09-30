import { useState, type ChangeEvent } from "react";
import { supabase } from "../lib/supabase";
import "./pages.css";

type DetectedSpine = { title: string; volume: number | null; confidence: "alta" | "media" | "baixa" };

/** Reduz a foto para no máximo 1600px no maior lado e converte para JPEG (base64 sem prefixo). */
async function prepareImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

/**
 * Fase 3 (base pronta): envia a foto e mostra o que foi lido.
 * Falta: casar cada título com a coleção/catálogo e a tela de revisão que salva os volumes.
 */
export function ScanPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [spines, setSpines] = useState<DetectedSpine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setSpines(null);
    setError(null);
    setBusy(true);

    try {
      const image = await prepareImage(file);
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/scan-shelf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ image, mimeType: "image/jpeg" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "A leitura da foto falhou.");
      setSpines(body.spines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "A leitura da foto falhou.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Foto da estante</h1>
          <p>Fotografe uma prateleira por vez, de frente e com boa luz. Você revisa tudo antes de salvar.</p>
        </div>
      </header>

      <label className="btn btn-primary" style={{ justifySelf: "start" }}>
        {busy ? "Lendo as lombadas…" : "Tirar ou escolher foto"}
        <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy} className="visually-hidden" />
      </label>

      {error && <p className="error" role="alert">{error}</p>}

      {preview && (
        <img src={preview} alt="Foto enviada da estante" style={{ maxHeight: 320, width: "auto", borderRadius: "var(--radius-m)" }} />
      )}

      {spines && (
        <section className="panel">
          <h2>{spines.length} lombadas encontradas</h2>
          <ul className="reading-list">
            {spines.map((s, i) => (
              <li key={i} className="reminder-row">
                <div className="reminder-body">
                  <strong>{s.title}</strong>
                  <span className="hint">{s.volume ? `Volume ${s.volume}` : "Volume não identificado"}. Confiança {s.confidence}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
