import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Person, EmailThread, GeneratedEmail, GenerateEmailParams, ContactContext, AiPromptPreview } from "../types";
import AiDebugModal from "./AiDebugModal";

interface Props {
  contact: Person | null;
  threads: EmailThread[];
  threadsLoading: boolean;
  gmailConnected: boolean;
  aiConfigured: boolean;
  contactState: string;
  followUpDays: number;
  onSendEmail: (
    to: string,
    subject: string,
    body: string,
    threadId?: string,
    replyToMessageId?: string,
    contactId?: string,
    contactName?: string,
    contactCompany?: string
  ) => Promise<void>;
  onEmailSent: (contactId: string) => void;
  onStartAuth: () => Promise<void>;
  onGenerateEmail: (params: GenerateEmailParams) => Promise<GeneratedEmail>;
  onSetContactState: (id: string, state: string) => Promise<void>;
  onUpdateContact: (id: string, fields: { email?: string; linkedinUrl?: string; jobPostingUrl?: string; jobPostingLabel?: string }) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
}

type Tab = "threads" | "job" | "linkedin";

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function decodeEntities(str: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

function cleanText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

function openExternal(url: string) {
  invoke("open_external_url", { url }).catch(console.error);
}

export default function ContactDetail({
  contact,
  threads,
  threadsLoading,
  gmailConnected,
  aiConfigured,
  contactState,
  followUpDays,
  onSendEmail,
  onEmailSent,
  onStartAuth,
  onGenerateEmail,
  onSetContactState,
  onUpdateContact,
  onDeleteContact,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("threads");
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState<{
    threadId: string;
    messageId: string;
    subject: string;
  } | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  // Edit mode for contact fields
  const [editing, setEditing] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editLinkedin, setEditLinkedin] = useState("");
  const [editJobUrl, setEditJobUrl] = useState("");
  const [editJobLabel, setEditJobLabel] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Per-tab AI context
  const [jobContext, setJobContext] = useState("");
  const [linkedinContext, setLinkedinContext] = useState("");

  // Contact notes
  const [contactNote, setContactNote] = useState("");

  // Copy email feedback
  const [emailCopied, setEmailCopied] = useState(false);

  // AI compose
  const [aiNotes, setAiNotes] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [samplesUsed, setSamplesUsed] = useState<number | null>(null);
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [aiTone, setAiTone] = useState<"professional" | "conversational" | "enthusiastic">("conversational");
  const [aiLength, setAiLength] = useState<"short" | "medium" | "long">("short");

  // AI debug
  const [aiDebugVisible, setAiDebugVisible] = useState(false);
  const [aiDebugData, setAiDebugData] = useState<AiPromptPreview | null>(null);
  const [aiDebugLoading, setAiDebugLoading] = useState(false);

  // Schedule mode
  const [scheduling, setScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);

  // Copy buttons
  const [subjectCopied, setSubjectCopied] = useState(false);
  const [bodyCopied, setBodyCopied] = useState(false);

  // Draft
  const [draftRestored, setDraftRestored] = useState(false);

  // Follow-up generation
  const [fuGenerating, setFuGenerating] = useState(false);
  const [fuError, setFuError] = useState<string | null>(null);
  const [fuSamplesUsed, setFuSamplesUsed] = useState<number | null>(null);

  // Auto-resize body textarea ref
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Debounce timers
  const contextSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted context + note when contact changes
  useEffect(() => {
    setActiveTab("threads");
    setComposing(false);
    setReplyTo(null);
    setSubject("");
    setBody("");
    setSendError(null);
    setExpandedThread(null);
    setExpandedMessages(new Set());
    setJobContext("");
    setLinkedinContext("");
    setContactNote("");
    setAiNotes("");
    setAiGenerating(false);
    setAiError(null);
    setSamplesUsed(null);
    setEditing(false);
    setEditError(null);
    setEmailCopied(false);
    setAiDebugVisible(false);
    setAiDebugData(null);
    setScheduling(false);
    setScheduleError(null);
    setScheduleSuccess(false);
    setDraftRestored(false);
    if (contextSaveTimer.current) clearTimeout(contextSaveTimer.current);
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);

    invoke<number>("get_writing_sample_count")
      .then((n) => setSampleCount(n))
      .catch(() => {});

    if (!contact?.id) return;
    const id = contact.id;

    invoke<ContactContext>("get_contact_context", { contactId: id })
      .then((ctx) => {
        if (ctx) {
          setJobContext(ctx.job || "");
          setLinkedinContext(ctx.linkedin || "");
        }
      })
      .catch(() => {});

    invoke<string>("get_contact_note", { contactId: id })
      .then((note) => setContactNote(note || ""))
      .catch(() => {});
  }, [contact?.id]);

  // Auto-resize body textarea
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.style.height = "auto";
      bodyRef.current.style.height = Math.max(160, bodyRef.current.scrollHeight) + "px";
    }
  }, [body]);

  // Draft auto-save to localStorage
  useEffect(() => {
    if (!contact?.id || !composing) return;
    if (!subject && !body) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      localStorage.setItem(`hitlist-draft-${contact.id}`, JSON.stringify({ subject, body }));
    }, 600);
  }, [contact?.id, subject, body, composing]);

  // Restore draft when composing starts
  useEffect(() => {
    if (!composing || !contact?.id || replyTo) return;
    if (subject || body) return; // already has content
    const saved = localStorage.getItem(`hitlist-draft-${contact.id}`);
    if (saved) {
      try {
        const { subject: s, body: b } = JSON.parse(saved);
        if (s) setSubject(s);
        if (b) setBody(b);
        setDraftRestored(true);
        setTimeout(() => setDraftRestored(false), 3000);
      } catch { /* ignore */ }
    }
  }, [composing, contact?.id, replyTo]);

  // Keyboard shortcuts: c = compose, Escape = cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "c" && !inInput && contact && !composing && !scheduling) {
        setComposing(true);
      } else if (e.key === "Escape") {
        if (composing) { setComposing(false); setReplyTo(null); }
        if (scheduling) { setScheduling(false); }
        if (aiDebugVisible) setAiDebugVisible(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [contact, composing, scheduling, aiDebugVisible]);

  const handleJobContextChange = useCallback(
    (text: string) => {
      setJobContext(text);
      if (!contact?.id) return;
      const id = contact.id;
      if (contextSaveTimer.current) clearTimeout(contextSaveTimer.current);
      contextSaveTimer.current = setTimeout(() => {
        invoke("save_contact_context", { contactId: id, job: text, linkedin: linkedinContext }).catch(() => {});
      }, 800);
    },
    [contact?.id, linkedinContext]
  );

  const handleLinkedinContextChange = useCallback(
    (text: string) => {
      setLinkedinContext(text);
      if (!contact?.id) return;
      const id = contact.id;
      if (contextSaveTimer.current) clearTimeout(contextSaveTimer.current);
      contextSaveTimer.current = setTimeout(() => {
        invoke("save_contact_context", { contactId: id, job: jobContext, linkedin: text }).catch(() => {});
      }, 800);
    },
    [contact?.id, jobContext]
  );

  const handleNoteChange = useCallback(
    (text: string) => {
      setContactNote(text);
      if (!contact?.id) return;
      const id = contact.id;
      if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
      noteSaveTimer.current = setTimeout(() => {
        invoke("save_contact_note", { contactId: id, note: text }).catch(() => {});
      }, 800);
    },
    [contact?.id]
  );

  if (!contact) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 40, opacity: 0.3 }}>✉</div>
        <div>Select a contact to get started</div>
      </div>
    );
  }

  const email = contact.emails?.primaryEmail ?? "";
  const contacted = contact.contacted === true;
  const jobUrl = contact.jobPosting?.primaryLinkUrl || null;
  const linkedinUrl = contact.linkedinLink?.primaryLinkUrl || null;
  const isFailed = contactState === "failed";
  const isReplied = contactState === "replied";

  const tabs: { key: Tab; label: string }[] = [
    { key: "threads", label: "Threads" },
    ...(jobUrl ? [{ key: "job" as Tab, label: "Job Posting" }] : []),
    ...(linkedinUrl ? [{ key: "linkedin" as Tab, label: "LinkedIn" }] : []),
  ];
  const showTabs = tabs.length > 1;

  const handleNewEmail = () => {
    setActiveTab("threads");
    setReplyTo(null);
    setSubject("");
    setBody("");
    setComposing(true);
    setSendError(null);
    setAiError(null);
  };

  const handleReply = (thread: EmailThread) => {
    const lastMsg = thread.messages[thread.messages.length - 1];
    const replySubject = thread.subject.startsWith("Re:")
      ? thread.subject
      : `Re: ${thread.subject}`;
    setReplyTo({ threadId: thread.id, messageId: lastMsg.id, subject: replySubject });
    setSubject(replySubject);
    setBody("");
    setActiveTab("threads");
    setComposing(true);
    setSendError(null);
    setAiError(null);
  };

  const handleSend = async () => {
    if (!email || !subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const contactName = contact
        ? `${contact.name.firstName} ${contact.name.lastName}`.trim()
        : undefined;
      const contactCompany = contact?.company?.name ?? undefined;
      await onSendEmail(
        email, subject, body,
        replyTo?.threadId, replyTo?.messageId,
        contact?.id, contactName, contactCompany
      );
      invoke("add_writing_sample", { text: body }).catch(() => {});
      setSampleCount((n) => n + 1);
      if (contact?.id) localStorage.removeItem(`hitlist-draft-${contact.id}`);
      setComposing(false);
      setBody("");
      setSubject("");
      setReplyTo(null);
      if (contact?.id) onEmailSent(contact.id);
    } catch (e) {
      setSendError(String(e));
    } finally {
      setSending(false);
    }
  };

  const handleGenerateEmail = async () => {
    setAiGenerating(true);
    setAiError(null);
    const toneMap = { professional: "Write in a formal, professional tone.", conversational: "Write in a natural, conversational tone.", enthusiastic: "Write with genuine enthusiasm and energy." };
    const lengthMap = { short: "Keep it under 80 words — very concise.", medium: "Target around 150 words.", long: "Write 200+ words with detail." };
    const toneDir = `${toneMap[aiTone]} ${lengthMap[aiLength]}`;
    const fullNote = [toneDir, aiNotes.trim()].filter(Boolean).join(" ");
    try {
      const result = await onGenerateEmail({
        contactName: `${contact.name.firstName} ${contact.name.lastName}`,
        contactEmail: email,
        jobTitle: contact.jobTitle ?? null,
        company: contact.company?.name ?? null,
        jobPostingText: jobContext.trim() || null,
        linkedinText: linkedinContext.trim() || null,
        userNote: fullNote || null,
      });
      setSubject(result.subject);
      setBody(result.body);
      setSamplesUsed(result.samples_used);
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiGenerating(false);
    }
  };

  const handleShowDebug = async () => {
    if (aiDebugVisible) { setAiDebugVisible(false); return; }
    if (aiDebugData) { setAiDebugVisible(true); return; }
    setAiDebugLoading(true);
    try {
      const preview = await invoke<AiPromptPreview>("get_ai_prompt_preview", {
        contactName: `${contact!.name.firstName} ${contact!.name.lastName}`,
        contactEmail: email,
        jobTitle: contact!.jobTitle ?? null,
        company: contact!.company?.name ?? null,
        jobPostingText: jobContext.trim() || null,
        linkedinText: linkedinContext.trim() || null,
        userNote: aiNotes.trim() || null,
      });
      setAiDebugData(preview);
      setAiDebugVisible(true);
    } catch (e) {
      console.error("Debug preview failed:", e);
    } finally {
      setAiDebugLoading(false);
    }
  };

  const handleSchedule = async () => {
    if (!email || !subject.trim() || !body.trim() || !scheduleDate) return;
    setScheduleSubmitting(true);
    setScheduleError(null);
    try {
      const scheduled_at = Math.floor(new Date(`${scheduleDate}T${scheduleTime}:00`).getTime() / 1000);
      await invoke("schedule_email", {
        contactId: contact!.id,
        contactName: `${contact!.name.firstName} ${contact!.name.lastName}`.trim(),
        contactEmail: email,
        contactCompany: contact!.company?.name ?? null,
        subject,
        body,
        scheduledAt: scheduled_at,
      });
      setScheduleSuccess(true);
      setTimeout(() => {
        setScheduling(false);
        setScheduleSuccess(false);
        setSubject("");
        setBody("");
      }, 1500);
    } catch (e) {
      setScheduleError(String(e));
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const handleGenerateFollowUp = async () => {
    if (!contact) return;
    setFuGenerating(true);
    setFuError(null);
    try {
      const contactName = `${contact.name.firstName} ${contact.name.lastName}`.trim();
      const daysAgo = contact.createdAt
        ? Math.floor((Date.now() - new Date(contact.createdAt).getTime()) / 86400000)
        : 0;
      const originalSubject = threads[0]?.subject || null;
      const result = await invoke<GeneratedEmail>("generate_follow_up_email", {
        contactName,
        contactEmail: contact.emails?.primaryEmail ?? "",
        jobTitle: contact.jobTitle ?? null,
        company: contact.company?.name ?? null,
        daysSinceContact: daysAgo,
        originalSubject,
      });
      setSubject(result.subject);
      setBody(result.body);
      setFuSamplesUsed(result.samples_used);
    } catch (e) {
      setFuError(String(e));
    } finally {
      setFuGenerating(false);
    }
  };

  const handleOpenFollowUp = () => {
    setActiveTab("threads");
    setReplyTo(null);
    setSubject("");
    setBody("");
    setComposing(true);
    setSendError(null);
    setAiError(null);
    setFuError(null);
    setFuSamplesUsed(null);
    // Auto-generate after opening compose
    setTimeout(() => handleGenerateFollowUp(), 50);
  };

  const handleStartEdit = () => {
    setEditEmail(email);
    setEditLinkedin(linkedinUrl || "");
    setEditJobUrl(jobUrl || "");
    setEditJobLabel(contact.jobPosting?.primaryLinkLabel || "");
    setEditError(null);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    setEditSaving(true);
    setEditError(null);
    try {
      await onUpdateContact(contact.id, {
        email: editEmail !== email ? editEmail : undefined,
        linkedinUrl: editLinkedin !== linkedinUrl ? editLinkedin : undefined,
        jobPostingUrl: editJobUrl !== jobUrl ? editJobUrl : undefined,
        jobPostingLabel: editJobLabel !== (contact.jobPosting?.primaryLinkLabel || "") ? editJobLabel : undefined,
      });
      setEditing(false);
    } catch (e) {
      setEditError(String(e));
    } finally {
      setEditSaving(false);
    }
  };

  const sentDaysAgo = contacted && contact.createdAt
    ? Math.floor((Date.now() - new Date(contact.createdAt).getTime()) / 86400000)
    : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Reply/follow-up banner */}
      {isReplied && (
        <div style={{ padding: "8px 16px", background: "color-mix(in srgb, var(--success) 12%, var(--surface))", borderBottom: "1px solid color-mix(in srgb, var(--success) 30%, transparent)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 14 }}>🎉</span>
          <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>This recruiter replied! Hit Reply to keep the conversation going.</span>
        </div>
      )}
      {contacted && !isReplied && !isFailed && sentDaysAgo !== null && sentDaysAgo >= 5 && (
        <div style={{ padding: "6px 16px", background: "color-mix(in srgb, var(--warning) 8%, var(--surface))", borderBottom: "1px solid color-mix(in srgb, var(--warning) 20%, transparent)", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--warning)" }}>No reply in {sentDaysAgo}d — consider a follow-up.</span>
        </div>
      )}
      {/* Contact info header */}
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>
                {contact.name.firstName} {contact.name.lastName}
              </h2>
              {contacted && !isFailed && !isReplied && (
                <span style={badgeStyle("var(--warning)")}>no reply</span>
              )}
              {isReplied && (
                <span style={badgeStyle("var(--success)")}>replied ↩</span>
              )}
              {isFailed && (
                <span style={badgeStyle("var(--text-muted)")}>failed</span>
              )}
            </div>
            {contact.jobTitle && (
              <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>
                {contact.jobTitle}
                {contact.company?.name && (
                  <span style={{ fontWeight: 500, color: "var(--text)" }}> · {contact.company.name}</span>
                )}
              </div>
            )}
            {!contact.jobTitle && contact.company?.name && (
              <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>{contact.company.name}</div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {email && gmailConnected && !composing && !scheduling && (
              <button
                onClick={handleNewEmail}
                style={{ background: "var(--primary)", color: "#fff", padding: "5px 14px", fontSize: 12, fontWeight: 600 }}
              >
                ✉ Email
              </button>
            )}
            {email && gmailConnected && aiConfigured && contacted && !isReplied && !isFailed && !composing && !scheduling && sentDaysAgo !== null && sentDaysAgo >= followUpDays && (
              <button
                onClick={handleOpenFollowUp}
                style={{ background: "var(--warning)", color: "#000", padding: "5px 14px", fontSize: 12, fontWeight: 600 }}
              >
                ↩ Follow-up
              </button>
            )}
            {!editing && (
              <button
                onClick={handleStartEdit}
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  padding: "5px 10px",
                  fontSize: 12,
                }}
              >
                ✎ Edit
              </button>
            )}
            {contacted && !isFailed && (
              <button
                onClick={() => onSetContactState(contact.id, "failed")}
                style={{
                  background: "transparent",
                  color: "var(--danger)",
                  border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)",
                  padding: "5px 10px",
                  fontSize: 12,
                }}
              >
                Mark Failed
              </button>
            )}
            {isFailed && (
              <button
                onClick={() => onSetContactState(contact.id, "")}
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  padding: "5px 10px",
                  fontSize: 12,
                }}
              >
                Undo Failed
              </button>
            )}
            <button
              onClick={() => {
                if (!confirm(`Remove ${contact.name.firstName} ${contact.name.lastName} from your hitlist?`)) return;
                if (!confirm("Are you sure? This permanently deletes them from Twenty CRM and cannot be undone.")) return;
                onDeleteContact(contact.id);
              }}
              style={{
                background: "transparent",
                color: "var(--danger)",
                border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                padding: "5px 10px",
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              🗑
            </button>
          </div>
        </div>

        {/* Edit mode */}
        {editing && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              background: "var(--surface2)",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Edit Contact Fields
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  style={{ width: "100%", padding: "5px 8px", fontSize: 12 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>LinkedIn URL</label>
                <input
                  type="url"
                  value={editLinkedin}
                  onChange={(e) => setEditLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                  style={{ width: "100%", padding: "5px 8px", fontSize: 12 }}
                />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Job Posting URL</label>
                  <input
                    type="url"
                    value={editJobUrl}
                    onChange={(e) => setEditJobUrl(e.target.value)}
                    placeholder="https://..."
                    style={{ width: "100%", padding: "5px 8px", fontSize: 12 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Label</label>
                  <input
                    type="text"
                    value={editJobLabel}
                    onChange={(e) => setEditJobLabel(e.target.value)}
                    placeholder="Job Title"
                    style={{ width: "100%", padding: "5px 8px", fontSize: 12 }}
                  />
                </div>
              </div>
            </div>
            {editError && (
              <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 8 }}>{editError}</div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                style={{ background: "var(--primary)", color: "#fff", padding: "5px 14px", fontSize: 12, fontWeight: 600 }}
              >
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)", padding: "5px 12px", fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Contact meta row (when not editing) */}
        {!editing && (
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", fontSize: 12, alignItems: "center" }}>
            {email && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(email);
                  setEmailCopied(true);
                  setTimeout(() => setEmailCopied(false), 1500);
                }}
                title="Copy email"
                style={{ background: "transparent", color: "var(--text-muted)", padding: 0, fontSize: 12 }}
              >
                {emailCopied ? "✓ copied" : `✉ ${email}`}
              </button>
            )}
            {contact.phones?.primaryPhoneNumber && (
              <span style={{ color: "var(--text-muted)" }}>☎ {contact.phones.primaryPhoneNumber}</span>
            )}
            {linkedinUrl && (
              <button
                onClick={() => openExternal(linkedinUrl)}
                style={{ background: "transparent", color: "var(--primary)", padding: 0, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
              >
                LinkedIn ↗
              </button>
            )}
            {jobUrl && (
              <button
                onClick={() => openExternal(jobUrl)}
                style={{ background: "transparent", color: "var(--primary)", padding: 0, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
              >
                {contact.jobPosting?.primaryLinkLabel || "Job Posting"} ↗
              </button>
            )}
          </div>
        )}

        {/* Notes */}
        <textarea
          value={contactNote}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder="Notes… (auto-saved)"
          rows={2}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "5px 8px",
            fontSize: 11,
            resize: "vertical",
            lineHeight: 1.5,
          }}
        />
      </div>

      {/* Tab bar */}
      {showTabs && (
        <div
          style={{
            display: "flex",
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const hasCtx =
              (tab.key === "job" && jobContext) || (tab.key === "linkedin" && linkedinContext);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "8px 16px",
                  fontSize: 12,
                  background: "transparent",
                  color: isActive ? "var(--primary)" : "var(--text-muted)",
                  borderRadius: 0,
                  borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {tab.label}
                {hasCtx && (
                  <span style={{ marginLeft: 4, color: "var(--success)", fontSize: 10 }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* THREADS TAB */}
        {activeTab === "threads" && (
          <>
            {!gmailConnected ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: "var(--text-muted)",
                }}
              >
                <div style={{ fontSize: 32, opacity: 0.3 }}>✉</div>
                <div style={{ fontSize: 13 }}>Gmail not connected</div>
                <button
                  onClick={onStartAuth}
                  style={{ background: "var(--primary)", color: "#fff", padding: "8px 20px", fontSize: 13, fontWeight: 600 }}
                >
                  Connect Gmail
                </button>
                <div style={{ fontSize: 11 }}>Configure Google OAuth in Settings first</div>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {/* Schedule panel */}
                {scheduling && (
                  <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px 6px" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>◈ Schedule Email to {email}</span>
                      <button onClick={() => setScheduling(false)} style={{ background: "transparent", color: "var(--text-muted)", padding: "0 4px", fontSize: 16, lineHeight: 1 }}>✕</button>
                    </div>
                    <div style={{ padding: "0 12px 12px" }}>
                      {aiConfigured && (
                        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          <input
                            type="text"
                            placeholder="AI notes (optional)…"
                            value={aiNotes}
                            onChange={(e) => setAiNotes(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !aiGenerating && handleGenerateEmail()}
                            style={{ flex: 1, padding: "5px 8px", fontSize: 12 }}
                          />
                          <button
                            onClick={handleGenerateEmail}
                            disabled={aiGenerating}
                            style={{ background: "var(--surface2)", color: "var(--accent)", padding: "5px 12px", fontSize: 12, border: "1px solid var(--border)", fontWeight: 600 }}
                          >
                            {aiGenerating ? "Generating…" : "✦ Generate"}
                          </button>
                        </div>
                      )}
                      <input
                        type="text"
                        placeholder="Subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", marginBottom: 6, fontSize: 13 }}
                      />
                      <textarea
                        placeholder="Write your message…"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        style={{ width: "100%", padding: "8px 9px", marginBottom: 8, minHeight: 100, resize: "vertical", lineHeight: 1.6, fontSize: 13 }}
                      />
                      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>DATE</div>
                          <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} style={{ padding: "5px 8px", fontSize: 12 }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>TIME</div>
                          <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} style={{ padding: "5px 8px", fontSize: 12 }} />
                        </div>
                      </div>
                      {scheduleError && <div style={{ color: "var(--danger)", fontSize: 11, marginBottom: 6 }}>{scheduleError}</div>}
                      {scheduleSuccess && <div style={{ color: "var(--success)", fontSize: 11, marginBottom: 6 }}>✓ Scheduled! Sending to n8n…</div>}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={handleSchedule}
                          disabled={scheduleSubmitting || !subject.trim() || !body.trim() || !scheduleDate}
                          style={{ background: "var(--accent)", color: "#fff", padding: "7px 18px", fontWeight: 600, fontSize: 13 }}
                        >
                          {scheduleSubmitting ? "Scheduling…" : "◈ Schedule"}
                        </button>
                        <button onClick={() => setScheduling(false)} style={{ background: "var(--surface2)", color: "var(--text)", padding: "7px 14px", fontSize: 12 }}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Thread list — shrinks when composing */}
                <div
                  style={{
                    flex: composing ? "0 0 auto" : 1,
                    maxHeight: composing ? "35%" : undefined,
                    overflowY: "auto",
                    padding: "10px 0",
                  }}
                >
                  <div
                    style={{
                      padding: "0 16px 8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      {threadsLoading ? "Loading threads…" : "Email Threads"}
                    </span>
                  </div>

                  {!threadsLoading && threads.length === 0 && (
                    <div style={{ padding: "0 16px", color: "var(--text-muted)", fontSize: 12 }}>
                      No email threads found
                    </div>
                  )}

                  {threads.map((thread) => {
                    const isExpanded = expandedThread === thread.id;
                    return (
                      <div
                        key={thread.id}
                        style={{
                          margin: "0 12px 6px",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          onClick={() => setExpandedThread(isExpanded ? null : thread.id)}
                          style={{
                            padding: "9px 12px",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>
                              {thread.subject || "(no subject)"}
                            </div>
                            <div
                              style={{
                                color: "var(--text-muted)",
                                fontSize: 11,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cleanText(thread.snippet)}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              flexShrink: 0,
                              marginLeft: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                background: "var(--surface2)",
                                padding: "1px 6px",
                                borderRadius: 10,
                                color: "var(--text-muted)",
                              }}
                            >
                              {thread.messages.length}
                            </span>
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ borderTop: "1px solid var(--border)" }}>
                            {thread.messages.map((msg) => {
                              const msgBody = msg.body ? cleanText(msg.body) : cleanText(msg.snippet);
                              const isLong = msgBody.length > 400;
                              const isMsgExpanded = expandedMessages.has(msg.id);
                              const displayBody =
                                isLong && !isMsgExpanded ? msgBody.slice(0, 400) : msgBody;
                              return (
                                <div
                                  key={msg.id}
                                  style={{
                                    padding: "10px 12px",
                                    borderBottom: "1px solid var(--border)",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      marginBottom: 6,
                                      gap: 8,
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: "var(--text-muted)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {msg.from}
                                    </span>
                                    <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                                      {formatDate(msg.date)}
                                    </span>
                                  </div>
                                  {msg.isHtml ? (
                                    <iframe
                                      srcDoc={msg.body || msg.snippet}
                                      sandbox="allow-same-origin"
                                      style={{
                                        width: "100%",
                                        border: "none",
                                        height: 280,
                                        borderRadius: 4,
                                        background: "#fff",
                                      }}
                                      title="email-body"
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        fontSize: 12,
                                        lineHeight: 1.6,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                      }}
                                    >
                                      {displayBody}
                                      {isLong && !isMsgExpanded && (
                                        <>
                                          {"… "}
                                          <button
                                            onClick={() =>
                                              setExpandedMessages((prev) => new Set([...prev, msg.id]))
                                            }
                                            style={{
                                              background: "transparent",
                                              color: "var(--primary)",
                                              padding: 0,
                                              fontSize: 11,
                                              textDecoration: "underline",
                                            }}
                                          >
                                            Show more
                                          </button>
                                        </>
                                      )}
                                      {isLong && isMsgExpanded && (
                                        <>
                                          {" "}
                                          <button
                                            onClick={() =>
                                              setExpandedMessages((prev) => {
                                                const s = new Set(prev);
                                                s.delete(msg.id);
                                                return s;
                                              })
                                            }
                                            style={{
                                              background: "transparent",
                                              color: "var(--text-muted)",
                                              padding: 0,
                                              fontSize: 11,
                                              textDecoration: "underline",
                                            }}
                                          >
                                            Show less
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div style={{ padding: "8px 12px" }}>
                              <button
                                onClick={() => handleReply(thread)}
                                style={{
                                  background: "var(--surface2)",
                                  color: "var(--text)",
                                  padding: "4px 12px",
                                  fontSize: 12,
                                }}
                              >
                                ↩ Reply
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Compose panel — expands to fill when composing */}
                {composing && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      background: "var(--surface)",
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      minHeight: 0,
                      overflow: "hidden",
                    }}
                  >
                    {/* Compose header */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 12px 6px",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        {replyTo ? `Re: ${replyTo.subject}` : `To: ${email}`}
                        {draftRestored && (
                          <span style={{ fontSize: 10, color: "var(--warning)", fontWeight: 400 }}>draft restored</span>
                        )}
                      </span>
                      <button
                        onClick={() => setComposing(false)}
                        style={{ background: "transparent", color: "var(--text-muted)", padding: "0 4px", fontSize: 16, lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Scrollable compose body */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
                      {/* AI row */}
                      {aiConfigured && (
                        <>
                          {/* Tone + Length pills */}
                          <div style={{ display: "flex", gap: 4, marginBottom: 5, flexWrap: "wrap" }}>
                            {(["professional", "conversational", "enthusiastic"] as const).map((t) => (
                              <button key={t} onClick={() => setAiTone(t)} style={{ padding: "2px 8px", fontSize: 10, borderRadius: 10, border: "1px solid var(--border)", background: aiTone === t ? "var(--primary)" : "var(--surface2)", color: aiTone === t ? "#fff" : "var(--text-muted)", fontWeight: aiTone === t ? 600 : 400, cursor: "pointer" }}>{t}</button>
                            ))}
                            <span style={{ color: "var(--border)", alignSelf: "center" }}>|</span>
                            {(["short", "medium", "long"] as const).map((l) => (
                              <button key={l} onClick={() => setAiLength(l)} style={{ padding: "2px 8px", fontSize: 10, borderRadius: 10, border: "1px solid var(--border)", background: aiLength === l ? "var(--accent)" : "var(--surface2)", color: aiLength === l ? "#fff" : "var(--text-muted)", fontWeight: aiLength === l ? 600 : 400, cursor: "pointer" }}>{l}</button>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                            <input
                              type="text"
                              placeholder="AI notes (optional)…"
                              value={aiNotes}
                              onChange={(e) => setAiNotes(e.target.value)}
                              onKeyDown={(e) =>
                                e.key === "Enter" && !aiGenerating && handleGenerateEmail()
                              }
                              style={{ flex: 1, padding: "5px 8px", fontSize: 12 }}
                            />
                            <button
                              onClick={handleGenerateEmail}
                              disabled={aiGenerating}
                              style={{
                                background: "var(--surface2)",
                                color: "var(--accent)",
                                padding: "5px 12px",
                                fontSize: 12,
                                border: "1px solid var(--border)",
                                flexShrink: 0,
                                fontWeight: 600,
                              }}
                            >
                              {aiGenerating ? "Generating…" : "✦ Generate"}
                            </button>
                            <button
                              onClick={handleShowDebug}
                              title="View full AI prompt (debug)"
                              style={{
                                background: aiDebugVisible ? "var(--accent)" : "transparent",
                                color: aiDebugVisible ? "#fff" : "var(--text-muted)",
                                padding: "5px 8px",
                                fontSize: 10,
                                border: "1px solid var(--border)",
                                flexShrink: 0,
                              }}
                            >
                              {aiDebugLoading ? "…" : "prompt"}
                            </button>
                          </div>

                          {/* AI Debug modal rendered at root */}
                          {aiDebugVisible && aiDebugData && (
                            <AiDebugModal data={aiDebugData} onClose={() => setAiDebugVisible(false)} />
                          )}
                          <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 11, flexWrap: "wrap" }}>
                            {jobContext && (
                              <span style={{ color: "var(--success)" }}>📋 Job posting ✓</span>
                            )}
                            {linkedinContext && (
                              <span style={{ color: "var(--success)" }}>🔗 LinkedIn ✓</span>
                            )}
                            {samplesUsed !== null ? (
                              <span style={{ color: samplesUsed > 0 ? "var(--accent)" : "var(--text-muted)" }}>
                                {samplesUsed > 0
                                  ? `✦ ${samplesUsed} writing sample${samplesUsed === 1 ? "" : "s"} used`
                                  : "✦ No writing samples yet"}
                              </span>
                            ) : (
                              <span style={{ color: sampleCount > 0 ? "var(--accent)" : "var(--text-muted)" }}>
                                {sampleCount > 0
                                  ? `✦ ${sampleCount} sample${sampleCount === 1 ? "" : "s"} on file`
                                  : "✦ No samples — send emails to build your style library"}
                              </span>
                            )}
                          </div>
                        </>
                      )}

                      {aiError && (
                        <div style={{ color: "var(--danger)", fontSize: 11, marginBottom: 6 }}>
                          {aiError}
                        </div>
                      )}

                      {fuGenerating && (
                        <div style={{ fontSize: 11, color: "var(--warning)", marginBottom: 6 }}>Generating follow-up…</div>
                      )}
                      {fuError && (
                        <div style={{ color: "var(--danger)", fontSize: 11, marginBottom: 6 }}>{fuError}</div>
                      )}
                      {fuSamplesUsed !== null && !fuGenerating && (
                        <div style={{ fontSize: 11, color: "var(--warning)", marginBottom: 6 }}>
                          ↩ Follow-up generated {fuSamplesUsed > 0 ? `(${fuSamplesUsed} sample${fuSamplesUsed === 1 ? "" : "s"})` : ""}
                          <button
                            onClick={handleGenerateFollowUp}
                            disabled={fuGenerating}
                            style={{ marginLeft: 8, background: "transparent", color: "var(--accent)", fontSize: 10, padding: "1px 6px", border: "1px solid var(--border)", borderRadius: 4 }}
                          >
                            ↺ retry
                          </button>
                        </div>
                      )}

                      <div style={{ position: "relative", marginBottom: 6 }}>
                        <input
                          type="text"
                          placeholder="Subject"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          style={{ width: "100%", padding: "6px 8px", paddingRight: 56, fontSize: 13 }}
                        />
                        {subject && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(subject);
                              setSubjectCopied(true);
                              setTimeout(() => setSubjectCopied(false), 1500);
                            }}
                            title="Copy subject"
                            style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: "transparent", color: "var(--text-muted)", fontSize: 10, padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 4 }}
                          >
                            {subjectCopied ? "✓" : "copy"}
                          </button>
                        )}
                      </div>

                      {/* Auto-resizing textarea */}
                      <div style={{ position: "relative", marginBottom: 8 }}>
                        <textarea
                          ref={bodyRef}
                          placeholder="Write your message…"
                          value={body}
                          onChange={(e) => {
                            setBody(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = Math.max(160, e.target.scrollHeight) + "px";
                          }}
                          style={{
                            width: "100%",
                            padding: "8px 9px",
                            paddingBottom: 28,
                            minHeight: 160,
                            resize: "none",
                            overflow: "hidden",
                            lineHeight: 1.6,
                            fontSize: 13,
                          }}
                        />
                        <span style={{ position: "absolute", bottom: 8, left: 8, fontSize: 9, color: "var(--text-muted)", pointerEvents: "none", opacity: 0.7 }}>
                          {body.trim() ? body.trim().split(/\s+/).length : 0}w
                        </span>
                        {body && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(body);
                              setBodyCopied(true);
                              setTimeout(() => setBodyCopied(false), 1500);
                            }}
                            title="Copy body"
                            style={{ position: "absolute", bottom: 6, right: 6, background: "var(--surface2)", color: "var(--text-muted)", fontSize: 10, padding: "2px 8px", border: "1px solid var(--border)", borderRadius: 4 }}
                          >
                            {bodyCopied ? "✓ copied" : "copy"}
                          </button>
                        )}
                      </div>

                      {sendError && (
                        <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>
                          {sendError}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          onClick={handleSend}
                          disabled={sending || !subject.trim() || !body.trim()}
                          style={{ background: "var(--primary)", color: "#fff", padding: "7px 18px", fontWeight: 600, fontSize: 13 }}
                        >
                          {sending ? "Sending…" : "Send"}
                        </button>
                        {aiConfigured && samplesUsed !== null && (
                          <button
                            onClick={handleGenerateEmail}
                            disabled={aiGenerating}
                            title="Generate a different version"
                            style={{ background: "var(--surface2)", color: "var(--accent)", padding: "7px 12px", fontSize: 12, border: "1px solid var(--border)" }}
                          >
                            {aiGenerating ? "…" : "↺ try another"}
                          </button>
                        )}
                        {subject.trim() && body.trim() && (
                          <button
                            onClick={() => {
                              setComposing(false);
                              setScheduling(true);
                              const tomorrow = new Date();
                              tomorrow.setDate(tomorrow.getDate() + 1);
                              setScheduleDate(tomorrow.toLocaleDateString("en-CA"));
                              setScheduleTime("09:00");
                            }}
                            title="Schedule this email for later"
                            style={{ background: "var(--surface2)", color: "var(--text-muted)", padding: "7px 12px", fontSize: 11, border: "1px solid var(--border)" }}
                          >
                            ◈ schedule
                          </button>
                        )}
                        <button
                          onClick={() => setComposing(false)}
                          style={{ background: "var(--surface2)", color: "var(--text)", padding: "7px 14px", fontSize: 12 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* JOB POSTING TAB */}
        {activeTab === "job" && jobUrl && (
          <WebviewTab
            url={jobUrl}
            context={jobContext}
            onContextChange={handleJobContextChange}
            label={contact.jobPosting?.primaryLinkLabel || "Job Posting"}
          />
        )}

        {/* LINKEDIN TAB */}
        {activeTab === "linkedin" && linkedinUrl && (
          <WebviewTab
            url={linkedinUrl}
            context={linkedinContext}
            onContextChange={handleLinkedinContextChange}
            label="LinkedIn Profile"
          />
        )}
      </div>
    </div>
  );
}

// ── Badge helper ─────────────────────────────────────────────────────────────
function badgeStyle(color: string): React.CSSProperties {
  return {
    fontSize: 10,
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color,
    padding: "2px 8px",
    borderRadius: 10,
    fontWeight: 600,
    border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
  };
}

// ── WebviewTab ────────────────────────────────────────────────────────────────
function WebviewTab({
  url,
  context,
  onContextChange,
  label,
}: {
  url: string;
  context: string;
  onContextChange: (t: string) => void;
  label: string;
}) {
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const handleScrape = async () => {
    setScraping(true);
    setScrapeError(null);
    try {
      const text = await invoke<string>("scrape_url", { url });
      onContextChange(text);
    } catch (e) {
      setScrapeError(String(e));
    } finally {
      setScraping(false);
    }
  };

  const handleOpenViewer = async () => {
    setOpening(true);
    try {
      await invoke("open_viewer_window", { url, title: label });
    } catch (e) {
      console.error("Failed to open viewer:", e);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 16px 12px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Opens in a full popup window — works with all sites including LinkedIn.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleOpenViewer}
            disabled={opening}
            style={{ background: "var(--primary)", color: "#fff", padding: "7px 16px", fontSize: 12, fontWeight: 600 }}
          >
            {opening ? "Opening…" : `Open ${label} ↗`}
          </button>
          <button
            onClick={handleScrape}
            disabled={scraping}
            style={{
              background: "var(--surface2)",
              color: "var(--text)",
              padding: "7px 14px",
              fontSize: 12,
              border: "1px solid var(--border)",
            }}
          >
            {scraping ? "Scraping…" : "Scrape text"}
          </button>
        </div>
        {scrapeError && (
          <div style={{ fontSize: 11, color: "var(--danger)" }}>{scrapeError}</div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: 12,
          background: "var(--surface)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: context ? "var(--success)" : "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {context ? "AI Context Loaded ✓" : "Paste or scrape content below"}
          </span>
          {context && (
            <button
              onClick={() => onContextChange("")}
              style={{ background: "transparent", color: "var(--text-muted)", fontSize: 11, padding: "0 4px" }}
            >
              Clear
            </button>
          )}
        </div>
        <textarea
          value={context}
          onChange={(e) => onContextChange(e.target.value)}
          placeholder="Open the popup, copy the page content, and paste it here. Or use Scrape text to auto-extract."
          style={{
            flex: 1,
            resize: "none",
            fontSize: 12,
            padding: "7px 9px",
            lineHeight: 1.5,
          }}
        />
      </div>
    </div>
  );
}
