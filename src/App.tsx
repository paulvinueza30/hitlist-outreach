import { useState, useEffect, useCallback, useMemo } from "react";
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

type View = "contacts" | "settings" | "stats";
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [contactReminders, setContactReminders] = useState<Record<string, number>>({});
  const DAILY_GOAL = 5;

  // Apply theme on mount and change
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("hitlist-theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

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

  const loadContactReminders = useCallback(async () => {
    try {
      const r = await invoke<Record<string, number>>("get_contact_reminders");
      setContactReminders(r ?? {});
    } catch (e) {
      console.error("Failed to load reminders:", e);
    }
  }, []);

  const setContactReminder = useCallback(async (contactId: string, ts: number | null) => {
    try {
      await invoke("set_contact_reminder", { contactId, ts });
      setContactReminders(prev => {
        const next = { ...prev };
        if (ts === null) delete next[contactId];
        else next[contactId] = ts;
        return next;
      });
    } catch (e) {
      console.error("Failed to set reminder:", e);
    }
  }, []);

  const setContactState = useCallback(async (contactId: string, state: string) => {
    try {
      await invoke("set_contact_state", { contactId, state });
      setContactStates((prev) => {
        const next = { ...prev };
        if (state === "") {
          delete next[contactId];
        } else {
          next[contactId] = state;
        }
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
    loadContactReminders();

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
  }, [loadConfig, loadAiConfig, loadContacts, loadOutreachLog, loadContactStates, loadContactReminders]);

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
        // Auto-detect reply: if any thread has >1 message, contact replied
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

  const markContacted = useCallback(async (id: string) => {
    try {
      const contact = contacts.find((p) => p.id === id);
      const name = contact
        ? `${contact.name.firstName} ${contact.name.lastName}`.trim()
        : "";
      const company = contact?.company?.name ?? null;
      await invoke("mark_contacted", { id, name, company });
      setContacts((prev) => prev.map((p) => (p.id === id ? { ...p, contacted: true } : p)));
      setSelectedContact((prev) => (prev?.id === id ? { ...prev, contacted: true } : prev));
      loadOutreachLog();
    } catch (e) {
      setError(String(e));
    }
  }, [contacts, loadOutreachLog]);

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

  const onConfigSaved = useCallback(async () => {
    await Promise.all([loadConfig(), loadAiConfig()]);
    setView("contacts");
  }, [loadConfig, loadAiConfig]);

  const aiConfigured = !!(aiConfig?.api_key);
  const snovConfigured = !!(config?.snov_client_id && config?.snov_client_secret);

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
          justifyContent: "space-between",
          padding: "0 14px",
          height: 42,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.3, color: "var(--primary)" }}>
          Hitlist
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
          {config && (
            <span
              style={{
                fontSize: 11,
                color: config.gmail_connected ? "var(--success)" : "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: config.gmail_connected ? "var(--success)" : "var(--text-muted)",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {config.gmail_connected ? "Gmail" : "No Gmail"}
            </span>
          )}
          {aiConfigured && (
            <span style={{ fontSize: 11, color: "var(--accent)" }}>✦ AI</span>
          )}
          {authPending && (
            <span style={{ fontSize: 11, color: "var(--warning)" }}>OAuth…</span>
          )}

          {/* Daily goal progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 44,
                height: 4,
                background: "var(--border)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (todayCount / DAILY_GOAL) * 100)}%`,
                  height: "100%",
                  background: todayCount >= DAILY_GOAL ? "var(--success)" : "var(--primary)",
                  transition: "width 0.3s",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 10,
                color: todayCount >= DAILY_GOAL ? "var(--success)" : "var(--text-muted)",
              }}
            >
              {todayCount}/{DAILY_GOAL}
            </span>
          </div>

          {/* Theme toggle */}
          <div
            style={{
              display: "flex",
              background: "var(--surface2)",
              borderRadius: "var(--radius)",
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
                  padding: "3px 8px",
                  fontSize: 13,
                  borderRadius: 0,
                  lineHeight: 1,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setView(view === "stats" ? "contacts" : "stats")}
            style={{
              background: view === "stats" ? "var(--accent)" : "var(--surface2)",
              color: view === "stats" ? "#fff" : "var(--text)",
              padding: "4px 10px",
              fontSize: 12,
            }}
            title="Outreach stats"
          >
            {view === "stats" ? "← Back" : "📊"}
          </button>
          <button
            onClick={() => setView(view === "settings" ? "contacts" : "settings")}
            style={{
              background: view === "settings" ? "var(--primary)" : "var(--surface2)",
              color: view === "settings" ? "#fff" : "var(--text)",
              padding: "4px 10px",
              fontSize: 12,
            }}
          >
            {view === "settings" ? "← Back" : "⚙"}
          </button>
          <button
            onClick={loadContacts}
            disabled={loading}
            style={{
              background: "var(--surface2)",
              color: "var(--text)",
              padding: "4px 10px",
              fontSize: 12,
            }}
          >
            {loading ? "…" : "↻"}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div
          style={{
            background: "color-mix(in srgb, var(--danger) 18%, transparent)",
            color: "var(--danger)",
            padding: "7px 14px",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "transparent", color: "var(--danger)", padding: "0 4px" }}
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
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <ContactList
            contacts={contacts}
            selected={selectedContact}
            loading={loading}
            onSelect={selectContact}
            contactStates={contactStates}
            contactReminders={contactReminders}
            onAddContact={() => setShowAddModal(true)}
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
            onSetContactState={setContactState}
            contactReminder={selectedContact ? (contactReminders[selectedContact.id] ?? null) : null}
            onSetContactReminder={setContactReminder}
          />
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <AddContactModal
          onClose={() => setShowAddModal(false)}
          onAdded={(newPeople) => {
            setContacts((prev) => [...prev, ...newPeople]);
            setShowAddModal(false);
          }}
          snovConfigured={snovConfigured}
          existingContacts={contacts}
        />
      )}

      {/* Status bar */}
      {view === "contacts" && (
        <div
          style={{
            height: 22,
            flexShrink: 0,
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: 10,
            fontSize: 10,
            color: "var(--text-muted)",
          }}
        >
          <span style={{ color: todayCount > 0 ? "var(--success)" : "var(--text-muted)" }}>
            {todayCount} today
          </span>
          <span style={{ opacity: 0.4 }}>•</span>
          <span>{totalContacted} total contacted</span>
        </div>
      )}
    </div>
  );
}
