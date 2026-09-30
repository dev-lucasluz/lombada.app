import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reconhecimento de fala do próprio navegador (Web Speech API): grátis, sem chave.
 * Chrome, Edge e Safari têm; Firefox não. Os tipos não vêm no TypeScript padrão,
 * por isso a declaração mínima abaixo.
 */
type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "O navegador bloqueou o microfone. Libere o acesso nas permissões do site e tente de novo.",
  "service-not-allowed": "O navegador bloqueou o microfone. Libere o acesso nas permissões do site e tente de novo.",
  "no-speech": "Não ouvimos nada. Toque em Falar e diga os volumes.",
  "audio-capture": "Nenhum microfone encontrado neste aparelho.",
  network: "O reconhecimento de voz precisa de internet. Verifique a conexão.",
};

/**
 * Grava enquanto `listening` for true. `onText` recebe o texto acumulado
 * (frases finais + a parcial em andamento) a cada novo trecho reconhecido.
 */
export function useSpeechToText(onText: (text: string) => void) {
  const supported = typeof window !== "undefined" && Boolean(getCtor());
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const finalText = useRef("");

  useEffect(() => () => recognition.current?.stop(), []);

  const start = useCallback(
    (initialText = "") => {
      const Ctor = getCtor();
      if (!Ctor) return;
      setError(null);
      finalText.current = initialText ? `${initialText.trim()} ` : "";

      const rec = new Ctor();
      rec.lang = "pt-BR";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const piece = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText.current += `${piece.trim()} `;
          else interim += piece;
        }
        onText((finalText.current + interim).trim());
      };
      rec.onerror = (e) => {
        if (e.error !== "aborted") setError(ERROR_MESSAGES[e.error] ?? "O reconhecimento de voz falhou. Tente de novo.");
      };
      rec.onend = () => setListening(false);
      recognition.current = rec;
      rec.start();
      setListening(true);
    },
    [onText],
  );

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, error, start, stop };
}
