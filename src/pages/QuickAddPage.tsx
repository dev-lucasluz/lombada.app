import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCollection } from "../lib/db";
import { formatRanges, parseRanges } from "../lib/ranges";
import {
  parseVoiceText,
  prepareImage,
  saveToCollection,
  scanShelfPhoto,
  suggestTargets,
  type DetectedSeries,
  type MatchTarget,
} from "../lib/quickAdd";
import { useSpeechToText } from "../lib/speech";
import { Icon } from "../components/Icon";
import "./pages.css";
import "./QuickAddPage.css";

type Mode = "foto" | "voz";

type ReviewItem = DetectedSeries & {
  include: boolean;
  ownedText: string;
  missingText: string;
  targets: MatchTarget[] | null; // null = ainda buscando
  targetIndex: number;
  saved?: boolean;
  saveError?: string;
};

export function QuickAddPage() {
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get("modo") === "voz" ? "voz" : "foto";
  const [items, setItems] = useState<ReviewItem[] | null>(null);

  const setMode = (m: Mode) => {
    setItems(null);
    setParams(m === "voz" ? { modo: "voz" } : {}, { replace: true });
  };

  return (
    <div className="page quick">
      <header className="page-head">
        <div>
          <h1>Foto e voz</h1>
          <p>Cadastre vários volumes de uma vez. Você revisa tudo antes de salvar.</p>
        </div>
      </header>

      <div className="segmented" role="group" aria-label="Como cadastrar">
        <button aria-pressed={mode === "foto"} onClick={() => setMode("foto")}>
          <Icon name="camera" size={18} /> Foto da estante
        </button>
        <button aria-pressed={mode === "voz"} onClick={() => setMode("voz")}>
          <Icon name="mic" size={18} /> Por voz
        </button>
      </div>

      {mode === "foto" ? <PhotoInput onDetected={setItems} /> : <VoiceInput onDetected={setItems} />}

      {items && <Review items={items} setItems={setItems} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entrada: foto
// ---------------------------------------------------------------------------
function PhotoInput({ onDetected }: { onDetected: (items: ReviewItem[]) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setError(null);
    setBusy(true);
    try {
      const series = await scanShelfPhoto(await prepareImage(file));
      if (series.length === 0) {
        setError("Não encontramos lombadas nessa foto. Tente de frente, mais perto e com boa luz.");
      } else {
        onDetected(series.map(toReviewItem));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "A leitura da foto falhou.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel quick-input">
      <p className="hint">Fotografe uma prateleira por vez, de frente e com boa luz. A foto é lida e descartada, não fica salva.</p>
      <div className="quick-photo">
        <label className={busy ? "btn btn-primary is-busy" : "btn btn-primary"}>
          <Icon name="camera" size={20} />
          {busy ? "Lendo as lombadas…" : "Tirar ou escolher foto"}
          <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy} className="visually-hidden" />
        </label>
        {preview && <img src={preview} alt="Foto enviada da estante" className="quick-preview" />}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Entrada: voz (ou texto digitado)
// ---------------------------------------------------------------------------
function VoiceInput({ onDetected }: { onDetected: (items: ReviewItem[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeechToText(useCallback((t: string) => setText(t), []));

  const interpret = async () => {
    speech.stop();
    setError(null);
    setBusy(true);
    try {
      const series = await parseVoiceText(text);
      if (series.length === 0) {
        setError("Não entendemos nenhuma série com volumes. Tente algo como “tenho Naruto do 1 ao 10”.");
      } else {
        onDetected(series.map(toReviewItem));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível interpretar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel quick-input">
      <p className="hint">
        Diga, por exemplo: “tenho Naruto do 1 ao 10, falta o 11, tenho do 12 ao 20, e One Piece do 1 ao 5”.
        {!speech.supported && " Este navegador não reconhece voz; digite no campo abaixo ou use o Chrome, Edge ou Safari."}
      </p>

      {speech.supported && (
        <button
          type="button"
          className={speech.listening ? "btn quick-mic is-listening" : "btn quick-mic"}
          onClick={() => (speech.listening ? speech.stop() : speech.start(text))}
          aria-pressed={speech.listening}
        >
          <Icon name="mic" size={22} />
          {speech.listening ? "Ouvindo… toque para parar" : "Falar"}
        </button>
      )}
      {speech.error && <p className="error" role="alert">{speech.error}</p>}

      <div className="field">
        <label htmlFor="voice-text">{speech.supported ? "O que foi entendido (dá para corrigir)" : "Seus volumes"}</label>
        <textarea
          id="voice-text"
          className="input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tenho Naruto do 1 ao 10, falta o 11…"
        />
      </div>

      <button className="btn btn-primary" style={{ justifySelf: "start" }} onClick={interpret} disabled={busy || text.trim().length < 3}>
        {busy ? "Interpretando…" : "Interpretar"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function toReviewItem(s: DetectedSeries): ReviewItem {
  return {
    ...s,
    include: true,
    ownedText: formatRanges(s.owned),
    missingText: formatRanges(s.missing),
    targets: null,
    targetIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Revisão (compartilhada entre foto e voz)
// ---------------------------------------------------------------------------
function Review({ items, setItems }: { items: ReviewItem[]; setItems: (fn: (prev: ReviewItem[] | null) => ReviewItem[] | null) => void }) {
  const qc = useQueryClient();
  const collection = useQuery({ queryKey: ["collection"], queryFn: listCollection });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const update = (key: string, patch: Partial<ReviewItem>) =>
    setItems((prev) => prev?.map((it) => (it.key === key ? { ...it, ...patch } : it)) ?? prev);

  // Sugere a série de cada item assim que a coleção estiver carregada.
  const pendingKeys = items.filter((i) => i.targets === null).map((i) => i.key).join(",");
  useEffect(() => {
    if (!collection.data || !pendingKeys) return;
    let cancelled = false;
    for (const it of items.filter((i) => i.targets === null)) {
      suggestTargets(it.title, collection.data).then((targets) => {
        if (!cancelled) update(it.key, { targets, include: it.include && targets.length > 0 });
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.data, pendingKeys]);

  const ready = items.filter((i) => i.include && !i.saved && i.targets && i.targets.length > 0);
  const stillLoading = items.some((i) => i.targets === null);

  const saveAll = async () => {
    setSaving(true);
    setDone(null);
    let count = 0;
    for (const it of ready) {
      try {
        await saveToCollection(it.targets![it.targetIndex], parseRanges(it.ownedText), parseRanges(it.missingText));
        update(it.key, { saved: true, saveError: undefined });
        count++;
      } catch (err) {
        update(it.key, { saveError: err instanceof Error ? err.message : "Não foi possível salvar." });
      }
    }
    await qc.invalidateQueries({ queryKey: ["collection"] });
    setDone(count);
    setSaving(false);
  };

  return (
    <section className="panel">
      <div className="block-head">
        <h2>Revise antes de salvar</h2>
        <span className="hint">{items.length} {items.length === 1 ? "série encontrada" : "séries encontradas"}</span>
      </div>

      <ul className="review-list">
        {items.map((it) => (
          <li key={it.key} className={it.saved ? "review-item is-saved" : "review-item"}>
            <label className="review-check">
              <input
                type="checkbox"
                checked={it.include && !it.saved}
                disabled={it.saved || !it.targets?.length}
                onChange={(e) => update(it.key, { include: e.target.checked })}
              />
              <span className="visually-hidden">Incluir {it.title}</span>
            </label>

            <div className="review-body">
              <div className="review-title">
                <strong>{it.title}</strong>
                {it.confidence && it.confidence !== "alta" && (
                  <span className="review-warn">{it.confidence === "baixa" ? "Leitura difícil, confira" : "Confira"}</span>
                )}
                {it.saved && <span className="review-ok">Salvo</span>}
              </div>

              <div className="field">
                <label htmlFor={`t-${it.key}`}>Série</label>
                {it.targets === null ? (
                  <span className="hint">Procurando a série…</span>
                ) : it.targets.length === 0 ? (
                  <span className="hint">
                    Não achamos essa série. Adicione pela <Link to="/adicionar">busca</Link>.
                  </span>
                ) : (
                  <select
                    id={`t-${it.key}`}
                    className="input"
                    value={it.targetIndex}
                    disabled={it.saved}
                    onChange={(e) => update(it.key, { targetIndex: Number(e.target.value) })}
                  >
                    {it.targets.map((t, i) => (
                      <option key={i} value={i}>{t.label}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="review-volumes">
                <div className="field">
                  <label htmlFor={`o-${it.key}`}>Volumes que tenho</label>
                  <input id={`o-${it.key}`} className="input" value={it.ownedText} disabled={it.saved} placeholder="Ex.: 1-10, 12" onChange={(e) => update(it.key, { ownedText: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`m-${it.key}`}>Volumes que faltam</label>
                  <input id={`m-${it.key}`} className="input" value={it.missingText} disabled={it.saved} placeholder="Opcional" onChange={(e) => update(it.key, { missingText: e.target.value })} />
                </div>
              </div>
              {it.saveError && <p className="error" role="alert">{it.saveError}</p>}
            </div>
          </li>
        ))}
      </ul>

      <div className="head-actions">
        <button className="btn btn-primary" onClick={saveAll} disabled={saving || ready.length === 0}>
          {saving ? "Salvando…" : `Salvar ${ready.length} ${ready.length === 1 ? "série" : "séries"} na coleção`}
        </button>
        {stillLoading && <span className="hint" style={{ alignSelf: "center" }}>Procurando as séries no catálogo…</span>}
      </div>
      {done !== null && (
        <p className="auth-notice" role="status">
          {done === 0 ? "Nada foi salvo." : `${done} ${done === 1 ? "série salva" : "séries salvas"} na coleção.`}{" "}
          <Link to="/colecao">Ver coleção</Link>
        </p>
      )}
    </section>
  );
}
