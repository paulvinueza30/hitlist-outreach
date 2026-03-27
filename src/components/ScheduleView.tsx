import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ScheduledEmail } from "../types";

type CalView = "week" | "month";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMondayOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isoDate(d: Date): string {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " at " + fmtTime(ts);
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function fmtWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday-based grid
  let dow = firstDay.getDay(); // 0=Sun
  const startPad = dow === 0 ? 6 : dow - 1;
  const cells: (Date | null)[] = Array(startPad).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const grid: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) grid.push(cells.slice(i, i + 7));
  return grid;
}

interface EditState {
  id: string;
  subject: string;
  body: string;
  date: string;
  time: string;
  saving: boolean;
  error: string | null;
}

export default function ScheduleView() {
  const [calView, setCalView] = useState<CalView>("month");
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));
  const [monthDate, setMonthDate] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;
  });
  const [emails, setEmails] = useState<ScheduledEmail[]>([]);
  const [selected, setSelected] = useState<ScheduledEmail | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await invoke<ScheduledEmail[]>("get_scheduled_emails");
      setEmails(list);
    } catch (e) {
      console.error("Failed to load scheduled emails:", e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await invoke("delete_scheduled_email", { id });
      setEmails(prev => prev.filter(e => e.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (email: ScheduledEmail) => {
    const d = new Date(email.scheduled_at * 1000);
    const dateStr = isoDate(d);
    const timeStr = d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
    setEditing({ id: email.id, subject: email.subject, body: email.body, date: dateStr, time: timeStr, saving: false, error: null });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setEditing(prev => prev ? { ...prev, saving: true, error: null } : null);
    try {
      const scheduled_at = Math.floor(new Date(`${editing.date}T${editing.time}:00`).getTime() / 1000);
      await invoke("update_scheduled_email", {
        id: editing.id,
        subject: editing.subject,
        body: editing.body,
        scheduledAt: scheduled_at,
      });
      setEmails(prev => prev.map(e =>
        e.id === editing.id ? { ...e, subject: editing.subject, body: editing.body, scheduled_at } : e
      ));
      if (selected?.id === editing.id) {
        setSelected(prev => prev ? { ...prev, subject: editing.subject, body: editing.body, scheduled_at } : null);
      }
      setEditing(null);
    } catch (e) {
      setEditing(prev => prev ? { ...prev, saving: false, error: String(e) } : null);
    }
  };

  const pending = emails.filter(e => e.status === "pending");
  const today = new Date(); today.setHours(0,0,0,0);

  // Week view days
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Month grid
  const monthGrid = getMonthGrid(monthDate.getFullYear(), monthDate.getMonth());

  const emailsForDay = (day: Date): ScheduledEmail[] =>
    emails.filter(e => sameDay(new Date(e.scheduled_at * 1000), day))
          .sort((a, b) => a.scheduled_at - b.scheduled_at);

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Calendar panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Calendar toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
          borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0,
        }}>
          <button
            onClick={() => {
              if (calView === "week") setWeekStart(prev => addDays(prev, -7));
              else setMonthDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; });
            }}
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", padding: "4px 10px", fontSize: 14, borderRadius: 5 }}
          >‹</button>
          <span style={{ fontWeight: 700, fontSize: 13, minWidth: 200, textAlign: "center" }}>
            {calView === "week" ? fmtWeekRange(weekStart) : fmtMonthYear(monthDate)}
          </span>
          <button
            onClick={() => {
              if (calView === "week") setWeekStart(prev => addDays(prev, 7));
              else setMonthDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; });
            }}
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", padding: "4px 10px", fontSize: 14, borderRadius: 5 }}
          >›</button>
          <button
            onClick={() => {
              setWeekStart(getMondayOf(new Date()));
              setMonthDate(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
            }}
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", padding: "4px 10px", fontSize: 11, borderRadius: 5, color: "var(--text-muted)" }}
          >Today</button>

          <div style={{ flex: 1 }} />

          {/* View toggle */}
          <div style={{ display: "flex", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            {(["week", "month"] as CalView[]).map(v => (
              <button
                key={v}
                onClick={() => setCalView(v)}
                style={{
                  background: calView === v ? "var(--primary)" : "transparent",
                  color: calView === v ? "#fff" : "var(--text-muted)",
                  padding: "4px 12px", fontSize: 11, fontWeight: calView === v ? 700 : 400,
                }}
              >{v.charAt(0).toUpperCase() + v.slice(1)}</button>
            ))}
          </div>

          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {pending.length} scheduled
          </span>
        </div>

        {/* Calendar grid */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {calView === "week" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", height: "100%", minHeight: 400 }}>
              {weekDays.map((day, i) => {
                const isToday = sameDay(day, new Date());
                const isPast = day < today;
                const dayEmails = emailsForDay(day);
                return (
                  <div
                    key={i}
                    style={{
                      borderRight: i < 6 ? "1px solid var(--border)" : undefined,
                      borderBottom: "1px solid var(--border)",
                      padding: 8,
                      background: isToday ? "color-mix(in srgb, var(--primary) 4%, var(--surface))" : "var(--surface)",
                      opacity: isPast ? 0.65 : 1,
                      display: "flex", flexDirection: "column", gap: 4,
                    }}
                  >
                    {/* Day header */}
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{DAYS[i]}</div>
                    <div style={{
                      fontSize: 18, fontWeight: isToday ? 800 : 400,
                      color: isToday ? "var(--primary)" : "var(--text)",
                      lineHeight: 1, marginBottom: 6,
                    }}>
                      {day.getDate()}
                    </div>
                    {dayEmails.map(email => (
                      <EmailPill
                        key={email.id}
                        email={email}
                        selected={selected?.id === email.id}
                        onClick={() => setSelected(selected?.id === email.id ? null : email)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {/* Month header row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
                {DAYS.map(d => (
                  <div key={d} style={{ padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {d}
                  </div>
                ))}
              </div>
              {monthGrid.map((week, wi) => (
                <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)", minHeight: 80 }}>
                  {week.map((day, di) => {
                    if (!day) return <div key={di} style={{ borderRight: di < 6 ? "1px solid var(--border)" : undefined, background: "var(--surface2)" }} />;
                    const isToday = sameDay(day, new Date());
                    const isPast = day < today;
                    const dayEmails = emailsForDay(day);
                    return (
                      <div
                        key={di}
                        style={{
                          borderRight: di < 6 ? "1px solid var(--border)" : undefined,
                          padding: 6,
                          background: isToday ? "color-mix(in srgb, var(--primary) 4%, var(--surface))" : "var(--surface)",
                          opacity: isPast ? 0.65 : 1,
                        }}
                      >
                        <div style={{
                          fontSize: 12, fontWeight: isToday ? 800 : 400,
                          color: isToday ? "var(--primary)" : "var(--text)",
                          marginBottom: 4, width: 22, height: 22,
                          borderRadius: "50%",
                          background: isToday ? "var(--primary)" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <span style={{ color: isToday ? "#fff" : "var(--text)", fontSize: 11 }}>{day.getDate()}</span>
                        </div>
                        {dayEmails.slice(0, 3).map(email => (
                          <EmailPill
                            key={email.id}
                            email={email}
                            selected={selected?.id === email.id}
                            onClick={() => setSelected(selected?.id === email.id ? null : email)}
                            compact
                          />
                        ))}
                        {dayEmails.length > 3 && (
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                            +{dayEmails.length - 3} more
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{
          width: 340, flexShrink: 0, borderLeft: "1px solid var(--border)",
          background: "var(--surface)", display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Scheduled Email</span>
            <button onClick={() => { setSelected(null); setEditing(null); }} style={{ background: "transparent", color: "var(--text-muted)", fontSize: 16, padding: "0 4px" }}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {editing ? (
              /* Edit form */
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>SUBJECT</div>
                  <input
                    value={editing.subject}
                    onChange={e => setEditing(prev => prev ? { ...prev, subject: e.target.value } : null)}
                    style={{ width: "100%", padding: "6px 8px", fontSize: 12 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>BODY</div>
                  <textarea
                    value={editing.body}
                    onChange={e => setEditing(prev => prev ? { ...prev, body: e.target.value } : null)}
                    style={{ width: "100%", padding: "6px 8px", fontSize: 12, height: 180, resize: "vertical" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>DATE</div>
                    <input type="date" value={editing.date} onChange={e => setEditing(prev => prev ? { ...prev, date: e.target.value } : null)} style={{ width: "100%", padding: "6px 8px", fontSize: 12 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>TIME</div>
                    <input type="time" value={editing.time} onChange={e => setEditing(prev => prev ? { ...prev, time: e.target.value } : null)} style={{ width: "100%", padding: "6px 8px", fontSize: 12 }} />
                  </div>
                </div>
                {editing.error && <div style={{ fontSize: 11, color: "var(--danger)" }}>{editing.error}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSaveEdit}
                    disabled={editing.saving}
                    style={{ background: "var(--primary)", color: "#fff", padding: "6px 16px", fontSize: 12, fontWeight: 600, flex: 1 }}
                  >{editing.saving ? "Saving…" : "Save Changes"}</button>
                  <button
                    onClick={() => setEditing(null)}
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", padding: "6px 12px", fontSize: 12 }}
                  >Cancel</button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>To</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{selected.contact_name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{selected.contact_email}</div>
                  {selected.contact_company && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{selected.contact_company}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Scheduled for</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{fmtDateTime(selected.scheduled_at)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Subject</div>
                  <div style={{ fontSize: 12 }}>{selected.subject}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Body</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px" }}>
                    {selected.body}
                  </div>
                </div>

                <div
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px",
                    background: selected.status === "sent"
                      ? "color-mix(in srgb, var(--success) 15%, transparent)"
                      : selected.status === "failed"
                      ? "color-mix(in srgb, var(--danger) 15%, transparent)"
                      : "color-mix(in srgb, var(--warning) 15%, transparent)",
                    borderRadius: 12,
                    fontSize: 11, fontWeight: 600,
                    color: selected.status === "sent" ? "var(--success)" : selected.status === "failed" ? "var(--danger)" : "var(--warning)",
                    alignSelf: "flex-start",
                  }}
                >
                  {selected.status === "pending" && "⏳ Pending"}
                  {selected.status === "sent" && "✓ Sent"}
                  {selected.status === "failed" && "✕ Failed"}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => startEdit(selected)}
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", padding: "6px 14px", fontSize: 12, flex: 1 }}
                  >✎ Edit</button>
                  <button
                    onClick={() => { if (confirm("Cancel this scheduled email?")) handleDelete(selected.id); }}
                    disabled={deleting === selected.id}
                    style={{ background: "transparent", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", padding: "6px 14px", fontSize: 12 }}
                  >{deleting === selected.id ? "…" : "Cancel"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmailPill({ email, selected, onClick, compact }: {
  email: ScheduledEmail;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const isOverdue = email.scheduled_at < Date.now() / 1000 && email.status === "pending";
  return (
    <div
      onClick={onClick}
      style={{
        background: selected
          ? "var(--primary)"
          : isOverdue
          ? "color-mix(in srgb, var(--danger) 15%, var(--surface2))"
          : "color-mix(in srgb, var(--accent) 15%, var(--surface2))",
        color: selected ? "#fff" : isOverdue ? "var(--danger)" : "var(--accent)",
        border: `1px solid ${selected ? "var(--primary)" : isOverdue ? "color-mix(in srgb, var(--danger) 30%, transparent)" : "color-mix(in srgb, var(--accent) 30%, transparent)"}`,
        borderRadius: 4,
        padding: compact ? "2px 5px" : "4px 7px",
        fontSize: compact ? 9 : 10,
        fontWeight: 500,
        cursor: "pointer",
        lineHeight: 1.3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        marginBottom: 2,
      }}
      title={`${email.contact_name} · ${email.subject}`}
    >
      {compact ? (
        email.contact_name
      ) : (
        <>
          <div style={{ fontSize: 9, opacity: 0.8 }}>{fmtTime(email.scheduled_at)}</div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{email.contact_name}</div>
        </>
      )}
    </div>
  );
}
