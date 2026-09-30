import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createReminder, deleteReminder, listReading, listReminders } from "../lib/db";
import "./pages.css";

const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });

export function RemindersPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: listReminders });
  const reading = useQuery({ queryKey: ["reading"], queryFn: listReading });

  const preset = params.get("leitura");
  const presetTitle = reading.data?.find((r) => r.id === preset)?.title;
  const [form, setForm] = useState({ date: "", message: "", readingId: preset ?? "" });

  const create = useMutation({
    mutationFn: () =>
      createReminder({
        remind_on: form.date,
        message: form.message.trim() || (presetTitle ? `Ver se ${presetTitle} voltou do hiato` : "Lembrete"),
        reading_entry_id: form.readingId || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reminders"] });
      setForm({ date: "", message: "", readingId: "" });
    },
  });

  const remove = useMutation({
    mutationFn: deleteReminder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Lembretes</h1>
          <p>Escolha um dia e o app avisa você. Útil para mangás em hiato com data prevista de volta.</p>
        </div>
      </header>

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2>Novo lembrete</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rm-date">Dia do aviso</label>
            <input id="rm-date" className="input" type="date" min={today} required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="rm-reading">Mangá relacionado (opcional)</label>
            <select id="rm-reading" className="input" value={form.readingId} onChange={(e) => setForm({ ...form, readingId: e.target.value })}>
              <option value="">Nenhuma</option>
              {reading.data?.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="rm-msg">Mensagem</label>
            <input
              id="rm-msg"
              className="input"
              placeholder={presetTitle ? `Ver se ${presetTitle} voltou do hiato` : "Ex.: volta do hiato de One Punch Man"}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={create.isPending} style={{ justifySelf: "start" }}>
          Criar lembrete
        </button>
        <p className="hint">O aviso chega como notificação neste aparelho, se você permitir, e aparece na tela inicial no dia marcado.</p>
        {create.isError && <p className="error" role="alert">{(create.error as Error).message}</p>}
      </form>

      {reminders.data && reminders.data.length > 0 && (
        <ul className="reading-list">
          {reminders.data.map((r) => {
            const d = new Date(`${r.remind_on}T12:00:00`);
            return (
              <li key={r.id} className={r.sent_at ? "reminder-row is-sent" : "reminder-row"}>
                <div className="reminder-date">
                  <span className="num">{d.getDate()}</span>
                  <small>{monthFmt.format(d).replace(".", "")}</small>
                </div>
                <div className="reminder-body">
                  <strong>{r.message}</strong>
                  {r.reading && <span className="hint">{r.reading.title}</span>}
                  {r.sent_at && <span className="hint">Enviado</span>}
                </div>
                <button className="btn btn-ghost btn-s" onClick={() => remove.mutate(r.id)} aria-label={`Apagar lembrete: ${r.message}`}>
                  Apagar
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
