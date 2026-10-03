import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCollection } from "./db";
import { formatRanges } from "./ranges";
import { parseVoiceText, prepareImage, scanShelfPhoto, suggestTargets, type DetectedSeries, type MatchTarget } from "./quickAdd";
import "../components/JobToast.css";

export type ReviewItem = DetectedSeries & {
  include: boolean;
  ownedText: string;
  missingText: string;
  targets: MatchTarget[] | null; // null = ainda buscando
  targetIndex: number;
  saved?: boolean;
  saveError?: string;
};

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

type Toast = { message: string; tone: "ok" | "error"; link: boolean };

type Job = {
  items: ReviewItem[] | null;
  setItems: (fn: (prev: ReviewItem[] | null) => ReviewItem[] | null) => void;
  /** Lendo a foto ou interpretando a fala (a IA está trabalhando). */
  reading: "foto" | "voz" | null;
  error: string | null;
  preview: string | null;
  startPhoto: (file: File) => void;
  startVoice: (text: string) => void;
  /** Repete a última leitura (a mesma foto ou fala) sem a pessoa precisar enviar de novo. */
  retry: (() => void) | null;
  clear: () => void;
};

const JobContext = createContext<Job | null>(null);

export function useQuickAddJob() {
  const ctx = useContext(JobContext);
  if (!ctx) throw new Error("useQuickAddJob precisa estar dentro de QuickAddJobProvider");
  return ctx;
}

/**
 * Guarda a leitura por foto/voz fora da tela "Foto e voz": a pessoa pode navegar
 * enquanto a IA lê e é avisada (aviso na tela) quando o resultado fica pronto.
 */
export function QuickAddJobProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [reading, setReading] = useState<Job["reading"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Identifica a leitura em andamento: se a pessoa começar outra, a antiga é ignorada.
  const runId = useRef(0);
  // A última entrada fica na memória (só até recarregar a página) para "Tentar de novo".
  const last = useRef<{ kind: "foto"; file: File } | { kind: "voz"; text: string } | null>(null);
  const announce = useRef<number | null>(null);

  const collection = useQuery({ queryKey: ["collection"], queryFn: listCollection });
  const qc = useQueryClient();

  const away = () => pathRef.current !== "/foto-e-voz";

  const clear = useCallback(() => {
    runId.current++;
    announce.current = null;
    setItems(null);
    setError(null);
    setReading(null);
    setToast(null);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
  }, []);

  const finish = (id: number, series: DetectedSeries[], emptyMessage: string) => {
    qc.invalidateQueries({ queryKey: ["scan-quota"] });
    if (id !== runId.current) return;
    setReading(null);
    if (series.length === 0) {
      setError(emptyMessage);
      if (away()) setToast({ message: emptyMessage, tone: "error", link: true });
      return;
    }
    announce.current = id;
    setItems(series.map(toReviewItem));
  };

  const fail = (id: number, err: unknown, fallback: string) => {
    qc.invalidateQueries({ queryKey: ["scan-quota"] });
    if (id !== runId.current) return;
    const message = err instanceof Error ? err.message : fallback;
    setReading(null);
    setError(message);
    if (away()) setToast({ message, tone: "error", link: true });
  };

  const startPhoto = (file: File) => {
    last.current = { kind: "foto", file };
    const id = ++runId.current;
    announce.current = null;
    setItems(null);
    setError(null);
    setToast(null);
    setReading("foto");
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return URL.createObjectURL(file);
    });
    prepareImage(file)
      .then(scanShelfPhoto)
      .then((series) =>
        finish(id, series, "Não encontramos lombadas nem capa nessa foto. Tente de frente, mais perto e com boa luz."),
      )
      .catch((err) => fail(id, err, "A leitura da foto falhou."));
  };

  const startVoice = (text: string) => {
    last.current = { kind: "voz", text };
    const id = ++runId.current;
    announce.current = null;
    setItems(null);
    setError(null);
    setToast(null);
    setReading("voz");
    parseVoiceText(text)
      .then((series) =>
        finish(id, series, "Não entendemos nenhuma série com volumes. Tente algo como “tenho Naruto do 1 ao 10”."),
      )
      .catch((err) => fail(id, err, "Não foi possível interpretar."));
  };

  const retry = () => {
    const l = last.current;
    if (!l) return;
    if (l.kind === "foto") startPhoto(l.file);
    else startVoice(l.text);
  };

  // Sugere a série de cada item (uma busca por vez: em paralelo o AniList recusa).
  const pendingKeys = items?.filter((i) => i.targets === null).map((i) => i.key).join(",") ?? "";
  useEffect(() => {
    if (!collection.data || !pendingKeys || !items) return;
    let cancelled = false;
    const pending = items.filter((i) => i.targets === null);
    (async () => {
      for (const it of pending) {
        if (cancelled) return;
        const targets = await suggestTargets(it.title, collection.data);
        if (cancelled) return;
        setItems((prev) =>
          prev?.map((x) => (x.key === it.key ? { ...x, targets, include: x.include && targets.length > 0 } : x)) ?? prev,
        );
        await new Promise((r) => setTimeout(r, 300));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.data, pendingKeys]);

  // Avisa quando terminou de procurar todas as séries, se a pessoa saiu da tela.
  useEffect(() => {
    if (!items || announce.current === null) return;
    if (items.some((i) => i.targets === null)) return;
    announce.current = null;
    if (away()) {
      setToast({
        message: `Leitura pronta: ${items.length} ${items.length === 1 ? "série encontrada" : "séries encontradas"}. Falta revisar e salvar.`,
        tone: "ok",
        link: true,
      });
    }
  }, [items]);

  return (
    <JobContext.Provider value={{ items, setItems, reading, error, preview, startPhoto, startVoice, retry: error && last.current ? retry : null, clear }}>
      {children}
      {toast && (
        <div className={`job-toast is-${toast.tone}`} role="status">
          <span>{toast.message}</span>
          {toast.link && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setToast(null);
                navigate("/foto-e-voz");
              }}
            >
              Ver resultado
            </button>
          )}
          <button className="job-toast-close" aria-label="Fechar aviso" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </JobContext.Provider>
  );
}
