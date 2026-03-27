import { useState, useMemo, useEffect, useRef } from "react";
import { Person } from "../types";

type Filter = "all" | "pending" | "contacted" | "failed";
type SortOrder = "default" | "name_az" | "name_za" | "company" | "recent" | "oldest";

interface Props {
  contacts: Person[];
  selected: Person | null;
  loading: boolean;
  onSelect: (p: Person) => void;
  contactStates: Record<string, string>;
  onAddContact: () => void;
}

function fullName(p: Person) {
  return `${p.name.firstName} ${p.name.lastName}`.trim();
}

function relativeAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return "today";
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return `${Math.floor(d / 30)}mo`;
}

function dotColor(p: Person, states: Record<string, string>): string {
  const state = states[p.id];
  if (state === "failed") return "var(--text-muted)";
  if (p.contacted && state === "replied") return "var(--success)";
  if (p.contacted) return "var(--warning)";
  return "var(--primary)";
}

export default function ContactList({ contacts, selected, loading, onSelect, contactStates, onAddContact }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [sortOrder, setSortOrder] = useState<SortOrder>("default");
  const [kbIdx, setKbIdx] = useState(-1);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

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
      const matchesFilter =
        filter === "all" ||
        (filter === "pending" && isPending) ||
        (filter === "contacted" && isContacted) ||
        (filter === "failed" && isFailed);
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

  const counts = useMemo(() => {
    const all = contacts.length;
    const failed = contacts.filter((p) => contactStates[p.id] === "failed").length;
    const contacted = contacts.filter(
      (p) => p.contacted === true && contactStates[p.id] !== "failed"
    ).length;
    const pending = contacts.filter(
      (p) => !p.contacted && contactStates[p.id] !== "failed"
    ).length;
    return { all, pending, contacted, failed };
  }, [contacts, contactStates]);

  // Sync keyboard index when selected contact changes
  useEffect(() => {
    if (!selected) { setKbIdx(-1); return; }
    const idx = sorted.findIndex((p) => p.id === selected.id);
    setKbIdx(idx);
  }, [selected, sorted]);

  // Clamp kbIdx when sorted list shrinks
  useEffect(() => {
    setKbIdx((prev) => (prev >= sorted.length ? sorted.length - 1 : prev));
  }, [sorted]);

  // Filter shortcuts: 1=pending, 2=contacted, 3=failed, 4=all; g=jump to top
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "1") { setFilter("pending"); setKbIdx(0); }
      else if (e.key === "2") { setFilter("contacted"); setKbIdx(0); }
      else if (e.key === "3") { setFilter("failed"); setKbIdx(0); }
      else if (e.key === "4") { setFilter("all"); setKbIdx(0); }
      else if (e.key === "g") {
        setKbIdx(0);
        itemRefs.current[0]?.scrollIntoView({ block: "start" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // j/k keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setKbIdx((prev) => {
          const next = Math.min(prev + 1, sorted.length - 1);
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setKbIdx((prev) => {
          const next = Math.max(prev - 1, 0);
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "Enter") {
        setKbIdx((prev) => {
          if (prev >= 0 && prev < sorted.length) onSelect(sorted[prev]);
          return prev;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sorted, onSelect]);

  const TABS: { key: Filter; label: (c: typeof counts) => string }[] = [
    { key: "pending", label: (c) => `Uncontacted ${c.pending}` },
    { key: "contacted", label: (c) => `Contacted ${c.contacted}` },
    { key: "failed", label: (c) => `Failed ${c.failed}` },
    { key: "all", label: (c) => `All ${c.all}` },
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
      {/* Search + Sort + Add row */}
      <div style={{ padding: "10px 8px 6px", display: "flex", gap: 4 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="text"
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setKbIdx(0); }}
            style={{ width: "100%", padding: "6px 9px", paddingRight: 36, fontSize: 12 }}
          />
          {sorted.length > 0 && (
            <span style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--text-muted)", pointerEvents: "none" }}>
              {sorted.length}
            </span>
          )}
        </div>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          title="Sort order"
          style={{ width: 72, fontSize: 11, padding: "4px 4px" }}
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
      <div style={{ display: "flex", padding: "0 8px 8px", gap: 3 }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              flex: 1,
              padding: "4px 0",
              fontSize: 10,
              fontWeight: filter === key ? 600 : 400,
              background: filter === key ? "var(--primary)" : "var(--surface2)",
              color: filter === key ? "#fff" : "var(--text-muted)",
              borderRadius: 4,
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
        {sorted.map((p, i) => {
          const isSelected = selected?.id === p.id;
          const isKbFocused = kbIdx === i && !isSelected;
          const state = contactStates[p.id];
          const dot = dotColor(p, contactStates);
          const isStale = !p.contacted && state !== "failed" && p.createdAt
            && (Date.now() - new Date(p.createdAt).getTime()) > 7 * 24 * 60 * 60 * 1000;
          return (
            <div
              key={p.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              onClick={() => { setKbIdx(i); onSelect(p); }}
              style={{
                padding: "9px 12px",
                cursor: "pointer",
                background: isSelected
                  ? "color-mix(in srgb, var(--primary) 10%, var(--surface))"
                  : isKbFocused
                  ? "var(--surface2)"
                  : "transparent",
                borderLeft: isSelected ? "2px solid var(--primary)" : isKbFocused ? "2px solid var(--text-muted)" : "2px solid transparent",
                borderBottom: "1px solid var(--border)",
                transition: "background 0.1s",
                opacity: state === "failed" ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
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
                    flex: 1,
                    textDecoration: state === "failed" ? "line-through" : "none",
                  }}
                >
                  {fullName(p)}
                </span>
                {state === "replied" && (
                  <span style={{ fontSize: 10, color: "var(--success)", flexShrink: 0 }}>↩</span>
                )}
                {p.createdAt && (
                  <span style={{ fontSize: 9, color: isStale ? "var(--warning)" : "var(--text-muted)", flexShrink: 0, opacity: 0.7 }}>
                    {relativeAge(p.createdAt)}
                  </span>
                )}
              </div>
              {p.company?.name && (
                <div style={{ color: "var(--text-muted)", fontSize: 11, paddingLeft: 13, fontWeight: 500 }}>
                  {p.company.name}
                </div>
              )}
              {p.jobTitle && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    paddingLeft: 13,
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

      {/* Add button at bottom */}
      <div style={{ padding: "8px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <button
          onClick={onAddContact}
          style={{
            width: "100%",
            background: "var(--accent)",
            color: "#fff",
            padding: "7px 0",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
          }}
        >
          + Add Contacts
        </button>
        <div style={{ textAlign: "center", marginTop: 5, fontSize: 9, color: "var(--text-muted)", opacity: 0.6 }}>
          j/k · Enter · c compose · 1-4 filter · g top
        </div>
      </div>
    </div>
  );
}
