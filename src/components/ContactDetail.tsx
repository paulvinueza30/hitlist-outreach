import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Person, EmailThread, GeneratedEmail, GenerateEmailParams, ContactContext } from "../types";

interface Props {
  contact: Person | null;
  threads: EmailThread[];
  threadsLoading: boolean;
  gmailConnected: boolean;
  aiConfigured: boolean;
  contactState: string;
  contactReminder: number | null;
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
  onSetContactReminder: (contactId: string, ts: number | null) => Promise<void>;
}

type Tab = "threads" | "job" | "linkedin";

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
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
  contactReminder,
  onSendEmail,
  onEmailSent,
  onStartAuth,
  onGenerateEmail,
  onSetContactState,
  onSetContactReminder,
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
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  // Per-tab AI context (text used for generation)
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

  // Debounce timers
  const contextSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted context + note when contact changes
  useEffect(() => {
    // Reset
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
    setShowReminderPicker(false);
    // Load writing sample count
    invoke<number>("get_writing_sample_count")
      .then((n) => setSampleCount(n))
      .catch(() => {});
    setEmailCopied(false);
    if (contextSaveTimer.current) clearTimeout(contextSaveTimer.current);
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);

    if (!contact?.id) return;
    const id = contact.id;

    // Load context
    invoke<ContactContext>("get_contact_context", { contactId: id })
      .then((ctx) => {
        if (ctx) {
          setJobContext(ctx.job || "");
          setLinkedinContext(ctx.linkedin || "");
        }
      })
      .catch(() => {});

    // Load note
    invoke<string>("get_contact_note", { contactId: id })
      .then((note) => setContactNote(note || ""))
      .catch(() => {});
  }, [contact?.id]);

  // Debounced save context
  const handleJobContextChange = useCallback(
    (text: string) => {
      setJobContext(text);
      if (!contact?.id) return;
      const id = contact.id;
      if (contextSaveTimer.current) clearTimeout(contextSaveTimer.current);
      contextSaveTimer.current = setTimeout(() => {
        invoke("save_contact_context", { contactId: id, job: text, linkedin: linkedinContext }).catch(
          () => {}
        );
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
        invoke("save_contact_context", { contactId: id, job: jobContext, linkedin: text }).catch(
          () => {}
        );
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
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Select a contact to view details
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
    try {
      const result = await onGenerateEmail({
        contactName: `${contact.name.firstName} ${contact.name.lastName}`,
        contactEmail: email,
        jobTitle: contact.jobTitle ?? null,
        company: contact.company?.name ?? null,
        jobPostingText: jobContext.trim() || null,
        linkedinText: linkedinContext.trim() || null,
        userNote: aiNotes.trim() || null,
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

  const hasContext = !!(jobContext.trim() || linkedinContext.trim());

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Contact info header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>
                {contact.name.firstName} {contact.name.lastName}
              </h2>
              {/* State badges */}
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
              <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 1 }}>
                {contact.jobTitle}
              </div>
            )}
            {contact.company?.name && (
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{contact.company.name}</div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {email && gmailConnected && (
              <button
                onClick={handleNewEmail}
                style={{ background: "var(--primary)", color: "#fff", padding: "4px 10px", fontSize: 12 }}
              >
                + Email
              </button>
            )}
            {contacted && !isFailed && (
              <button
                onClick={() => onSetContactState(contact.id, "failed")}
                style={{
                  background: "transparent",
                  color: "var(--danger)",
                  border: "1px solid var(--danger)",
                  padding: "4px 10px",
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
                  padding: "4px 10px",
                  fontSize: 12,
                }}
              >
                Undo Failed
              </button>
            )}
          </div>
        </div>

        {/* Contact meta row */}
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
              {emailCopied ? "✓ copied" : `📧 ${email}`}
            </button>
          )}
          {contact.phones?.primaryPhoneNumber && (
            <span style={{ color: "var(--text-muted)" }}>📞 {contact.phones.primaryPhoneNumber}</span>
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

          {/* Reminder */}
          {(() => {
            const hasReminder = contactReminder !== null;
            const isOverdue = hasReminder && contactReminder! < Date.now() / 1000;
            const reminderLabel = hasReminder
              ? new Date(contactReminder! * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : null;
            return (
              <>
                <button
                  onClick={() => setShowReminderPicker((v) => !v)}
                  title="Set follow-up reminder"
                  style={{
                    background: "transparent",
                    color: hasReminder
                      ? isOverdue ? "var(--danger)" : "var(--warning)"
                      : "var(--text-muted)",
                    padding: 0,
                    fontSize: 12,
                  }}
                >
                  {hasReminder ? `⏰ ${reminderLabel}` : "⏰ Remind"}
                </button>
                {showReminderPicker && (
                  <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      type="date"
                      defaultValue={
                        hasReminder
                          ? new Date(contactReminder! * 1000).toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) => {
                        if (e.target.value) {
                          const ts = Math.floor(new Date(e.target.value + "T09:00:00").getTime() / 1000);
                          onSetContactReminder(contact.id, ts);
                        }
                      }}
                      style={{ fontSize: 11, padding: "2px 4px" }}
                    />
                    {hasReminder && (
                      <button
                        onClick={() => {
                          onSetContactReminder(contact.id, null);
                          setShowReminderPicker(false);
                        }}
                        style={{ background: "transparent", color: "var(--danger)", padding: "0 4px", fontSize: 11 }}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                )}
              </>
            );
          })()}
        </div>

        {/* Notes */}
        <textarea
          value={contactNote}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder="Notes… (auto-saved)"
          rows={2}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "4px 7px",
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
                  padding: "8px 14px",
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
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
                  gap: 10,
                  color: "var(--text-muted)",
                }}
              >
                <div>Gmail not connected</div>
                <button
                  onClick={onStartAuth}
                  style={{ background: "var(--primary)", color: "#fff", padding: "7px 18px", fontSize: 13 }}
                >
                  Connect Gmail
                </button>
                <div style={{ fontSize: 11 }}>Configure Google OAuth in Settings first</div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
                  <div
                    style={{
                      padding: "0 16px 8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                      EMAIL THREADS{threadsLoading && " (loading…)"}
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
                          margin: "0 10px 6px",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius)",
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
                            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 1 }}>
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
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                              {thread.messages.length}msg
                            </span>
                            <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
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
                                    padding: "9px 12px",
                                    borderBottom: "1px solid var(--border)",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      marginBottom: 5,
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
                            <div style={{ padding: "6px 12px" }}>
                              <button
                                onClick={() => handleReply(thread)}
                                style={{
                                  background: "var(--surface2)",
                                  color: "var(--text)",
                                  padding: "3px 10px",
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

                {/* Compose panel */}
                {composing && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      padding: 12,
                      background: "var(--surface)",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 8,
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 500 }}>
                        {replyTo ? "Reply" : `To: ${email}`}
                      </span>
                      <button
                        onClick={() => setComposing(false)}
                        style={{ background: "transparent", color: "var(--text-muted)", padding: 0, fontSize: 15 }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* AI row */}
                    {aiConfigured && (
                      <>
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
                              padding: "5px 10px",
                              fontSize: 12,
                              border: "1px solid var(--border)",
                              flexShrink: 0,
                              fontWeight: 500,
                            }}
                          >
                            {aiGenerating ? "Generating…" : "✦ Generate"}
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 11, flexWrap: "wrap" }}>
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
                                : "✦ No writing samples — add some in Settings"}
                            </span>
                          ) : (
                            <span style={{ color: sampleCount > 0 ? "var(--accent)" : "var(--text-muted)" }}>
                              {sampleCount > 0
                                ? `✦ ${sampleCount} writing sample${sampleCount === 1 ? "" : "s"} on file`
                                : "✦ No writing samples — send emails or add manually"}
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

                    <input
                      type="text"
                      placeholder="Subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", marginBottom: 6 }}
                    />
                    <textarea
                      placeholder="Write your message…"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 8px",
                        marginBottom: 8,
                        height: 108,
                        resize: "vertical",
                      }}
                    />

                    {sendError && (
                      <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>
                        {sendError}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={handleSend}
                        disabled={sending || !subject.trim() || !body.trim()}
                        style={{ background: "var(--primary)", color: "#fff", padding: "6px 16px", fontWeight: 500 }}
                      >
                        {sending ? "Sending…" : "Send"}
                      </button>
                      <button
                        onClick={() => setComposing(false)}
                        style={{ background: "var(--surface2)", color: "var(--text)", padding: "6px 12px" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
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
    background: `color-mix(in srgb, ${color} 18%, transparent)`,
    color,
    padding: "1px 7px",
    borderRadius: 10,
    fontWeight: 500,
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
      {/* Viewer launch area */}
      <div
        style={{
          padding: "20px 16px 16px",
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
            style={{ background: "var(--primary)", color: "#fff", padding: "7px 16px", fontSize: 12, fontWeight: 500 }}
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

      {/* AI context area */}
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
              fontWeight: 500,
              color: context ? "var(--success)" : "var(--text-muted)",
            }}
          >
            {context ? "AI CONTEXT LOADED ✓ (auto-saved)" : "AI CONTEXT — paste or scrape content below"}
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
            padding: "6px 8px",
            lineHeight: 1.5,
          }}
        />
      </div>
    </div>
  );
}
