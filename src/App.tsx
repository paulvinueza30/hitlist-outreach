import React, { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Person,
  AppConfig,
  AiConfig,
  EmailThread,
  GeneratedEmail,
  GenerateEmailParams,
  OutreachEntry,
} from "./types";
import ContactList from "./components/ContactList";
import ContactDetail from "./components/ContactDetail";
import Settings from "./components/Settings";
import StatsView from "./components/StatsView";
import AddContactModal from "./components/AddContactModal";
import ScheduleView from "./components/ScheduleView";

type View = "contacts" | "add" | "settings" | "stats" | "schedule";
type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") {
    root.removeAttribute("data-theme");
  } else if (t === "dark") {
    root.setAttribute("data-theme", "mocha");
  } else {
    root.setAttribute("data-theme", "latte");
  }
}

export default function App() {
  const [view, setView] = useState<View>("contacts");
  const [contacts, setContacts] = useState<Person[]>([]);
  const [selectedContact, setSelectedContact] = useState<Person | null>(null);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [outreachLog, setOutreachLog] = useState<OutreachEntry[]>([]);
  const [contactStates, setContactStates] = useState<Record<string, string>>({});
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("hitlist-theme") as Theme) || "system"
  );

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("hitlist-theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      setConfig(cfg);
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }, []);

  const loadAiConfig = useCallback(async () => {
    try {
      const ai = await invoke<AiConfig>("get_ai_config");
      setAiConfig(ai);
    } catch (e) {
      console.error("Failed to load AI config:", e);
    }
  }, []);

  const loadOutreachLog = useCallback(async () => {
    try {
      const log = await invoke<OutreachEntry[]>("get_outreach_log");
      setOutreachLog(log);
    } catch (e) {
      console.error("Failed to load outreach log:", e);
    }
  }, []);

  const loadContactStates = useCallback(async () => {
    try {
      const states = await invoke<Record<string, string>>("get_contact_states");
      setContactStates(states ?? {});
    } catch (e) {
      console.error("Failed to load contact states:", e);
    }
  }, []);

  const setContactState = useCallback(async (contactId: string, state: string) => {
    try {
      await invoke("set_contact_state", { contactId, state });
      setContactStates((prev) => {
        const next = { ...prev };
        if (state === "") delete next[contactId];
        else next[contactId] = state;
        return next;
      });
    } catch (e) {
      console.error("Failed to set contact state:", e);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const people = await invoke<Person[]>("fetch_contacts");
      setContacts(people);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadAiConfig();
    loadContacts();
    loadOutreachLog();
    loadContactStates();

    const unlistenSuccess = listen("gmail-auth-success", () => {
      setAuthPending(false);
      loadConfig();
    });
    const unlistenError = listen<string>("gmail-auth-error", (event) => {
      setAuthPending(false);
      setError(`Gmail auth failed: ${event.payload}`);
    });

    return () => {
      unlistenSuccess.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [loadConfig, loadAiConfig, loadContacts, loadOutreachLog, loadContactStates]);

  const selectContact = useCallback(
    async (person: Person) => {
      setSelectedContact(person);
      setThreads([]);
      if (!config?.gmail_connected) return;
      const email = person.emails?.primaryEmail;
      if (!email) return;
      setThreadsLoading(true);
      try {
        const t = await invoke<EmailThread[]>("get_email_threads", { email });
        setThreads(t);
        const hasReply = t.some((thread) => thread.messages.length > 1);
        if (hasReply && contactStates[person.id] !== "failed") {
          setContactState(person.id, "replied");
        }
      } catch (e) {
        console.error("Failed to load threads:", e);
      } finally {
        setThreadsLoading(false);
      }
    },
    [config?.gmail_connected, contactStates, setContactState]
  );

  const startGmailAuth = useCallback(async () => {
    setAuthPending(true);
    setError(null);
    try {
      await invoke("start_gmail_auth");
    } catch (e) {
      setAuthPending(false);
      setError(String(e));
    }
  }, []);

  const sendEmail = useCallback(
    async (
      to: string,
      subject: string,
      body: string,
      threadId?: string,
      replyToMessageId?: string,
      contactId?: string,
      contactName?: string,
      contactCompany?: string
    ) => {
      await invoke("send_email", {
        to,
        subject,
        body,
        threadId: threadId ?? null,
        replyToMessageId: replyToMessageId ?? null,
        contactId: contactId ?? null,
        contactName: contactName ?? null,
        contactCompany: contactCompany ?? null,
      });
    },
    []
  );

  const onEmailSent = useCallback(
    (contactId: string) => {
      setContacts((prev) => prev.map((p) => (p.id === contactId ? { ...p, contacted: true } : p)));
      setSelectedContact((prev) => (prev?.id === contactId ? { ...prev, contacted: true } : prev));
      loadOutreachLog();
    },
    [loadOutreachLog]
  );

  const generateEmail = useCallback(
    async (params: GenerateEmailParams): Promise<GeneratedEmail> => {
      return await invoke<GeneratedEmail>("generate_email", {
        contactName: params.contactName,
        contactEmail: params.contactEmail,
        jobTitle: params.jobTitle,
        company: params.company,
        jobPostingText: params.jobPostingText,
        linkedinText: params.linkedinText,
        userNote: params.userNote,
      });
    },
    []
  );

  const deleteContact = useCallback(async (id: string) => {
    await invoke("delete_person", { id });
    setContacts((prev) => prev.filter((p) => p.id !== id));
    setSelectedContact((prev) => (prev?.id === id ? null : prev));
  }, []);

  const updateContact = useCallback(
    async (
      id: string,
      fields: { email?: string; linkedinUrl?: string; jobPostingUrl?: string; jobPostingLabel?: string }
    ) => {
      await invoke("update_person_fields", {
        id,
        email: fields.email ?? null,
        linkedinUrl: fields.linkedinUrl ?? null,
        jobPostingUrl: fields.jobPostingUrl ?? null,
        jobPostingLabel: fields.jobPostingLabel ?? null,
      });
      // Update local React state
      setContacts((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          return {
            ...p,
            emails: fields.email ? { primaryEmail: fields.email } : p.emails,
            linkedinLink: fields.linkedinUrl ? { primaryLinkUrl: fields.linkedinUrl } : p.linkedinLink,
            jobPosting: fields.jobPostingUrl
              ? { primaryLinkUrl: fields.jobPostingUrl, primaryLinkLabel: fields.jobPostingLabel || p.jobPosting?.primaryLinkLabel || "" }
              : p.jobPosting,
          };
        })
      );
      setSelectedContact((prev) => {
        if (!prev || prev.id !== id) return prev;
        return {
          ...prev,
          emails: fields.email ? { primaryEmail: fields.email } : prev.emails,
          linkedinLink: fields.linkedinUrl ? { primaryLinkUrl: fields.linkedinUrl } : prev.linkedinLink,
          jobPosting: fields.jobPostingUrl
            ? { primaryLinkUrl: fields.jobPostingUrl, primaryLinkLabel: fields.jobPostingLabel || prev.jobPosting?.primaryLinkLabel || "" }
            : prev.jobPosting,
        };
      });
    },
    []
  );

  const onConfigSaved = useCallback(async () => {
    await Promise.all([loadConfig(), loadAiConfig()]);
    setView("contacts");
  }, [loadConfig, loadAiConfig]);

  const aiConfigured = !!(aiConfig?.api_key);
  const snovConfigured = !!(config?.snov_client_id && config?.snov_client_secret);

  const exportCSV = useCallback(() => {
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Name", "Email", "Company", "Job Title", "LinkedIn", "Job Posting", "Contacted", "Status"].join(","),
      ...contacts.map((p) => [
        esc(`${p.name.firstName} ${p.name.lastName}`.trim()),
        esc(p.emails?.primaryEmail ?? ""),
        esc(p.company?.name ?? ""),
        esc(p.jobTitle ?? ""),
        esc(p.linkedinLink?.primaryLinkUrl ?? ""),
        esc(p.jobPosting?.primaryLinkUrl ?? ""),
        p.contacted ? "yes" : "no",
        contactStates[p.id] || "pending",
      ].join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hitlist-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [contacts, contactStates]);

  const todayCount = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA");
    return outreachLog.filter(
      (e) => new Date(e.ts * 1000).toLocaleDateString("en-CA") === today
    ).length;
  }, [outreachLog]);

  const totalContacted = useMemo(
    () => contacts.filter((p) => p.contacted).length,
    [contacts]
  );

  const THEME_OPTS: { value: Theme; label: string }[] = [
    { value: "light", label: "☀" },
    { value: "system", label: "⊙" },
    { value: "dark", label: "☾" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          height: 46,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 8,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              background: "linear-gradient(135deg, var(--primary), var(--accent))",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              color: "#fff",
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            H
          </div>
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: -0.3, color: "var(--primary)" }}>
            Hitlist
          </span>
        </div>

        {/* Main nav tabs */}
        <div
          style={{
            display: "flex",
            background: "var(--surface2)",
            borderRadius: 7,
            border: "1px solid var(--border)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <NavTab
            label="Outreach"
            icon="✉"
            active={view === "contacts"}
            onClick={() => setView("contacts")}
          />
          <NavTab
            label="Add Contacts"
            icon="+"
            active={view === "add"}
            onClick={() => setView("add")}
          />
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Status indicators */}
        {config && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: config.gmail_connected ? "var(--success)" : "var(--text-muted)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: config.gmail_connected ? "var(--success)" : "var(--text-muted)",
                flexShrink: 0,
              }}
            />
            <span>{config.gmail_connected ? "Gmail" : "No Gmail"}</span>
          </div>
        )}
        {aiConfigured && (
          <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>✦ AI</span>
        )}
        {authPending && (
          <span style={{ fontSize: 11, color: "var(--warning)" }}>OAuth…</span>
        )}

        {/* Theme toggle */}
        <div
          style={{
            display: "flex",
            background: "var(--surface2)",
            borderRadius: 6,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          {THEME_OPTS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              title={value.charAt(0).toUpperCase() + value.slice(1)}
              style={{
                background: theme === value ? "var(--primary)" : "transparent",
                color: theme === value ? "#fff" : "var(--text-muted)",
                padding: "4px 9px",
                fontSize: 14,
                borderRadius: 0,
                lineHeight: 1,
                width: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Icon buttons */}
        <IconButton
          title="Schedule (calendar)"
          active={view === "schedule"}
          onClick={() => setView(view === "schedule" ? "contacts" : "schedule")}
        >
          <IcoCalendar />
        </IconButton>
        <IconButton
          title="Outreach stats"
          active={view === "stats"}
          onClick={() => setView(view === "stats" ? "contacts" : "stats")}
        >
          <IcoChart />
        </IconButton>
        <IconButton
          title="Settings"
          active={view === "settings"}
          onClick={() => setView(view === "settings" ? "contacts" : "settings")}
        >
          <IcoGear />
        </IconButton>
        <IconButton
          title="Refresh contacts"
          onClick={loadContacts}
          disabled={loading}
        >
          <IcoRefresh />
        </IconButton>
        <IconButton
          title="Export contacts as CSV"
          onClick={exportCSV}
          disabled={contacts.length === 0}
        >
          <IcoDownload />
        </IconButton>
      </header>

      {/* Error banner */}
      {error && (
        <div
          style={{
            background: "color-mix(in srgb, var(--danger) 15%, transparent)",
            color: "var(--danger)",
            padding: "7px 14px",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
            borderBottom: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "transparent", color: "var(--danger)", padding: "0 4px", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main content */}
      {view === "settings" ? (
        <Settings
          config={config}
          aiConfig={aiConfig}
          onSaved={onConfigSaved}
          onStartAuth={startGmailAuth}
          authPending={authPending}
        />
      ) : view === "stats" ? (
        <StatsView log={outreachLog} contacts={contacts} contactStates={contactStates} />
      ) : view === "schedule" ? (
        <ScheduleView />
      ) : view === "add" ? (
        <AddContactModal
          isPage
          onClose={() => setView("contacts")}
          onAdded={(newPeople) => {
            setContacts((prev) => [...prev, ...newPeople]);
            setView("contacts");
          }}
          snovConfigured={snovConfigured}
          existingContacts={contacts}
        />
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <ContactList
            contacts={contacts}
            selected={selectedContact}
            loading={loading}
            onSelect={selectContact}
            contactStates={contactStates}
            onAddContact={() => setView("add")}
          />
          <ContactDetail
            contact={selectedContact}
            threads={threads}
            threadsLoading={threadsLoading}
            gmailConnected={config?.gmail_connected ?? false}
            aiConfigured={aiConfigured}
            onSendEmail={sendEmail}
            onEmailSent={onEmailSent}
            onStartAuth={startGmailAuth}
            onGenerateEmail={generateEmail}
            contactState={selectedContact ? (contactStates[selectedContact.id] ?? "") : ""}
            followUpDays={config?.follow_up_days ?? 7}
            onSetContactState={setContactState}
            onUpdateContact={updateContact}
            onDeleteContact={deleteContact}
          />
        </div>
      )}

      {/* Status bar */}
      {(view === "contacts" || view === "add") && (
        <div
          style={{
            height: 24,
            flexShrink: 0,
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: 12,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span style={{ color: todayCount > 0 ? "var(--success)" : "var(--text-muted)", fontWeight: todayCount > 0 ? 600 : 400 }}>
            {todayCount} today
          </span>
          <span style={{ opacity: 0.4 }}>•</span>
          <span>{totalContacted} total sent</span>
          <span style={{ opacity: 0.4 }}>•</span>
          <span>{contacts.length} contacts</span>
        </div>
      )}
    </div>
  );
}

// ── Nav Tab ─────────────────────────────────────────────────────────────────
function NavTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--primary)" : "transparent",
        color: active ? "#fff" : "var(--text-muted)",
        padding: "5px 12px",
        fontSize: 12,
        fontWeight: active ? 700 : 400,
        borderRadius: 0,
        display: "flex",
        alignItems: "center",
        gap: 5,
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 12 }}>{icon}</span>
      {label}
    </button>
  );
}

// ── Icon Button ─────────────────────────────────────────────────────────────
function IconButton({
  children,
  title,
  active,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: active ? "var(--accent)" : "var(--surface2)",
        color: active ? "#fff" : "var(--text-muted)",
        border: "1px solid var(--border)",
        width: 30,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        borderRadius: 6,
        flexShrink: 0,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

// ── Header SVG Icons ──────────────────────────────────────────────────────────
function IcoCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="12" height="11" rx="1.5"/>
      <line x1="1.5" y1="6.5" x2="13.5" y2="6.5"/>
      <line x1="4.5" y1="1" x2="4.5" y2="4"/>
      <line x1="10.5" y1="1" x2="10.5" y2="4"/>
    </svg>
  );
}
function IcoChart() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <rect x="1" y="8" width="3.5" height="6" rx="0.5"/>
      <rect x="5.75" y="5" width="3.5" height="9" rx="0.5"/>
      <rect x="10.5" y="2" width="3.5" height="12" rx="0.5"/>
    </svg>
  );
}
function IcoGear() {
  // Settings sliders icon (3 lines with adjustable dots — unambiguously "settings")
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <line x1="1.5" y1="4" x2="13.5" y2="4"/>
      <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
      <line x1="1.5" y1="11" x2="13.5" y2="11"/>
      <circle cx="5" cy="4" r="1.5" fill="var(--surface)"/>
      <circle cx="9.5" cy="7.5" r="1.5" fill="var(--surface)"/>
      <circle cx="6" cy="11" r="1.5" fill="var(--surface)"/>
    </svg>
  );
}
function IcoRefresh() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 7.5A5.5 5.5 0 1 1 9 2.5"/>
      <polyline points="9,1 9,4 12,4"/>
    </svg>
  );
}
function IcoDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7.5" y1="1.5" x2="7.5" y2="10"/>
      <polyline points="4.5,7.5 7.5,10.5 10.5,7.5"/>
      <line x1="2" y1="13.5" x2="13" y2="13.5"/>
    </svg>
  );
}
