import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createReminder, deleteReminder, listReading, listReminders, updateReminder, type Reminder } from "../lib/db";
import "./pages.css";

const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });

const emptyForm = (readingId = "") => ({ date: "", message: "", readingId });

export function RemindersPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: listReminders });
  const reading = useQuery({ queryKey: ["reading"], queryFn: listReading });

  const preset = params.get("leitura");
  const presetTitle = reading.data?.find((r) => r.id === preset)?.title;
  const [form, setForm] = useState(emptyForm(preset ?? ""));
  // Quando preenchido, o formulário edita este lembrete em vez de criar um novo.
  const [editingId, setEditingId] = useState<string | null>(null);

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const save = useMutation({
    mutationFn: async () => {
      const message = form.message.trim() || (presetTitle ? `Ver se ${presetTitle} voltou do hiato` : "Lembrete");
      if (editingId) {
        // Mudar o lembrete o "rearma": se já tinha sido avisado, volta a valer na nova data.
        await updateReminder(editingId, { remind_on: form.date, message, reading_entry_id: form.readingId || null });
      } else {
        await createReminder({ remind_on: form.date, message, reading_entry_id: form.readingId || null });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reminders"] });
      reset();
    },
  });

  const remove = useMutation({
    mutationFn: deleteReminder,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["reminders"] });
      if (id === editingId) reset();
    },
  });

  const edit = (r: Reminder) => {
    setEditingId(r.id);
    setForm({ date: r.remind_on, message: r.message, readingId: r.reading_entry_id ?? "" });
    document.getElementById("rm-date")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("rm-date")?.focus({ preventScroll: true });
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Lembretes</h1>
          <p>Escolha um dia e o lembrete aparece na tela inicial nesse dia. Útil para mangás em hiato com data prevista de volta.</p>
        </div>
      </header>

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2>{editingId ? "Editar lembrete" : "Novo lembrete"}</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rm-date">Dia do aviso</label>
            <input
              id="rm-date"
              className="input"
              type="date"
              min={editingId ? undefined : today}
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="rm-reading">Mangá relacionado (opcional)</label>
            <select id="rm-reading" className="input" value={form.readingId} onChange={(e) => setForm({ ...form, readingId: e.target.value })}>
              <option value="">Nenhum</option>
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
        <div className="head-actions">
          <button className="btn btn-primary" type="submit" disabled={save.isPending}>
            {editingId ? "Salvar alterações" : "Criar lembrete"}
          </button>
          {editingId && (
            <button className="btn btn-ghost" type="button" onClick={reset}>Cancelar edição</button>
          )}
        </div>
        <p className="hint">O lembrete aparece na tela inicial no dia marcado. O app ainda não envia notificações no celular.</p>
        {save.isError && <p className="error" role="alert">{(save.error as Error).message}</p>}
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
                <div className="reminder-actions">
                  <button className="btn btn-ghost btn-s" onClick={() => edit(r)} aria-label={`Editar lembrete: ${r.message}`}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-s" onClick={() => remove.mutate(r.id)} aria-label={`Apagar lembrete: ${r.message}`}>
                    Apagar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
