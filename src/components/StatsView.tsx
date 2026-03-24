import { useMemo } from "react";
import { OutreachEntry, Person } from "../types";

interface Props {
  log: OutreachEntry[];
  contacts: Person[];
  contactStates: Record<string, string>;
}

function localDateStr(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date().toLocaleDateString("en-CA");
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function StatsView({ log, contacts, contactStates }: Props) {
  const today = new Date().toLocaleDateString("en-CA");

  const todayCount = useMemo(
    () => log.filter((e) => localDateStr(e.ts) === today).length,
    [log, today]
  );

  const repliedCount = useMemo(
    () => contacts.filter((p) => contactStates[p.id] === "replied").length,
    [contacts, contactStates]
  );

  const contactedCount = useMemo(
    () => contacts.filter((p) => p.contacted === true && contactStates[p.id] !== "failed").length,
    [contacts, contactStates]
  );

  const replyRate = contactedCount > 0 ? Math.round((repliedCount / contactedCount) * 100) : 0;

  const grouped = useMemo(() => {
    const map = new Map<string, OutreachEntry[]>();
    for (const e of [...log].reverse()) {
      const d = localDateStr(e.ts);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return Array.from(map.entries());
  }, [log]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 28px",
        maxWidth: 620,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: "var(--primary)" }}>
        Outreach Stats
      </h2>

      {/* Summary row */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard label="Today" value={todayCount} accent="var(--primary)" />
        <StatCard label="All Time" value={log.length} accent="var(--accent)" />
        <StatCard label="Reply Rate" value={`${replyRate}%`} accent="var(--success)" />
      </div>

      {/* Timeline */}
      {grouped.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
          No outreach logged yet. Mark a contact as "Done" to start tracking.
        </div>
      ) : (
        grouped.map(([date, entries]) => (
          <div key={date} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {formatDay(date)}
              <span
                style={{
                  background: "var(--surface2)",
                  color: "var(--text-muted)",
                  borderRadius: 10,
                  padding: "1px 7px",
                  fontSize: 10,
                }}
              >
                {entries.length}
              </span>
            </div>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                overflow: "hidden",
              }}
            >
              {entries.map((e, i) => (
                <div
                  key={e.person_id + e.ts}
                  style={{
                    padding: "8px 12px",
                    borderBottom: i < entries.length - 1 ? "1px solid var(--border)" : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 500, fontSize: 12 }}>{e.name}</span>
                    {e.company && (
                      <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 6 }}>
                        @ {e.company}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {new Date(e.ts * 1000).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "16px 20px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}
