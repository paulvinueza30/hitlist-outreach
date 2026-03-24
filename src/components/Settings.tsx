import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig, AiConfig } from "../types";

// Known models per provider (used for datalist suggestions)
const PROVIDER_MODELS: Record<string, string[]> = {
  claude: [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-haiku-4-5",
  ],
  opencode: [
    "glm-5-flash",
    "minimax-m2-5",
    "minimax-m2-7",
  ],
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
    "OpenCode Go: GLM models use OpenAI-compat endpoint; MiniMax (M2) models use Anthropic-compat — detected automatically.",
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

  const [aiProvider, setAiProvider] = useState("claude");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("claude-haiku-4-5-20251001");
  const [aiSystemPrompt, setAiSystemPrompt] = useState("");

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

  const handleProviderChange = (p: string) => {
    setAiProvider(p);
    // Reset model to first suggestion for the new provider if current doesn't belong
    const models = PROVIDER_MODELS[p] ?? [];
    if (!models.includes(aiModel)) {
      setAiModel(models[0] ?? "");
    }
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await invoke("save_config", { apiKey, clientId, clientSecret, snovClientId, snovClientSecret });
      await invoke("save_ai_config", {
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        systemPrompt: aiSystemPrompt,
      });
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
    // Save first so Rust reads the latest values
    try {
      await invoke("save_ai_config", {
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        systemPrompt: aiSystemPrompt,
      });
    } catch {
      // ignore save errors during test
    }
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

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 28,
        maxWidth: 620,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 22, color: "var(--primary)" }}>
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
            borderRadius: "var(--radius)",
            padding: 11,
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
              <code style={{ background: "var(--surface)", padding: "1px 4px" }}>
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 0",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, marginBottom: 2 }}>
              Gmail:{" "}
              <span style={{ color: config?.gmail_connected ? "var(--success)" : "var(--text-muted)" }}>
                {config?.gmail_connected ? "Connected ✓" : "Not connected"}
              </span>
            </div>
            {authPending && (
              <div style={{ fontSize: 11, color: "var(--warning)" }}>
                Waiting for browser auth…
              </div>
            )}
          </div>
          {config?.gmail_connected ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                background: "transparent",
                color: "var(--danger)",
                border: "1px solid var(--danger)",
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
              style={{ background: "var(--primary)", color: "#fff", padding: "5px 12px", fontSize: 12 }}
            >
              {authPending ? "Waiting…" : "Connect Gmail"}
            </button>
          )}
        </div>
        {(!clientId || !clientSecret) && (
          <Hint>Save Client ID and Secret first, then connect.</Hint>
        )}
      </Section>

      {/* ── Snov.io ── */}
      <Section title="Snov.io (Find Recruiters)">
        <Hint>Free plan: 150 email credits/month. Get credentials at snov.io → Account → API.</Hint>
        <Label style={{ marginTop: 10 }}>Client ID</Label>
        <input
          type="text"
          value={snovClientId}
          onChange={(e) => setSnovClientId(e.target.value)}
          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          style={{ width: "100%", padding: "7px 10px", marginBottom: 10 }}
        />
        <Label>Client Secret</Label>
        <input
          type="password"
          value={snovClientSecret}
          onChange={(e) => setSnovClientSecret(e.target.value)}
          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          style={{ width: "100%", padding: "7px 10px" }}
        />
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

        {/* Test connection */}
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
            height: 210,
            resize: "vertical",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
        <Hint>Defines Paul's background and email tone. Customize as needed.</Hint>
      </Section>

      {/* ── Actions ── */}
      {error && (
        <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{error}</div>
      )}
      {success && (
        <div style={{ color: "var(--success)", fontSize: 12, marginBottom: 10 }}>Saved!</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: "var(--primary)", color: "#fff", padding: "7px 22px", fontWeight: 600 }}
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        <button
          onClick={onSaved}
          style={{ background: "var(--surface2)", color: "var(--text)", padding: "7px 16px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          marginBottom: 10,
          textTransform: "uppercase",
          letterSpacing: 0.6,
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
    <div style={{ display: "block", marginBottom: 3, fontSize: 12, ...style }}>{children}</div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{children}</div>
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
  // Custom mode: value not in presets (including saved custom models)
  const [customMode, setCustomMode] = useState(() => !presets.includes(value));

  // When provider changes, reset custom mode to match new preset list
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
          <option key={m} value={m}>
            {m}
          </option>
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
