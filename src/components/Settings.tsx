import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig, AiConfig, ParsedResume } from "../types";

const PROVIDER_MODELS: Record<string, string[]> = {
  claude: [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-haiku-4-5",
  ],
  opencode: ["glm-5-flash", "minimax-m2-5", "minimax-m2-7"],
  openrouter: [
    "anthropic/claude-haiku-4-5",
    "anthropic/claude-sonnet-4-5",
    "google/gemini-flash-1.5",
    "openai/gpt-4o-mini",
    "meta-llama/llama-3.3-70b-instruct",
  ],
  nvidia: [
    "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "meta/llama-3.1-405b-instruct",
    "microsoft/phi-4",
  ],
  gemini: [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-2.0-flash-thinking-exp",
    "gemini-1.5-pro",
  ],
};

const PROVIDER_KEY_HINT: Record<string, string> = {
  claude: "console.anthropic.com → API Keys",
  opencode: "opencode.ai → your account",
  openrouter: "openrouter.ai/keys",
  nvidia: "build.nvidia.com",
  gemini: "aistudio.google.com/apikey",
};

const PROVIDER_NOTE: Record<string, string> = {
  opencode:
    "OpenCode Go: GLM models use OpenAI-compat; MiniMax (M2) uses Anthropic-compat — auto-detected.",
};

interface Props {
  config: AppConfig | null;
  aiConfig: AiConfig | null;
  onSaved: () => void;
  onStartAuth: () => Promise<void>;
  authPending: boolean;
}

export default function Settings({ config, aiConfig, onSaved, onStartAuth, authPending }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [snovClientId, setSnovClientId] = useState("");
  const [snovClientSecret, setSnovClientSecret] = useState("");
  const [hunterApiKey, setHunterApiKey] = useState("");
  const [apolloApiKey, setApolloApiKey] = useState("");
  const [prospeoApiKey, setProspeoApiKey] = useState("");
  const [quotas, setQuotas] = useState<Record<string, { left: number; used: number; label: string } | null>>({});
  const [checkingQuota, setCheckingQuota] = useState<Record<string, boolean>>({});

  const [aiProvider, setAiProvider] = useState("claude");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("claude-haiku-4-5-20251001");
  const [aiSystemPrompt, setAiSystemPrompt] = useState("");

  const [n8nWebhookUrl, setN8nWebhookUrl] = useState("");
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [aiSamplesCount, setAiSamplesCount] = useState(10);

  // Follow-up settings
  const [followUpDays, setFollowUpDays] = useState(7);
  const [followUpSystemPrompt, setFollowUpSystemPrompt] = useState("");
  const [followUpSamples, setFollowUpSamples] = useState<string[]>([]);
  const [followUpSamplesLoaded, setFollowUpSamplesLoaded] = useState(false);
  const [newFollowUpSample, setNewFollowUpSample] = useState("");
  const [addingFollowUpSample, setAddingFollowUpSample] = useState(false);
  const [followUpSampleModal, setFollowUpSampleModal] = useState<number | null>(null);
  const [followUpCarouselPage, setFollowUpCarouselPage] = useState(0);
  const [refiningOutreach, setRefiningOutreach] = useState(false);
  const [refineOutreachRequest, setRefineOutreachRequest] = useState("");
  const [refiningFollowUp, setRefiningFollowUp] = useState(false);
  const [refineFollowUpRequest, setRefineFollowUpRequest] = useState("");

  // Resume state
  const [resumeText, setResumeText] = useState("");
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [resumeSaved, setResumeSaved] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Writing samples state
  const [writingSamples, setWritingSamples] = useState<string[]>([]);
  const [sampleModalIndex, setSampleModalIndex] = useState<number | null>(null);
  const [samplesLoaded, setSamplesLoaded] = useState(false);
  const [newSampleText, setNewSampleText] = useState("");
  const [addingSample, setAddingSample] = useState(false);
  const [carouselPage, setCarouselPage] = useState(0);
  const CARDS_PER_PAGE = 3;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (config) {
      setApiKey(config.twenty_api_key);
      setClientId(config.google_client_id);
      setClientSecret(config.google_client_secret);
      setSnovClientId(config.snov_client_id || "");
      setSnovClientSecret(config.snov_client_secret || "");
      setHunterApiKey(config.hunter_api_key || "");
      setApolloApiKey(config.apollo_api_key || "");
      setProspeoApiKey(config.prospeo_api_key || "");
      setN8nWebhookUrl(config.n8n_webhook_url || "");
      setAiSamplesCount(config.ai_samples_count ?? 10);
      setFollowUpDays(config.follow_up_days ?? 7);
      setFollowUpSystemPrompt(config.follow_up_system_prompt || "");
    }
  }, [config]);

  useEffect(() => {
    if (aiConfig) {
      setAiProvider(aiConfig.provider || "claude");
      setAiApiKey(aiConfig.api_key || "");
      setAiModel(aiConfig.model || PROVIDER_MODELS["claude"][0]);
      setAiSystemPrompt(aiConfig.system_prompt || "");
    }
  }, [aiConfig]);

  // Load resume text on mount
  useEffect(() => {
    invoke<string>("get_resume_text")
      .then((text) => setResumeText(text || ""))
      .catch(() => {});
    loadWritingSamples();
    loadFollowUpSamples();
  }, []);

  const loadWritingSamples = async () => {
    try {
      const samples = await invoke<string[]>("get_writing_samples");
      setWritingSamples(samples || []);
      setSamplesLoaded(true);
    } catch {
      setSamplesLoaded(true);
    }
  };

  const loadFollowUpSamples = async () => {
    try {
      const samples = await invoke<string[]>("get_follow_up_samples");
      setFollowUpSamples(samples || []);
      setFollowUpSamplesLoaded(true);
    } catch {
      setFollowUpSamplesLoaded(true);
    }
  };

  const checkQuota = async (api: string) => {
    setCheckingQuota(prev => ({ ...prev, [api]: true }));
    try {
      const q = await invoke<{ left: number; used: number; label: string }>("get_contact_api_quota", { api });
      setQuotas(prev => ({ ...prev, [api]: q }));
    } catch (e) {
      setQuotas(prev => ({ ...prev, [api]: null }));
      alert(`Quota check failed: ${String(e)}`);
    } finally {
      setCheckingQuota(prev => ({ ...prev, [api]: false }));
    }
  };

  const handleProviderChange = (p: string) => {
    setAiProvider(p);
    const models = PROVIDER_MODELS[p] ?? [];
    if (!models.includes(aiModel)) setAiModel(models[0] ?? "");
    setTestResult(null);
  };

  const handlePdfUpload = async (file: File) => {
    setPdfLoading(true);
    setPdfError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(arrayBuffer));
      const text = await invoke<string>("extract_pdf_text", { data });
      setResumeText(text.trim());
      setResumeSaved(false);
      setParsedResume(null);
    } catch (e) {
      setPdfError("PDF extraction failed: " + String(e));
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await invoke("save_config", { apiKey, clientId, clientSecret, snovClientId, snovClientSecret, hunterApiKey, apolloApiKey, prospeoApiKey, n8nWebhookUrl, aiSamplesCount, followUpDays, followUpSystemPrompt });
      await invoke("save_ai_config", {
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        systemPrompt: aiSystemPrompt,
      });
      if (resumeText.trim()) {
        await invoke("save_resume_text", { text: resumeText });
      }
      setSuccess(true);
      setTimeout(() => onSaved(), 600);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await invoke("disconnect_gmail");
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTestAi = async () => {
    try {
      await invoke("save_ai_config", {
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        systemPrompt: aiSystemPrompt,
      });
    } catch { /* ignore */ }
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await invoke<string>("test_ai_config");
      setTestResult({ ok: true, msg });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleTestWebhook = async () => {
    setWebhookTesting(true);
    setWebhookTestResult(null);
    // Save webhook URL first so the command picks it up
    try {
      await invoke("save_config", { apiKey, clientId, clientSecret, snovClientId, snovClientSecret, hunterApiKey, apolloApiKey, prospeoApiKey, n8nWebhookUrl, aiSamplesCount, followUpDays, followUpSystemPrompt });
    } catch { /* ignore save errors */ }
    try {
      const msg = await invoke<string>("test_n8n_webhook");
      setWebhookTestResult({ ok: true, msg });
    } catch (e) {
      setWebhookTestResult({ ok: false, msg: String(e) });
    } finally {
      setWebhookTesting(false);
    }
  };

  const handleParseResume = async () => {
    if (!resumeText.trim()) return;
    setParsing(true);
    setParseError(null);
    setParsedResume(null);
    try {
      const raw = await invoke<string>("parse_resume", { text: resumeText });
      const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed: ParsedResume = JSON.parse(jsonStr);
      setParsedResume(parsed);
      // Auto-save resume text
      await invoke("save_resume_text", { text: resumeText });
      setResumeSaved(true);
    } catch (e) {
      setParseError("Parse failed: " + String(e));
    } finally {
      setParsing(false);
    }
  };

  const handleAddManualSample = async () => {
    const text = newSampleText.trim();
    if (!text || text.length < 30) return;
    setAddingSample(true);
    try {
      await invoke("add_writing_sample", { text });
      setNewSampleText("");
      await loadWritingSamples();
    } catch (e) {
      console.error("Failed to add sample:", e);
    } finally {
      setAddingSample(false);
    }
  };

  const handleDeleteSample = async (index: number) => {
    try {
      await invoke("delete_writing_sample", { index });
      setWritingSamples((prev) => prev.filter((_, i) => i !== index));
      if (sampleModalIndex === index) setSampleModalIndex(null);
    } catch (e) {
      console.error("Failed to delete sample:", e);
    }
  };

  const handleAddFollowUpSample = async () => {
    const text = newFollowUpSample.trim();
    if (!text || text.length < 20) return;
    setAddingFollowUpSample(true);
    try {
      await invoke("add_follow_up_sample", { text });
      setNewFollowUpSample("");
      await loadFollowUpSamples();
    } catch (e) {
      console.error("Failed to add follow-up sample:", e);
    } finally {
      setAddingFollowUpSample(false);
    }
  };

  const handleDeleteFollowUpSample = async (index: number) => {
    try {
      await invoke("delete_follow_up_sample", { index });
      setFollowUpSamples((prev) => prev.filter((_, i) => i !== index));
      if (followUpSampleModal === index) setFollowUpSampleModal(null);
    } catch (e) {
      console.error("Failed to delete follow-up sample:", e);
    }
  };

  const handleRefinePrompt = async (type: "outreach" | "follow_up") => {
    const request = type === "outreach" ? refineOutreachRequest : refineFollowUpRequest;
    const currentPrompt = type === "outreach" ? aiSystemPrompt : followUpSystemPrompt;
    if (!request.trim() || !currentPrompt.trim()) return;
    if (type === "outreach") setRefiningOutreach(true);
    else setRefiningFollowUp(true);
    try {
      const refined = await invoke<string>("refine_system_prompt", {
        currentPrompt,
        refinementRequest: request,
        promptType: type,
      });
      if (type === "outreach") {
        setAiSystemPrompt(refined.trim());
        setRefineOutreachRequest("");
      } else {
        setFollowUpSystemPrompt(refined.trim());
        setRefineFollowUpRequest("");
      }
    } catch (e) {
      console.error("Refine failed:", e);
    } finally {
      if (type === "outreach") setRefiningOutreach(false);
      else setRefiningFollowUp(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 28px",
        maxWidth: 680,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: "var(--primary)" }}>
        Settings
      </h2>

      {/* ── Twenty CRM ── */}
      <Section title="Twenty CRM">
        <Label>API Key</Label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="JWT API key"
          style={{ width: "100%", padding: "7px 10px", marginBottom: 3 }}
        />
        <Hint>Twenty CRM → Settings → API &amp; Webhooks</Hint>
      </Section>

      {/* ── Gmail OAuth ── */}
      <Section title="Gmail (Google OAuth)">
        <div
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          <strong>Setup:</strong>
          <ol style={{ paddingLeft: 16, marginTop: 3 }}>
            <li>Go to <strong>console.cloud.google.com</strong></li>
            <li>Create project → Enable <strong>Gmail API</strong></li>
            <li>OAuth consent → External → add your email as test user</li>
            <li>Credentials → OAuth 2.0 Client ID → <strong>Desktop app</strong></li>
            <li>
              Redirect URI:{" "}
              <code style={{ background: "var(--surface)", padding: "1px 4px", borderRadius: 3 }}>
                http://localhost:3141/oauth
              </code>
            </li>
          </ol>
        </div>

        <Label>Google Client ID</Label>
        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="xxxx.apps.googleusercontent.com"
          style={{ width: "100%", padding: "7px 10px", marginBottom: 10 }}
        />
        <Label>Google Client Secret</Label>
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="GOCSPX-..."
          style={{ width: "100%", padding: "7px 10px", marginBottom: 12 }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, marginBottom: 2 }}>
              Gmail:{" "}
              <span style={{ color: config?.gmail_connected ? "var(--success)" : "var(--text-muted)" }}>
                {config?.gmail_connected ? "Connected ✓" : "Not connected"}
              </span>
            </div>
            {authPending && (
              <div style={{ fontSize: 11, color: "var(--warning)" }}>Waiting for browser auth…</div>
            )}
          </div>
          {config?.gmail_connected ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                background: "transparent",
                color: "var(--danger)",
                border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)",
                padding: "5px 12px",
                fontSize: 12,
              }}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <button
              onClick={onStartAuth}
              disabled={authPending || !clientId || !clientSecret}
              style={{ background: "var(--primary)", color: "#fff", padding: "5px 12px", fontSize: 12, fontWeight: 600 }}
            >
              {authPending ? "Waiting…" : "Connect Gmail"}
            </button>
          )}
        </div>
        {(!clientId || !clientSecret) && <Hint>Save Client ID and Secret first, then connect.</Hint>}
      </Section>

      {/* ── Contact APIs ── */}
      <Section title="Contact APIs (Find Recruiters)">
        <Hint>APIs are tried in order — Snov → Hunter → Prospeo → Apollo — until results are found. Configure as many as you want for maximum coverage.</Hint>

        {/* Snov.io */}
        <ApiRow
          name="Snov.io"
          hint="snov.io → Account → API · 150 email credits/mo free"
          quota={quotas["snov"]}
          checking={!!checkingQuota["snov"]}
          onCheck={() => checkQuota("snov")}
        >
          <input
            type="text"
            value={snovClientId}
            onChange={(e) => setSnovClientId(e.target.value)}
            placeholder="Client ID"
            style={{ flex: 1, padding: "6px 9px", fontSize: 12 }}
          />
          <input
            type="password"
            value={snovClientSecret}
            onChange={(e) => setSnovClientSecret(e.target.value)}
            placeholder="Client Secret"
            style={{ flex: 1, padding: "6px 9px", fontSize: 12 }}
          />
        </ApiRow>

        {/* Hunter.io */}
        <ApiRow
          name="Hunter.io"
          hint="hunter.io → Dashboard → API Key · 25 searches/mo free"
          quota={quotas["hunter"]}
          checking={!!checkingQuota["hunter"]}
          onCheck={() => checkQuota("hunter")}
        >
          <input
            type="password"
            value={hunterApiKey}
            onChange={(e) => setHunterApiKey(e.target.value)}
            placeholder="API Key"
            style={{ flex: 1, padding: "6px 9px", fontSize: 12 }}
          />
        </ApiRow>

        {/* Prospeo */}
        <ApiRow
          name="Prospeo"
          hint="prospeo.io → Dashboard · 75 credits/mo free"
          quota={quotas["prospeo"]}
          checking={!!checkingQuota["prospeo"]}
          onCheck={() => checkQuota("prospeo")}
        >
          <input
            type="password"
            value={prospeoApiKey}
            onChange={(e) => setProspeoApiKey(e.target.value)}
            placeholder="API Key"
            style={{ flex: 1, padding: "6px 9px", fontSize: 12 }}
          />
        </ApiRow>

        {/* Apollo.io */}
        <ApiRow
          name="Apollo.io"
          hint="apollo.io → Settings → Integrations · 50 exports/mo free"
          quota={quotas["apollo"]}
          checking={!!checkingQuota["apollo"]}
          onCheck={() => checkQuota("apollo")}
        >
          <input
            type="password"
            value={apolloApiKey}
            onChange={(e) => setApolloApiKey(e.target.value)}
            placeholder="API Key"
            style={{ flex: 1, padding: "6px 9px", fontSize: 12 }}
          />
        </ApiRow>
      </Section>

      {/* ── n8n Scheduler ── */}
      <Section title="n8n Email Scheduler">
        <Hint>
          Connect to your n8n instance to send scheduled emails even when the app is closed. Import the workflow from <strong>n8n-workflow.json</strong> in the project root, activate it, then paste the webhook URL here.
        </Hint>
        <Label style={{ marginTop: 10 }}>n8n Webhook URL</Label>
        <input
          type="text"
          value={n8nWebhookUrl}
          onChange={(e) => setN8nWebhookUrl(e.target.value)}
          placeholder="https://your-n8n.com/webhook/hitlist-schedule"
          style={{ width: "100%", padding: "7px 10px" }}
        />
        <Hint>
          Get this from n8n → your imported workflow → Webhook node → copy Production URL.
        </Hint>
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <button
            onClick={handleTestWebhook}
            disabled={webhookTesting || !n8nWebhookUrl.trim()}
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", padding: "6px 14px", fontSize: 12 }}
          >
            {webhookTesting ? "Testing…" : "▶ Test Webhook"}
          </button>
          {webhookTestResult && (
            <span style={{ fontSize: 11, color: webhookTestResult.ok ? "var(--success)" : "var(--danger)" }}>
              {webhookTestResult.msg}
            </span>
          )}
        </div>
      </Section>

      {/* ── Resume ── */}
      <Section title="Your Resume">
        <Hint>
          Upload a PDF or paste text below. Click "Parse with AI" to extract your background — included automatically in email generation.
        </Hint>

        {/* PDF upload */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 8 }}>
          <label
            style={{
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              cursor: pdfLoading ? "wait" : "pointer",
              color: "var(--text)",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <input
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePdfUpload(file);
                e.target.value = "";
              }}
              disabled={pdfLoading}
            />
            {pdfLoading ? "Reading PDF…" : "↑ Upload PDF"}
          </label>
          {resumeText.trim() && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              or edit text below
            </span>
          )}
          {pdfError && (
            <span style={{ fontSize: 11, color: "var(--danger)" }}>{pdfError}</span>
          )}
        </div>

        <textarea
          value={resumeText}
          onChange={(e) => { setResumeText(e.target.value); setResumeSaved(false); setParsedResume(null); }}
          placeholder="Paste or upload your resume (PDF or plain text)…"
          style={{
            width: "100%",
            padding: "8px 10px",
            height: 160,
            resize: "vertical",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button
            onClick={handleParseResume}
            disabled={parsing || !resumeText.trim() || !aiApiKey}
            style={{
              background: "var(--accent)",
              color: "#fff",
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {parsing ? "Parsing…" : "✦ Parse with AI"}
          </button>
          {resumeSaved && !parsedResume && (
            <span style={{ fontSize: 11, color: "var(--success)" }}>Saved ✓</span>
          )}
          {!aiApiKey && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Configure AI first to parse</span>
          )}
        </div>

        {parseError && (
          <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 6 }}>{parseError}</div>
        )}

        {/* Parsed resume confirmation card */}
        {parsedResume && (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              background: "color-mix(in srgb, var(--success) 8%, var(--surface2))",
              border: "1px solid color-mix(in srgb, var(--success) 30%, var(--border))",
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--success)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              ✓ Resume Parsed Successfully
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <InfoRow label="Name" value={parsedResume.name} />
              <InfoRow label="Title" value={parsedResume.title} />
              <InfoRow label="Summary" value={parsedResume.summary} />
              {parsedResume.skills?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Skills</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {parsedResume.skills.slice(0, 20).map((s, i) => (
                      <span
                        key={i}
                        style={{
                          background: "color-mix(in srgb, var(--primary) 15%, var(--surface2))",
                          color: "var(--primary)",
                          padding: "2px 8px",
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {parsedResume.experience?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Experience</div>
                  {parsedResume.experience.slice(0, 5).map((e, i) => (
                    <div key={i} style={{ fontSize: 12, paddingLeft: 10, borderLeft: "2px solid var(--primary)", marginBottom: 3, lineHeight: 1.5 }}>
                      {e}
                    </div>
                  ))}
                </div>
              )}
              <InfoRow label="Education" value={parsedResume.education} />
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
              This will be automatically included in AI email generation. Save Settings to persist.
            </div>
          </div>
        )}
      </Section>

      {/* ── Writing Samples ── */}
      <Section title="Writing Samples">
        <Hint>
          Writing samples are the backbone of AI generation — they define your voice.{" "}
          {writingSamples.length > 0
            ? `${writingSamples.length} sample${writingSamples.length === 1 ? "" : "s"} on file.`
            : "Paste emails you've written below to get started."}
        </Hint>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <Label style={{ margin: 0, flexShrink: 0 }}>Samples per generation: <strong>{aiSamplesCount}</strong></Label>
          <input
            type="range"
            min={1}
            max={Math.max(writingSamples.length, 20)}
            value={aiSamplesCount}
            onChange={(e) => setAiSamplesCount(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 28 }}>{aiSamplesCount}/{writingSamples.length}</span>
        </div>

        {/* Manual sample add */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
            Paste an email you've written (body only, no greeting needed):
          </div>
          <textarea
            value={newSampleText}
            onChange={(e) => setNewSampleText(e.target.value)}
            placeholder="Paste any cold email you've written that sounds like you. The more samples, the better the AI matches your voice."
            style={{
              width: "100%",
              padding: "8px 10px",
              height: 120,
              resize: "vertical",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={handleAddManualSample}
            disabled={addingSample || newSampleText.trim().length < 30}
            style={{
              marginTop: 6,
              background: "var(--primary)",
              color: "#fff",
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {addingSample ? "Adding…" : "+ Add Sample"}
          </button>
        </div>

        {samplesLoaded && writingSamples.length === 0 && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              background: "color-mix(in srgb, var(--warning) 10%, var(--surface2))",
              border: "1px solid color-mix(in srgb, var(--warning) 25%, var(--border))",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "var(--warning)" }}>No writing samples yet.</strong>{" "}
            Without samples, the AI generates from your system prompt alone — which is why you keep getting the same opener. Paste 3–5 emails you've written above and generation will immediately improve.
          </div>
        )}

        {writingSamples.length > 0 && (() => {
          const totalPages = Math.ceil(writingSamples.length / CARDS_PER_PAGE);
          const pageStart = carouselPage * CARDS_PER_PAGE;
          const pageItems = writingSamples.slice(pageStart, pageStart + CARDS_PER_PAGE);

          return (
            <div style={{ marginTop: 12 }}>
              {/* Carousel header: count + page nav */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {writingSamples.length} sample{writingSamples.length === 1 ? "" : "s"}
                  {totalPages > 1 && ` · page ${carouselPage + 1} of ${totalPages}`}
                </span>
                {totalPages > 1 && (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button
                      onClick={() => setCarouselPage((p) => Math.max(0, p - 1))}
                      disabled={carouselPage === 0}
                      style={{
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                        padding: "3px 10px",
                        fontSize: 13,
                        borderRadius: 5,
                        lineHeight: 1,
                      }}
                    >
                      ‹
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setCarouselPage(i)}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: i === carouselPage ? "var(--primary)" : "var(--surface2)",
                          border: "1px solid var(--border)",
                          color: i === carouselPage ? "#fff" : "var(--text-muted)",
                          fontSize: 10,
                          fontWeight: i === carouselPage ? 700 : 400,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                        }}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setCarouselPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={carouselPage === totalPages - 1}
                      style={{
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                        padding: "3px 10px",
                        fontSize: 13,
                        borderRadius: 5,
                        lineHeight: 1,
                      }}
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>

              {/* Cards — only current page */}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${CARDS_PER_PAGE}, 1fr)`, gap: 10 }}>
                {pageItems.map((sample, localIdx) => {
                  const globalIdx = pageStart + localIdx;
                  return (
                    <div
                      key={globalIdx}
                      onClick={() => setSampleModalIndex(globalIdx)}
                      style={{
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: 12,
                        cursor: "pointer",
                        transition: "border-color 0.15s, transform 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--primary)";
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        #{globalIdx + 1}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          lineHeight: 1.55,
                          color: "var(--text-muted)",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 6,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {sample}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 10, color: "var(--primary)", fontWeight: 500 }}>
                        Click to view →
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Writing sample modal */}
        {sampleModalIndex !== null && writingSamples[sampleModalIndex] && (
          <div
            onClick={() => setSampleModalIndex(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2000,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                width: 520,
                maxWidth: "92vw",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  Writing Sample #{sampleModalIndex + 1}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => {
                      if (confirm("Delete this writing sample?")) {
                        handleDeleteSample(sampleModalIndex);
                        setSampleModalIndex(null);
                      }
                    }}
                    style={{
                      background: "transparent",
                      color: "var(--danger)",
                      fontSize: 11,
                      border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)",
                      padding: "3px 10px",
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSampleModalIndex(null)}
                    style={{ background: "transparent", color: "var(--text-muted)", padding: "0 4px", fontSize: 17 }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {/* Navigation arrows */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 16px", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
                <button
                  onClick={() => setSampleModalIndex(Math.max(0, sampleModalIndex - 1))}
                  disabled={sampleModalIndex === 0}
                  style={{ background: "transparent", color: "var(--text-muted)", padding: "2px 8px", fontSize: 12 }}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center" }}>
                  {sampleModalIndex + 1} / {writingSamples.length}
                </span>
                <button
                  onClick={() => setSampleModalIndex(Math.min(writingSamples.length - 1, sampleModalIndex + 1))}
                  disabled={sampleModalIndex === writingSamples.length - 1}
                  style={{ background: "transparent", color: "var(--text-muted)", padding: "2px 8px", fontSize: 12 }}
                >
                  Next →
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 16,
                  fontSize: 13,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  color: "var(--text)",
                }}
              >
                {writingSamples[sampleModalIndex]}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── AI Email Generation ── */}
      <Section title="AI Email Generation">
        <Label>Provider</Label>
        <select
          value={aiProvider}
          onChange={(e) => handleProviderChange(e.target.value)}
          style={{ width: "100%", padding: "7px 10px", marginBottom: 3 }}
        >
          <option value="claude">Claude (Anthropic API)</option>
          <option value="opencode">OpenCode Go</option>
          <option value="openrouter">OpenRouter</option>
          <option value="nvidia">Nvidia NIM</option>
          <option value="gemini">Gemini</option>
        </select>
        {PROVIDER_NOTE[aiProvider] && <Hint>{PROVIDER_NOTE[aiProvider]}</Hint>}

        <Label style={{ marginTop: 10 }}>API Key</Label>
        <input
          type="password"
          value={aiApiKey}
          onChange={(e) => { setAiApiKey(e.target.value); setTestResult(null); }}
          placeholder="sk-… or similar"
          style={{ width: "100%", padding: "7px 10px", marginBottom: 3 }}
        />
        <Hint>{PROVIDER_KEY_HINT[aiProvider] ?? ""}</Hint>

        <Label style={{ marginTop: 10 }}>Model</Label>
        <ModelPicker
          provider={aiProvider}
          value={aiModel}
          onChange={(m) => { setAiModel(m); setTestResult(null); }}
        />

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button
            onClick={handleTestAi}
            disabled={testing || !aiApiKey || !aiModel}
            style={{
              background: "var(--surface2)",
              color: "var(--text)",
              padding: "5px 12px",
              fontSize: 12,
              border: "1px solid var(--border)",
            }}
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
          {testResult && (
            <span
              style={{
                fontSize: 11,
                color: testResult.ok ? "var(--success)" : "var(--danger)",
                maxWidth: 300,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {testResult.msg}
            </span>
          )}
        </div>

        <Label style={{ marginTop: 14 }}>System Prompt</Label>
        <textarea
          value={aiSystemPrompt}
          onChange={(e) => setAiSystemPrompt(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 10px",
            height: 180,
            resize: "vertical",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
        <Hint>
          Tone, constraints, and context. Writing samples (above) define your style — the AI matches those first. Your resume is automatically included.
        </Hint>
        {/* AI Refine for outreach prompt */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            type="text"
            value={refineOutreachRequest}
            onChange={(e) => setRefineOutreachRequest(e.target.value)}
            placeholder="e.g. be more direct, mention open source more..."
            style={{ flex: 1, padding: "6px 9px", fontSize: 11 }}
            onKeyDown={(e) => { if (e.key === "Enter") handleRefinePrompt("outreach"); }}
          />
          <button
            onClick={() => handleRefinePrompt("outreach")}
            disabled={refiningOutreach || !refineOutreachRequest.trim() || !aiApiKey}
            style={{ background: "var(--accent)", color: "#fff", padding: "5px 12px", fontSize: 11, fontWeight: 600, flexShrink: 0 }}
          >
            {refiningOutreach ? "Refining…" : "✦ AI Refine"}
          </button>
        </div>
      </Section>

      {/* ── Follow-up Generation ── */}
      <Section title="Follow-up Generation">
        <Hint>
          Configure AI-generated follow-up emails for contacts who haven't replied. A follow-up tab appears in each contact when they qualify.
        </Hint>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <Label style={{ margin: 0, flexShrink: 0 }}>Follow-up after <strong>{followUpDays}</strong> days</Label>
          <input
            type="range"
            min={1}
            max={30}
            value={followUpDays}
            onChange={(e) => setFollowUpDays(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 40 }}>{followUpDays}d</span>
        </div>
        <Hint>Contacts that were reached out to but haven't replied after this many days will show a follow-up tab.</Hint>

        <Label style={{ marginTop: 14 }}>Follow-up System Prompt</Label>
        <textarea
          value={followUpSystemPrompt}
          onChange={(e) => setFollowUpSystemPrompt(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 10px",
            height: 160,
            resize: "vertical",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            type="text"
            value={refineFollowUpRequest}
            onChange={(e) => setRefineFollowUpRequest(e.target.value)}
            placeholder="e.g. shorter, add more urgency, mention availability..."
            style={{ flex: 1, padding: "6px 9px", fontSize: 11 }}
            onKeyDown={(e) => { if (e.key === "Enter") handleRefinePrompt("follow_up"); }}
          />
          <button
            onClick={() => handleRefinePrompt("follow_up")}
            disabled={refiningFollowUp || !refineFollowUpRequest.trim() || !aiApiKey}
            style={{ background: "var(--accent)", color: "#fff", padding: "5px 12px", fontSize: 11, fontWeight: 600, flexShrink: 0 }}
          >
            {refiningFollowUp ? "Refining…" : "✦ AI Refine"}
          </button>
        </div>

        <Label style={{ marginTop: 14 }}>Follow-up Writing Samples</Label>
        <Hint>
          {followUpSamples.length > 0
            ? `${followUpSamples.length} follow-up sample${followUpSamples.length === 1 ? "" : "s"} on file. Falls back to outreach samples if none.`
            : "Optional. Paste follow-up emails you've written. Falls back to outreach samples if empty."}
        </Hint>
        <div style={{ marginTop: 8 }}>
          <textarea
            value={newFollowUpSample}
            onChange={(e) => setNewFollowUpSample(e.target.value)}
            placeholder="Paste a follow-up email you've written…"
            style={{ width: "100%", padding: "8px 10px", height: 100, resize: "vertical", fontSize: 12, lineHeight: 1.5 }}
          />
          <button
            onClick={handleAddFollowUpSample}
            disabled={addingFollowUpSample || newFollowUpSample.trim().length < 20}
            style={{ marginTop: 6, background: "var(--primary)", color: "#fff", padding: "5px 14px", fontSize: 12, fontWeight: 600 }}
          >
            {addingFollowUpSample ? "Adding…" : "+ Add Sample"}
          </button>
        </div>

        {followUpSamplesLoaded && followUpSamples.length > 0 && (() => {
          const totalPages = Math.ceil(followUpSamples.length / CARDS_PER_PAGE);
          const pageStart = followUpCarouselPage * CARDS_PER_PAGE;
          const pageItems = followUpSamples.slice(pageStart, pageStart + CARDS_PER_PAGE);
          return (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {followUpSamples.length} sample{followUpSamples.length === 1 ? "" : "s"}
                  {totalPages > 1 && ` · page ${followUpCarouselPage + 1} of ${totalPages}`}
                </span>
                {totalPages > 1 && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setFollowUpCarouselPage((p) => Math.max(0, p - 1))} disabled={followUpCarouselPage === 0} style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "2px 8px", fontSize: 12, borderRadius: 4 }}>‹</button>
                    <button onClick={() => setFollowUpCarouselPage((p) => Math.min(totalPages - 1, p + 1))} disabled={followUpCarouselPage === totalPages - 1} style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "2px 8px", fontSize: 12, borderRadius: 4 }}>›</button>
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${CARDS_PER_PAGE}, 1fr)`, gap: 10 }}>
                {pageItems.map((sample, localIdx) => {
                  const globalIdx = pageStart + localIdx;
                  return (
                    <div key={globalIdx} onClick={() => setFollowUpSampleModal(globalIdx)} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, cursor: "pointer" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", marginBottom: 4, textTransform: "uppercase" }}>#{globalIdx + 1}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical" }}>{sample}</div>
                      <div style={{ marginTop: 6, fontSize: 10, color: "var(--primary)", fontWeight: 500 }}>Click to view →</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Follow-up sample modal */}
        {followUpSampleModal !== null && followUpSamples[followUpSampleModal] && (
          <div onClick={() => setFollowUpSampleModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, width: 520, maxWidth: "92vw", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Follow-up Sample #{followUpSampleModal + 1}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { if (confirm("Delete this sample?")) { handleDeleteFollowUpSample(followUpSampleModal); setFollowUpSampleModal(null); }}} style={{ background: "transparent", color: "var(--danger)", fontSize: 11, border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", padding: "3px 10px" }}>Delete</button>
                  <button onClick={() => setFollowUpSampleModal(null)} style={{ background: "transparent", color: "var(--text-muted)", padding: "0 4px", fontSize: 17 }}>✕</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 16, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {followUpSamples[followUpSampleModal]}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── Actions ── */}
      {error && (
        <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{error}</div>
      )}
      {success && (
        <div style={{ color: "var(--success)", fontSize: 12, marginBottom: 10 }}>Settings saved!</div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: "var(--primary)", color: "#fff", padding: "8px 24px", fontWeight: 700, fontSize: 13 }}
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        <button
          onClick={onSaved}
          style={{ background: "var(--surface2)", color: "var(--text)", padding: "8px 16px", fontSize: 12 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-muted)",
          marginBottom: 12,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 6,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500, ...style }}>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>{children}</div>
  );
}

function ApiRow({
  name, hint, quota, checking, onCheck, children
}: {
  name: string;
  hint: string;
  quota: { left: number; used: number; label: string } | null | undefined;
  checking: boolean;
  onCheck: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {quota !== undefined && quota !== null && (
            <span style={{ fontSize: 11, color: quota.left > 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
              {quota.left === -1 ? "active" : `${quota.left} ${quota.label} left`}
              {quota.used > 0 && quota.left !== -1 && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {quota.used} used</span>}
            </span>
          )}
          <button
            onClick={onCheck}
            disabled={checking}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "3px 10px", fontSize: 11, borderRadius: 5 }}
          >
            {checking ? "…" : "Check Quota"}
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>{children}</div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 5 }}>{hint}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

const CUSTOM_VALUE = "__custom__";

function ModelPicker({
  provider,
  value,
  onChange,
}: {
  provider: string;
  value: string;
  onChange: (m: string) => void;
}) {
  const presets = PROVIDER_MODELS[provider] ?? [];
  const [customMode, setCustomMode] = useState(() => !presets.includes(value));

  useEffect(() => {
    setCustomMode(!(PROVIDER_MODELS[provider] ?? []).includes(value));
  }, [provider, value]);

  return (
    <div style={{ marginBottom: 4 }}>
      <select
        value={customMode ? CUSTOM_VALUE : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM_VALUE) {
            setCustomMode(true);
            onChange("");
          } else {
            setCustomMode(false);
            onChange(e.target.value);
          }
        }}
        style={{ width: "100%", padding: "7px 10px", marginBottom: customMode ? 6 : 0 }}
      >
        {presets.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
        <option value={CUSTOM_VALUE}>Custom…</option>
      </select>
      {customMode && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter model name…"
          autoFocus
          style={{ width: "100%", padding: "7px 10px" }}
        />
      )}
    </div>
  );
}
