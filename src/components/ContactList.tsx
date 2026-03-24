import { useState, useMemo } from "react";
import { Person } from "../types";

type Filter = "all" | "pending" | "contacted" | "failed" | "followup";
type SortOrder = "default" | "name_az" | "name_za" | "company" | "recent" | "oldest";

interface Props {
  contacts: Person[];
  selected: Person | null;
  loading: boolean;
  onSelect: (p: Person) => void;
  contactStates: Record<string, string>;
  contactReminders: Record<string, number>;
  onAddContact: () => void;
}

function fullName(p: Person) {
  return `${p.name.firstName} ${p.name.lastName}`.trim();
}

function dotColor(p: Person, states: Record<string, string>): string {
  const state = states[p.id];
  if (state === "failed") return "var(--text-muted)";
  if (p.contacted && state === "replied") return "var(--success)";
  if (p.contacted) return "var(--warning)";
  return "var(--primary)";
}

export default function ContactList({ contacts, selected, loading, onSelect, contactStates, contactReminders, onAddContact }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [sortOrder, setSortOrder] = useState<SortOrder>("default");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter((p) => {
      const matchesSearch =
        !q ||
        fullName(p).toLowerCase().includes(q) ||
        (p.company?.name ?? "").toLowerCase().includes(q) ||
        (p.jobTitle ?? "").toLowerCase().includes(q) ||
        (p.emails?.primaryEmail ?? "").toLowerCase().includes(q);
      const state = contactStates[p.id];
      const isFailed = state === "failed";
      const isContacted = p.contacted === true && !isFailed;
      const isPending = !p.contacted && !isFailed;
      const hasReminder = !!contactReminders[p.id];
      const matchesFilter =
        filter === "all" ||
        (filter === "pending" && isPending) ||
        (filter === "contacted" && isContacted) ||
        (filter === "failed" && isFailed) ||
        (filter === "followup" && hasReminder);
      return matchesSearch && matchesFilter;
    });
  }, [contacts, search, filter, contactStates]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortOrder) {
      case "name_az":
        return arr.sort((a, b) => fullName(a).localeCompare(fullName(b)));
      case "name_za":
        return arr.sort((a, b) => fullName(b).localeCompare(fullName(a)));
      case "company":
        return arr.sort((a, b) =>
          (a.company?.name ?? "\uffff").localeCompare(b.company?.name ?? "\uffff")
        );
      case "recent":
        return arr.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      case "oldest":
        return arr.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
      default:
        return arr;
    }
  }, [filtered, sortOrder]);

  // Float overdue reminders to top within current sort
  const withReminders = useMemo(() => {
    const now = Date.now() / 1000;
    return [...sorted].sort((a, b) => {
      const aOverdue = (contactReminders[a.id] ?? 0) > 0 && contactReminders[a.id] < now;
      const bOverdue = (contactReminders[b.id] ?? 0) > 0 && contactReminders[b.id] < now;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return 0;
    });
  }, [sorted, contactReminders]);

  const counts = useMemo(() => {
    const all = contacts.length;
    const failed = contacts.filter((p) => contactStates[p.id] === "failed").length;
    const contacted = contacts.filter(
      (p) => p.contacted === true && contactStates[p.id] !== "failed"
    ).length;
    const pending = contacts.filter(
      (p) => !p.contacted && contactStates[p.id] !== "failed"
    ).length;
    const followup = contacts.filter((p) => !!contactReminders[p.id]).length;
    return { all, pending, contacted, failed, followup };
  }, [contacts, contactStates, contactReminders]);

  const TABS: { key: Filter; label: (c: typeof counts) => string }[] = [
    { key: "pending", label: (c) => `Pending (${c.pending})` },
    { key: "contacted", label: (c) => `Contacted (${c.contacted})` },
    { key: "failed", label: (c) => `Failed (${c.failed})` },
    { key: "followup", label: (c) => `⏰ (${c.followup})` },
    { key: "all", label: (c) => `All (${c.all})` },
  ];

  return (
    <div
      style={{
        width: 268,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      {/* Search + Sort row */}
      <div style={{ padding: "8px 8px 4px", display: "flex", gap: 4 }}>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: "5px 8px", fontSize: 12 }}
        />
        <button
          onClick={onAddContact}
          title="Add contact"
          style={{
            background: "var(--accent)",
            color: "#fff",
            padding: "5px 10px",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          +
        </button>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          title="Sort order"
          style={{ width: 80, fontSize: 11, padding: "4px 4px" }}
        >
          <option value="default">Default</option>
          <option value="name_az">A → Z</option>
          <option value="name_za">Z → A</option>
          <option value="company">Company</option>
          <option value="recent">Recent</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", padding: "0 8px 6px", gap: 3 }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              flex: 1,
              padding: "3px 0",
              fontSize: 10,
              background: filter === key ? "var(--primary)" : "var(--surface2)",
              color: filter === key ? "#fff" : "var(--text-muted)",
            }}
          >
            {label(counts)}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <div style={{ padding: 16, color: "var(--text-muted)", textAlign: "center", fontSize: 12 }}>
            Loading…
          </div>
        )}
        {!loading && sorted.length === 0 && (
          <div style={{ padding: 16, color: "var(--text-muted)", textAlign: "center", fontSize: 12 }}>
            No contacts found
          </div>
        )}
        {withReminders.map((p) => {
          const isSelected = selected?.id === p.id;
          const state = contactStates[p.id];
          const dot = dotColor(p, contactStates);
          const reminderTs = contactReminders[p.id];
          const isOverdueReminder = reminderTs && reminderTs < Date.now() / 1000;
          return (
            <div
              key={p.id}
              onClick={() => onSelect(p)}
              style={{
                padding: "9px 10px",
                cursor: "pointer",
                background: isSelected ? "var(--surface2)" : "transparent",
                borderLeft: isSelected ? "2px solid var(--primary)" : "2px solid transparent",
                borderBottom: "1px solid var(--border)",
                transition: "background 0.1s",
                opacity: state === "failed" ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: dot,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontWeight: 500,
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textDecoration: state === "failed" ? "line-through" : "none",
                  }}
                >
                  {fullName(p)}
                </span>
                {state === "replied" && (
                  <span style={{ fontSize: 9, color: "var(--success)", flexShrink: 0 }}>↩</span>
                )}
                {reminderTs && (
                  <span
                    style={{
                      fontSize: 9,
                      color: isOverdueReminder ? "var(--danger)" : "var(--warning)",
                      flexShrink: 0,
                    }}
                  >
                    ⏰
                  </span>
                )}
              </div>
              {p.company?.name && (
                <div style={{ color: "var(--text-muted)", fontSize: 11, paddingLeft: 11 }}>
                  {p.company.name}
                </div>
              )}
              {p.jobTitle && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    paddingLeft: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.jobTitle}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
