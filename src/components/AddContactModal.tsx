import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Person, SnovProspect } from "../types";

interface Props {
  onClose: () => void;
  onAdded: (people: Person[]) => void;
  snovConfigured: boolean;
  enabledApis: string[];
  existingContacts: Person[];
  isPage?: boolean;
}

// Extract a searchable domain from a URL — for ATS/LinkedIn slugs, guess {slug}.com
function extractDomain(input: string): { domain: string; companySlug: string } {
  const trimmed = input.trim();

  // LinkedIn company URL → strip hyphens from slug → guess domain
  const liMatch = trimmed.match(/linkedin\.com\/company\/([^/?#]+)/);
  if (liMatch) {
    const slug = liMatch[1].replace(/-/g, "");
    return { domain: slug + ".com", companySlug: liMatch[1].replace(/-/g, " ") };
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");

    // Known ATS domains: extract company slug from path and guess {slug}.com
    const atsMap: Record<string, (p: string) => string> = {
      "jobs.lever.co": (p) => p.split("/")[1],
      "boards.greenhouse.io": (p) => p.split("/")[1],
      "jobs.ashbyhq.com": (p) => p.split("/")[1],
      "jobs.workday.com": (p) => p.split("/")[1],
    };
    if (atsMap[host]) {
      const slug = atsMap[host](url.pathname) || "";
      return { domain: slug ? slug + ".com" : host, companySlug: slug };
    }

    // Subdomain ATSes like acme.greenhouse.io
    const subAts = ["greenhouse.io", "lever.co", "teamtailor.com", "recruitee.com", "bamboohr.com"];
    for (const ats of subAts) {
      if (host.endsWith("." + ats)) {
        const slug = host.replace("." + ats, "").replace(/^(jobs|careers|apply)\./, "");
        return { domain: slug + ".com", companySlug: slug };
      }
    }

    return { domain: host, companySlug: "" };
  } catch {
    return { domain: trimmed, companySlug: "" };
  }
}

function isLinkedInCompanyUrl(s: string) {
  return s.includes("linkedin.com/company/");
}

type Mode = "snov" | "manual";

const API_META: Record<string, { cmd: string; label: string }> = {
  snov:    { cmd: "snov_search_prospects",    label: "Snov.io" },
  hunter:  { cmd: "hunter_search_prospects",  label: "Hunter.io" },
  prospeo: { cmd: "prospeo_search_prospects", label: "Prospeo" },
  apollo:  { cmd: "apollo_search_prospects",  label: "Apollo.io" },
};

export default function AddContactModal({ onClose, onAdded, snovConfigured, enabledApis, existingContacts, isPage }: Props) {
  const existingEmails = new Set(
    existingContacts.flatMap(c => c.emails?.primaryEmail ? [c.emails.primaryEmail.toLowerCase()] : [])
  );
  const existingLinkedins = new Set(
    existingContacts.flatMap(c => c.linkedinLink?.primaryLinkUrl ? [c.linkedinLink.primaryLinkUrl.toLowerCase()] : [])
  );
  const [mode, setMode] = useState<Mode>(snovConfigured ? "snov" : "manual");

  // Snov mode state
  const [jobUrl, setJobUrl] = useState("");
  const [domain, setDomain] = useState("");
  const [companyDisplay, setCompanyDisplay] = useState("");
  const [jobPostingUrl, setJobPostingUrl] = useState("");
  const [jobPostingLabel, setJobPostingLabel] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [prospects, setProspects] = useState<SnovProspect[]>([]);
  const [sourceUsed, setSourceUsed] = useState<string | null>(null);
  const [selectedApi, setSelectedApi] = useState<"auto" | string>("auto");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapedCompany, setScrapedCompany] = useState("");

  // Manual mode state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualDomain, setManualDomain] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [manualJobUrl, setManualJobUrl] = useState("");
  const [manualJobLabel, setManualJobLabel] = useState("");
  const [manualAdding, setManualAdding] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetSnovForm = useCallback(() => {
    setJobUrl("");
    setDomain("");
    setCompanyDisplay("");
    setJobPostingUrl("");
    setJobPostingLabel("");
    setProspects([]);
    setSelected(new Set());
    setSourceUsed(null);
    setScrapedCompany("");
    setSearchError(null);
  }, []);

  const resetManualForm = useCallback(() => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setJobTitle("");
    setManualCompany("");
    setManualDomain("");
    setLinkedinUrl("");
    setManualJobUrl("");
    setManualJobLabel("");
    setManualError(null);
  }, []);

  const handleScrapeJobUrl = useCallback(async () => {
    if (!jobUrl.trim()) return;
    setScraping(true);
    setSearchError(null);
    try {
      const { domain: d, companySlug } = extractDomain(jobUrl.trim());
      setJobPostingUrl(jobUrl.trim());
      setDomain(d);

      // Try scraping for a better company name
      let found = "";
      try {
        const text = await invoke<string>("scrape_url", { url: jobUrl.trim() });
        const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
        for (const line of lines.slice(0, 30)) {
          const m = line.match(/\bat\s+([A-Z][A-Za-z0-9\s&.,'-]{1,40})/);
          if (m) { found = m[1].trim(); break; }
        }
      } catch { /* scrape is best-effort */ }

      const display = found || companySlug || d;
      setScrapedCompany(display);
      setCompanyDisplay(display);
      setJobPostingLabel(display);
    } catch (e) {
      setSearchError("Failed: " + String(e));
    } finally {
      setScraping(false);
    }
  }, [jobUrl]);

  const handleSearch = useCallback(async () => {
    const d = domain.trim();
    if (!d) return;
    if (!d.includes(".")) {
      setSearchError("Enter the company domain (e.g. riotgames.com) to search.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setProspects([]);
    setSelected(new Set());
    setSourceUsed(null);

    // Build the list of APIs to try
    const toTry = selectedApi === "auto"
      ? enabledApis.map(k => API_META[k]).filter(Boolean)
      : API_META[selectedApi] ? [API_META[selectedApi]] : [];

    if (toTry.length === 0) {
      setSearchError("No APIs configured. Go to Settings → Contact APIs and add at least one key.");
      setSearching(false);
      return;
    }

    const errors: string[] = [];
    for (const { cmd, label } of toTry) {
      try {
        const results = await invoke<SnovProspect[]>(cmd, { domain: d });
        if (results.length > 0) {
          setProspects(results);
          setSourceUsed(label);
          setSearching(false);
          return;
        }
        // Empty result — keep trying other APIs in auto mode
        errors.push(`${label}: 0 results`);
      } catch (e) {
        errors.push(`${label}: ${String(e)}`);
      }
    }

    setSearchError(
      `No recruiters found. Tried: ${errors.join(" · ")}`
    );
    setSearching(false);
  }, [domain, selectedApi, enabledApis]);

  const toggleSelect = (i: number) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  };


  const handleAddSelected = useCallback(async () => {
    if (selected.size === 0) return;
    setAdding(true);
    setSearchError(null);

    // Auto-fetch emails for selected prospects that don't have one
    const updated = [...prospects];
    for (const i of Array.from(selected)) {
      if (!updated[i].email && updated[i].email_start_url) {
        try {
          let email: string;
          if (updated[i].source === "prospeo") {
            email = await invoke<string>("prospeo_fetch_email", { personId: updated[i].email_start_url });
          } else {
            email = await invoke<string>("snov_fetch_email", { emailStartUrl: updated[i].email_start_url });
          }
          updated[i] = { ...updated[i], email };
        } catch { /* skip, will block below */ }
      }
    }
    setProspects(updated);

    // Block adding anyone still without email
    const missing = Array.from(selected).filter(i => !updated[i].email);
    if (missing.length > 0) {
      const names = missing.map(i => updated[i].first_name).join(", ");
      setSearchError(`No email found for: ${names}. Can't add contacts without email.`);
      setAdding(false);
      return;
    }

    const added: Person[] = [];
    let dupeCount = 0;
    for (const i of Array.from(selected)) {
      const p = updated[i];
      // Dupe check
      if (p.email && existingEmails.has(p.email.toLowerCase())) { dupeCount++; continue; }
      if (p.linkedin_url && existingLinkedins.has(p.linkedin_url.toLowerCase())) { dupeCount++; continue; }
      try {
        const person = await invoke<Person>("create_contact", {
          firstName: p.first_name,
          lastName: p.last_name,
          email: p.email || null,
          jobTitle: p.position || null,
          companyName: companyDisplay || null,
          companyDomain: domain || null,
          linkedinUrl: p.linkedin_url || null,
          jobPostingUrl: jobPostingUrl || null,
          jobPostingLabel: jobPostingLabel || null,
        });
        added.push(person);
      } catch (e) {
        console.error("Failed to create", p.first_name, e);
      }
    }
    setAdding(false);
    if (dupeCount > 0 && added.length === 0) {
      setSearchError(`All ${dupeCount} selected contact(s) already exist in your hitlist.`);
      return;
    }
    if (added.length > 0) {
      onAdded(added);
      resetSnovForm();
      setSuccessMsg(`✓ ${added.length} contact${added.length > 1 ? "s" : ""} added${dupeCount > 0 ? ` (${dupeCount} duplicate${dupeCount > 1 ? "s" : ""} skipped)` : ""}!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } else if (dupeCount > 0) {
      setSearchError(`${dupeCount} duplicate(s) skipped.`);
    }
  }, [selected, prospects, companyDisplay, domain, jobPostingUrl, jobPostingLabel, existingEmails, existingLinkedins, onAdded, resetSnovForm]);

  const handleManualAdd = useCallback(async () => {
    if (!firstName.trim() && !lastName.trim()) return;
    setManualAdding(true);
    setManualError(null);
    try {
      const person = await invoke<Person>("create_contact", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        jobTitle: jobTitle.trim() || null,
        companyName: manualCompany.trim() || null,
        companyDomain: manualDomain.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        jobPostingUrl: manualJobUrl.trim() || null,
        jobPostingLabel: manualJobLabel.trim() || null,
      });
      onAdded([person]);
      resetManualForm();
      setSuccessMsg(`✓ ${firstName.trim()} ${lastName.trim()} added!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      setManualError(String(e));
      setManualAdding(false);
    }
  }, [firstName, lastName, email, jobTitle, manualCompany, manualDomain, linkedinUrl, manualJobUrl, manualJobLabel, onAdded, resetManualForm]);

  const innerContent = (
    <>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: isPage ? "16px 20px" : "12px 16px",
        borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: isPage ? 16 : 14 }}>Add Contacts</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {snovConfigured && (
            <div style={{ display: "flex", background: "var(--surface2)", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
              {(["snov", "manual"] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  padding: "4px 12px", fontSize: 12,
                  background: mode === m ? "var(--primary)" : "transparent",
                  color: mode === m ? "#fff" : "var(--text-muted)",
                  borderRadius: 0,
                  fontWeight: mode === m ? 600 : 400,
                }}>
                  {m === "snov" ? "Find Recruiters" : "Manual"}
                </button>
              ))}
            </div>
          )}
          {!isPage && (
            <button onClick={onClose} style={{ background: "transparent", color: "var(--text-muted)", padding: "0 4px", fontSize: 16 }}>✕</button>
          )}
        </div>
      </div>

      {successMsg && (
        <div style={{ padding: "10px 20px", background: "color-mix(in srgb, var(--success) 15%, transparent)", borderBottom: "1px solid color-mix(in srgb, var(--success) 30%, transparent)", color: "var(--success)", fontSize: 12, fontWeight: 600 }}>
          {successMsg}
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: isPage ? "16px 20px" : 16 }}>
          {!snovConfigured && mode === "manual" && (
            <div style={{ marginBottom: 12, padding: "8px 12px", background: "color-mix(in srgb, var(--warning) 12%, transparent)", borderRadius: 6, fontSize: 11, color: "var(--text-muted)" }}>
              Add your Snov.io credentials in <strong>Settings</strong> to enable recruiter search from job postings.
            </div>
          )}
          {mode === "snov" ? (
            <>
              {/* API selector */}
              {enabledApis.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                  {(["auto", ...enabledApis] as string[]).map(api => {
                    const label = api === "auto" ? "Auto" : (API_META[api]?.label ?? api);
                    const active = selectedApi === api;
                    return (
                      <button
                        key={api}
                        onClick={() => setSelectedApi(api)}
                        style={{
                          padding: "3px 10px", fontSize: 11, borderRadius: 12,
                          background: active ? "var(--primary)" : "var(--surface2)",
                          color: active ? "#fff" : "var(--text-muted)",
                          border: active ? "none" : "1px solid var(--border)",
                          fontWeight: active ? 600 : 400,
                        }}
                      >{label}</button>
                    );
                  })}
                  {sourceUsed && (
                    <span style={{ marginLeft: 4, alignSelf: "center", fontSize: 10, color: "var(--text-muted)" }}>
                      last result: <strong style={{ color: "var(--primary)" }}>{sourceUsed}</strong>
                    </span>
                  )}
                </div>
              )}
              <SnovPanel
                jobUrl={jobUrl} setJobUrl={setJobUrl}
                domain={domain} setDomain={setDomain}
                companyDisplay={companyDisplay} setCompanyDisplay={setCompanyDisplay}
                scrapedCompany={scrapedCompany}
                scraping={scraping} onScrape={handleScrapeJobUrl}
                searching={searching} onSearch={handleSearch}
                searchError={searchError}
                prospects={prospects}
                selected={selected} onToggle={toggleSelect}
                adding={adding} onAddSelected={handleAddSelected}
              />
            </>
          ) : (
            <ManualPanel
              firstName={firstName} setFirstName={setFirstName}
              lastName={lastName} setLastName={setLastName}
              email={email} setEmail={setEmail}
              jobTitle={jobTitle} setJobTitle={setJobTitle}
              company={manualCompany} setCompany={setManualCompany}
              domain={manualDomain} setDomain={setManualDomain}
              linkedinUrl={linkedinUrl} setLinkedinUrl={setLinkedinUrl}
              jobUrl={manualJobUrl} setJobUrl={setManualJobUrl}
              jobLabel={manualJobLabel} setJobLabel={setManualJobLabel}
              adding={manualAdding} error={manualError}
              onAdd={handleManualAdd}
            />
          )}
      </div>
    </>
  );

  if (isPage) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
        {innerContent}
      </div>
    );
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        width: 560,
        maxWidth: "95vw",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        {innerContent}
      </div>
    </div>
  );
}

// ── Snov Panel ─────────────────────────────────────────────────────────────

function SnovPanel({
  jobUrl, setJobUrl, domain, setDomain, companyDisplay, setCompanyDisplay,
  scrapedCompany, scraping, onScrape, searching, onSearch, searchError,
  prospects, selected, onToggle, adding, onAddSelected,
}: {
  jobUrl: string; setJobUrl: (s: string) => void;
  domain: string; setDomain: (s: string) => void;
  companyDisplay: string; setCompanyDisplay: (s: string) => void;
  scrapedCompany: string;
  scraping: boolean; onScrape: () => void;
  searching: boolean; onSearch: () => void;
  searchError: string | null;
  prospects: SnovProspect[];
  selected: Set<number>; onToggle: (i: number) => void;
  adding: boolean; onAddSelected: () => void;
}) {
  const selectedCount = selected.size;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Job URL row */}
      <div>
        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
          JOB POSTING URL (optional — auto-extracts company)
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            placeholder="https://jobs.lever.co/stripe/..."
            value={jobUrl}
            onChange={e => setJobUrl(e.target.value)}
            style={{ flex: 1, padding: "6px 8px", fontSize: 12 }}
          />
          <button
            onClick={onScrape}
            disabled={scraping || !jobUrl.trim()}
            style={{ background: "var(--surface2)", color: "var(--text)", padding: "6px 12px", fontSize: 12, border: "1px solid var(--border)", flexShrink: 0 }}
          >
            {scraping ? "Scraping…" : "Scrape"}
          </button>
        </div>
      </div>

      {/* Company domain row */}
      <div>
        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
          COMPANY DOMAIN *
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            placeholder="riotgames.com"
            value={domain}
            onChange={e => setDomain(e.target.value.trim())}
            onKeyDown={e => e.key === "Enter" && onSearch()}
            style={{ flex: 1, padding: "6px 8px", fontSize: 12 }}
          />
          <button
            onClick={onSearch}
            disabled={searching || !domain.trim()}
            style={{ background: "var(--primary)", color: "#fff", padding: "6px 16px", fontSize: 12, fontWeight: 500, flexShrink: 0 }}
          >
            {searching ? "Searching…" : "Find Recruiters"}
          </button>
        </div>
      </div>

      {/* Company display name */}
      <div>
        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
          COMPANY NAME (for contact record)
        </label>
        <input
          type="text"
          placeholder="Riot Games"
          value={companyDisplay}
          onChange={e => setCompanyDisplay(e.target.value)}
          style={{ width: "100%", padding: "6px 8px", fontSize: 12 }}
        />
        {scrapedCompany && (
          <div style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>
            Detected: {scrapedCompany}
          </div>
        )}
      </div>

      {searchError && (
        <div style={{ fontSize: 12, color: "var(--danger)", padding: "8px 10px", background: "color-mix(in srgb, var(--danger) 10%, transparent)", borderRadius: 4, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span className="selectable" style={{ flex: 1, userSelect: "text", lineHeight: 1.5 }}>{searchError}</span>
          <button
            onClick={() => navigator.clipboard.writeText(searchError)}
            title="Copy error"
            style={{ background: "transparent", color: "var(--danger)", padding: "0 4px", fontSize: 11, flexShrink: 0, opacity: 0.7, border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", borderRadius: 3 }}
          >⎘</button>
        </div>
      )}

      {/* Results */}
      {prospects.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
              {prospects.length} RECRUITERS FOUND — select to add
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => {/* select all handled inline */}}
                style={{ fontSize: 11, background: "transparent", color: "var(--primary)", padding: 0 }}
              >
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
            {prospects.map((p, i) => {
              const isSelected = selected.has(i);
              return (
                <div
                  key={i}
                  onClick={() => onToggle(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: `1px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                    background: isSelected ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface2)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(i)}
                    onClick={e => e.stopPropagation()}
                    style={{ flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>
                      {p.first_name} {p.last_name}
                      {p.seniority && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 5, fontWeight: 400 }}>
                          {p.seniority}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.position}</div>
                    {(p.city || p.country) && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        📍 {[p.city, p.country].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {p.email ? (
                      <div style={{ fontSize: 11, color: "var(--success)" }}>✓ {p.email}</div>
                    ) : (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {p.email_start_url ? "email fetched on add" : "no email available"}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {p.linkedin_url && (
                      <button
                        onClick={() => invoke("open_viewer_window", { url: p.linkedin_url, title: `${p.first_name} ${p.last_name}` })}
                        title="View LinkedIn profile"
                        style={{ fontSize: 10, padding: "2px 7px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--primary)" }}
                      >
                        LinkedIn ↗
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={onAddSelected}
            disabled={adding || selectedCount === 0}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "8px 0",
              background: selectedCount > 0 ? "var(--primary)" : "var(--surface2)",
              color: selectedCount > 0 ? "#fff" : "var(--text-muted)",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {adding ? "Adding…" : selectedCount > 0 ? `Add ${selectedCount} contact${selectedCount > 1 ? "s" : ""} to Hitlist` : "Select contacts to add"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Manual Panel ──────────────────────────────────────────────────────────

function ManualPanel({
  firstName, setFirstName, lastName, setLastName,
  email, setEmail, jobTitle, setJobTitle,
  company, setCompany, domain, setDomain,
  linkedinUrl, setLinkedinUrl,
  jobUrl, setJobUrl, jobLabel, setJobLabel,
  adding, error, onAdd,
}: {
  firstName: string; setFirstName: (s: string) => void;
  lastName: string; setLastName: (s: string) => void;
  email: string; setEmail: (s: string) => void;
  jobTitle: string; setJobTitle: (s: string) => void;
  company: string; setCompany: (s: string) => void;
  domain: string; setDomain: (s: string) => void;
  linkedinUrl: string; setLinkedinUrl: (s: string) => void;
  jobUrl: string; setJobUrl: (s: string) => void;
  jobLabel: string; setJobLabel: (s: string) => void;
  adding: boolean; error: string | null; onAdd: () => void;
}) {
  const row = (label: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
  const inp = (val: string, set: (s: string) => void, ph: string) => (
    <input type="text" value={val} onChange={e => set(e.target.value)} placeholder={ph}
      style={{ width: "100%", padding: "6px 8px", fontSize: 12 }} />
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>FIRST NAME *</label>
          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane"
            style={{ width: "100%", padding: "6px 8px", fontSize: 12 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>LAST NAME</label>
          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith"
            style={{ width: "100%", padding: "6px 8px", fontSize: 12 }} />
        </div>
      </div>
      {row("EMAIL", inp(email, setEmail, "jane@company.com"))}
      {row("JOB TITLE", inp(jobTitle, setJobTitle, "Technical Recruiter"))}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>COMPANY</label>
          <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Stripe"
            style={{ width: "100%", padding: "6px 8px", fontSize: 12 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>DOMAIN (for logo)</label>
          <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="stripe.com"
            style={{ width: "100%", padding: "6px 8px", fontSize: 12 }} />
        </div>
      </div>
      {row("LINKEDIN URL", inp(linkedinUrl, setLinkedinUrl, "https://linkedin.com/in/..."))}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>JOB POSTING URL</label>
          <input type="text" value={jobUrl} onChange={e => setJobUrl(e.target.value)} placeholder="https://..."
            style={{ width: "100%", padding: "6px 8px", fontSize: 12 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>LABEL</label>
          <input type="text" value={jobLabel} onChange={e => setJobLabel(e.target.value)} placeholder="Senior Engineer"
            style={{ width: "100%", padding: "6px 8px", fontSize: 12 }} />
        </div>
      </div>

      {error && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <button
        onClick={onAdd}
        disabled={adding || (!firstName.trim() && !lastName.trim())}
        style={{ width: "100%", padding: "8px 0", background: "var(--primary)", color: "#fff", fontWeight: 600, fontSize: 13 }}
      >
        {adding ? "Adding…" : "Add Contact"}
      </button>
    </div>
  );
}
