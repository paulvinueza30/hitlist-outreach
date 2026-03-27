import { AiPromptPreview } from "../types";

interface Props {
  data: AiPromptPreview;
  onClose: () => void;
}

export default function AiDebugModal({ data, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(860px, 94vw)",
          height: "88vh",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>AI Request Debug</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{data.provider} / {data.model}</span>
            <span style={{ fontSize: 11, color: "var(--accent)" }}>
              {data.samples_count} sample{data.samples_count === 1 ? "" : "s"}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "transparent", color: "var(--text-muted)", fontSize: 18, padding: "0 4px", lineHeight: 1 }}>✕</button>
        </div>

        {/* Body — scrollable, two labeled sections */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              System Prompt
            </div>
            <textarea
              readOnly
              value={data.system_prompt}
              className="selectable"
              style={{
                height: 200,
                padding: "8px 10px",
                fontSize: 11,
                lineHeight: 1.6,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                resize: "vertical",
                color: "var(--text)",
                fontFamily: "monospace",
                overflowY: "auto",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              User Message
            </div>
            <textarea
              readOnly
              value={data.user_message}
              className="selectable"
              style={{
                flex: 1,
                minHeight: 300,
                padding: "8px 10px",
                fontSize: 11,
                lineHeight: 1.6,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                resize: "vertical",
                color: "var(--text)",
                fontFamily: "monospace",
                overflowY: "auto",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
          Endpoint: {data.endpoint}
        </div>
      </div>
    </div>
  );
}
