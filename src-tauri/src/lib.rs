use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

// ============================================================
// Data types
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersonName {
    #[serde(rename = "firstName")]
    pub first_name: String,
    #[serde(rename = "lastName")]
    pub last_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersonEmails {
    #[serde(rename = "primaryEmail")]
    pub primary_email: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersonPhones {
    #[serde(rename = "primaryPhoneNumber")]
    pub primary_phone_number: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersonLink {
    #[serde(rename = "primaryLinkUrl")]
    pub primary_link_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobPosting {
    #[serde(rename = "primaryLinkUrl")]
    pub primary_link_url: String,
    #[serde(rename = "primaryLinkLabel")]
    pub primary_link_label: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Company {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Person {
    pub id: String,
    pub name: PersonName,
    #[serde(rename = "jobTitle")]
    pub job_title: Option<String>,
    pub emails: Option<PersonEmails>,
    pub phones: Option<PersonPhones>,
    #[serde(rename = "linkedinLink")]
    pub linkedin_link: Option<PersonLink>,
    #[serde(rename = "jobPosting")]
    pub job_posting: Option<JobPosting>,
    pub contacted: Option<bool>,
    pub company: Option<Company>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmailMessage {
    pub id: String,
    pub from: String,
    pub to: String,
    pub subject: String,
    pub body: String,
    pub date: String,
    pub snippet: String,
    #[serde(rename = "isHtml")]
    pub is_html: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmailThread {
    pub id: String,
    pub subject: String,
    pub snippet: String,
    pub messages: Vec<EmailMessage>,
    #[serde(rename = "lastDate")]
    pub last_date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub twenty_api_key: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub gmail_connected: bool,
    pub apollo_api_key: String,
    pub hunter_api_key: String,
    pub prospeo_api_key: String,
    pub snov_enabled: bool,
    pub hunter_enabled: bool,
    pub prospeo_enabled: bool,
    pub apollo_enabled: bool,
    pub snov_client_id: String,
    pub snov_client_secret: String,
    pub n8n_webhook_url: String,
    pub ai_samples_count: usize,
    pub follow_up_days: usize,
    pub follow_up_system_prompt: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConfig {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeneratedEmail {
    pub subject: String,
    pub body: String,
    pub samples_used: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OutreachEntry {
    pub person_id: String,
    pub name: String,
    pub company: Option<String>,
    pub ts: i64, // Unix seconds
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ContactContext {
    pub job: String,
    pub linkedin: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApolloPersonResult {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub title: Option<String>,
    pub linkedin_url: Option<String>,
    pub email: Option<String>,
    pub organization_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScheduledEmail {
    pub id: String,
    pub contact_id: String,
    pub contact_name: String,
    pub contact_email: String,
    pub contact_company: Option<String>,
    pub subject: String,
    pub body: String,
    pub scheduled_at: i64, // Unix seconds
    pub status: String,    // "pending" | "sent" | "failed"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiPromptPreview {
    pub system_prompt: String,
    pub user_message: String,
    pub model: String,
    pub provider: String,
    pub endpoint: String,
    pub samples_count: usize,
}

// ============================================================
// Constants
// ============================================================

pub const DEFAULT_API_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxZDlkNjlkYS1iOGJlLTRlNTctOTVlZS1iYjI3MTQwN2Q1ZmYiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiMWQ5ZDY5ZGEtYjhiZS00ZTU3LTk1ZWUtYmIyNzE0MDdkNWZmIiwiaWF0IjoxNzY5NDg1NjkzLCJleHAiOjQ5MjI5OTkyOTIsImp0aSI6IjJjN2YyOGEwLTY3NDAtNGM4Mi04YTY3LWY4NDMzNGQ0ZGMyMSJ9.6Y4gGwoH8U8X0Ar-voGpdgxj9DsoUSGQ1v6kXJ3Ee7M";

pub const DEFAULT_FOLLOW_UP_SYSTEM_PROMPT: &str = "You are helping Paul Vinueza write short, natural follow-up emails to recruiters who haven't replied.

Guidelines:
- Keep follow-ups under 80 words — shorter is better
- Reference the original outreach briefly (\"just wanted to follow up on my previous note\")
- Don't sound desperate or apologetic
- Add a small new detail, question, or angle — don't just say \"following up\"
- One clear, low-friction ask: quick call, 10-min chat, or just to check if the role is still open
- Avoid: \"I just wanted to\", \"I hope this finds you\", \"circle back\", \"touch base\"
- Sound human, not like an automated drip campaign
- No subject line needed — reply to the original thread";

pub const DEFAULT_SYSTEM_PROMPT: &str = "You are helping Paul Vinueza write personalized cold outreach emails to recruiters.

Guidelines:
- Keep emails under 140 words
- Be direct and confident, not arrogant
- Reference the specific role or company when possible
- Mention 2-3 relevant skills from Paul's background that match the role
- End with a clear call to action (brief chat or call)
- Avoid cliches: \"I hope this finds you well\", \"I wanted to reach out\", \"I'm passionate about\", \"synergy\", \"leverage\", \"circle back\", \"touch base\"
- Sound human and genuine, not like a template
- No hollow openers or filler phrases
- First line should be engaging and specific, not generic

Paul's background:
- Full Stack Engineer: Go, Python, TypeScript, React, Next.js, Node.js/Bun
- Backend: Microservices, RabbitMQ, Redis, FastAPI (Python), Gin (Go)
- DevOps & Infra: Linux, Docker, Kubernetes, n8n, GitHub Actions
- Cloud: Google Cloud Platform, Vercel, Oracle
- AI: AI Agents, Prompt Engineering, RAG, OpenCode, Spec-Driven Development
- Tools: Git, Jira, Figma, TUIs, Lazygit, Tmux, Vim Motions
- Recent: Next.js 15 platform at DSD Cohort (6-person Agile team, spec-driven dev, Git worktrees, daily standups, 2-reviewer PR policy)
- Projects: TinyAutomator (Go/RabbitMQ/Redis workflow engine), HyprTask (Go/Bubble Tea TUI Linux task manager), League portfolio (React Three Fiber, SSR, live WakaTime + LeetCode tracking)
- UCF Computer Science B.S.
- Open Source: ActivePieces contributor (added Twitch trigger)
- Active in: Commit Your Code, DevOps Days, Orlando Devs meetups";

// ============================================================
// Store helpers
// ============================================================

pub fn store_get(app: &AppHandle, key: &str) -> Option<String> {
    let store = app.store("config.json").ok()?;
    store.get(key)?.as_str().map(String::from)
}

pub fn store_set(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    store.set(key, json!(value));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn store_delete(app: &AppHandle, key: &str) -> Result<(), String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    store.delete(key);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================
// Writing samples — local JSON file
// ============================================================

fn writing_samples_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("writing_samples.json"))
}

pub fn load_writing_samples(app: &AppHandle) -> Vec<String> {
    let path = match writing_samples_path(app) {
        Ok(p) => p,
        Err(_) => return vec![],
    };
    let data = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str::<Vec<String>>(&data).unwrap_or_default()
}

fn save_writing_samples_list(app: &AppHandle, samples: &[String]) -> Result<(), String> {
    let path = writing_samples_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(samples).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn follow_up_samples_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("follow_up_samples.json"))
}

pub fn load_follow_up_samples(app: &AppHandle) -> Vec<String> {
    let path = match follow_up_samples_path(app) {
        Ok(p) => p,
        Err(_) => return vec![],
    };
    let data = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str::<Vec<String>>(&data).unwrap_or_default()
}

fn save_follow_up_samples_list(app: &AppHandle, samples: &[String]) -> Result<(), String> {
    let path = follow_up_samples_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(samples).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn pick_random_samples(samples: &[String], n: usize) -> Vec<String> {
    if samples.len() <= n {
        return samples.to_vec();
    }
    // LCG shuffle seeded from subsecond time — no rand crate needed
    let seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64;
    let mut indices: Vec<usize> = (0..samples.len()).collect();
    let mut s = seed ^ (samples.len() as u64).wrapping_mul(2654435761);
    for i in (1..indices.len()).rev() {
        s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let j = (s >> 33) as usize % (i + 1);
        indices.swap(i, j);
    }
    indices[..n].iter().map(|&i| samples[i].clone()).collect()
}

pub fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn gen_id() -> String {
    let ts = unix_now() as u64;
    let nano = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64;
    format!("{:x}{:x}", ts, nano)
}

/// Convert Unix seconds to ISO 8601 string (UTC) without external crates.
pub fn unix_to_iso(ts: i64) -> String {
    let secs = ts as u64;
    let time_of_day = secs % 86400;
    let days = (secs / 86400) as i64;
    let hh = time_of_day / 3600;
    let mm = (time_of_day % 3600) / 60;
    let ss = time_of_day % 60;
    // Civil date algorithm: https://howardhinnant.github.io/date_algorithms.html
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d, hh, mm, ss)
}

// ============================================================
// Gmail token management
// ============================================================

pub async fn get_valid_token(app: &AppHandle) -> Result<String, String> {
    let access_token = store_get(app, "gmail_access_token")
        .ok_or_else(|| "Gmail not connected. Please connect Gmail in Settings.".to_string())?;

    let expiry: i64 = store_get(app, "gmail_token_expiry")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    if unix_now() < expiry - 60 {
        return Ok(access_token);
    }

    let refresh_token = store_get(app, "gmail_refresh_token")
        .ok_or_else(|| "No refresh token. Please reconnect Gmail.".to_string())?;
    let client_id = store_get(app, "google_client_id")
        .ok_or_else(|| "No Google client ID configured.".to_string())?;
    let client_secret = store_get(app, "google_client_secret")
        .ok_or_else(|| "No Google client secret configured.".to_string())?;

    let client = Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(error) = body.get("error") {
        return Err(format!("Token refresh failed: {}", error));
    }

    let new_token = body["access_token"]
        .as_str()
        .ok_or("No access_token in refresh response")?;
    let expires_in = body["expires_in"].as_i64().unwrap_or(3600);
    let new_expiry = unix_now() + expires_in;

    store_set(app, "gmail_access_token", new_token)?;
    store_set(app, "gmail_token_expiry", &new_expiry.to_string())?;

    Ok(new_token.to_string())
}

// ============================================================
// Email parsing helpers
// ============================================================

pub fn get_header(headers: &Value, name: &str) -> String {
    headers
        .as_array()
        .and_then(|arr| {
            arr.iter().find(|h| {
                h["name"]
                    .as_str()
                    .map(|n| n.eq_ignore_ascii_case(name))
                    .unwrap_or(false)
            })
        })
        .and_then(|h| h["value"].as_str())
        .unwrap_or("")
        .to_string()
}

pub fn decode_b64(data: &str) -> String {
    URL_SAFE_NO_PAD
        .decode(data)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or_default()
}

pub fn extract_body(payload: &Value) -> String {
    if let Some(data) = payload["body"]["data"].as_str() {
        if !data.is_empty() {
            return decode_b64(data);
        }
    }
    if let Some(parts) = payload["parts"].as_array() {
        for part in parts {
            if part["mimeType"].as_str() == Some("text/plain") {
                if let Some(data) = part["body"]["data"].as_str() {
                    if !data.is_empty() {
                        return decode_b64(data);
                    }
                }
            }
        }
        for part in parts {
            if part["mimeType"].as_str() == Some("text/html") {
                if let Some(data) = part["body"]["data"].as_str() {
                    if !data.is_empty() {
                        return decode_b64(data);
                    }
                }
            }
        }
        for part in parts {
            let body = extract_body(part);
            if !body.is_empty() {
                return body;
            }
        }
    }
    String::new()
}

// Returns (body_text_or_html, is_html)
pub fn extract_body_typed(payload: &Value) -> (String, bool) {
    // Direct body on payload
    if let Some(data) = payload["body"]["data"].as_str() {
        if !data.is_empty() {
            let mime = payload["mimeType"].as_str().unwrap_or("");
            return (decode_b64(data), mime == "text/html");
        }
    }
    if let Some(parts) = payload["parts"].as_array() {
        // Prefer plain text
        for part in parts {
            if part["mimeType"].as_str() == Some("text/plain") {
                if let Some(data) = part["body"]["data"].as_str() {
                    if !data.is_empty() {
                        return (decode_b64(data), false);
                    }
                }
            }
        }
        // Fall back to HTML
        for part in parts {
            if part["mimeType"].as_str() == Some("text/html") {
                if let Some(data) = part["body"]["data"].as_str() {
                    if !data.is_empty() {
                        return (decode_b64(data), true);
                    }
                }
            }
        }
        // Recurse into nested parts (multipart/alternative etc.)
        for part in parts {
            let (body, is_html) = extract_body_typed(part);
            if !body.is_empty() {
                return (body, is_html);
            }
        }
    }
    (String::new(), false)
}

pub fn parse_thread(raw: &Value) -> Option<EmailThread> {
    let thread_id = raw["id"].as_str()?.to_string();
    let snippet = raw["snippet"].as_str().unwrap_or("").to_string();
    let messages_raw = raw["messages"].as_array()?;

    let mut messages: Vec<EmailMessage> = messages_raw
        .iter()
        .map(|msg| {
            let headers = &msg["payload"]["headers"];
            let (body, is_html) = extract_body_typed(&msg["payload"]);
            EmailMessage {
                id: msg["id"].as_str().unwrap_or("").to_string(),
                from: get_header(headers, "From"),
                to: get_header(headers, "To"),
                subject: get_header(headers, "Subject"),
                date: get_header(headers, "Date"),
                body,
                is_html,
                snippet: msg["snippet"].as_str().unwrap_or("").to_string(),
            }
        })
        .collect();

    messages.sort_by(|a, b| a.date.cmp(&b.date));

    let last_date = messages.last().map(|m| m.date.clone()).unwrap_or_default();
    let subject = messages
        .first()
        .map(|m| m.subject.clone())
        .unwrap_or_default();

    Some(EmailThread {
        id: thread_id,
        subject,
        snippet,
        messages,
        last_date,
    })
}

// ============================================================
// HTML / text helpers
// ============================================================

pub fn strip_html_to_text(html: &str) -> String {
    let mut output = String::with_capacity(html.len() / 2);
    let mut in_tag = false;
    let mut tag_buf = String::new();
    let mut skip_until: Option<String> = None;
    let mut skip_buf = String::new();

    for c in html.chars() {
        // Inside a skip block (script/style content)
        if let Some(ref close_tag) = skip_until.clone() {
            skip_buf.push(c);
            let lower = skip_buf.to_lowercase();
            if lower.ends_with(close_tag) {
                skip_until = None;
                skip_buf.clear();
            } else if skip_buf.len() > close_tag.len() + 200 {
                let keep = skip_buf.len() - close_tag.len() - 10;
                skip_buf = skip_buf[keep..].to_string();
            }
            continue;
        }

        if c == '<' {
            in_tag = true;
            tag_buf.clear();
            continue;
        }

        if in_tag {
            if c == '>' {
                in_tag = false;
                let tag_lower = tag_buf.to_lowercase();
                let tag_name = tag_lower.trim().split_whitespace().next().unwrap_or("");
                if tag_name == "script" || tag_name == "style" {
                    skip_until = Some(format!("</{}>", tag_name));
                } else {
                    output.push(' ');
                }
            } else {
                tag_buf.push(c);
            }
            continue;
        }

        output.push(c);
    }

    // Decode common HTML entities
    let decoded = output
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
        .replace("&mdash;", "\u{2014}")
        .replace("&ndash;", "\u{2013}")
        .replace("&hellip;", "...");

    // Collapse whitespace
    let mut result = String::with_capacity(decoded.len());
    let mut prev_space = true;
    for c in decoded.chars() {
        if c.is_whitespace() {
            if !prev_space {
                result.push(' ');
                prev_space = true;
            }
        } else {
            result.push(c);
            prev_space = false;
        }
    }

    result.trim().to_string()
}

fn extract_json(text: &str) -> String {
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) {
        if start < end {
            return text[start..=end].to_string();
        }
    }
    text.to_string()
}

fn build_openai_body(model: &str, system: &str, user_msg: &str) -> Value {
    json!({
        "model": model,
        "max_tokens": 1024,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg}
        ]
    })
}

fn build_anthropic_body(model: &str, system: &str, user_msg: &str) -> Value {
    json!({
        "model": model,
        "max_tokens": 1024,
        "system": system,
        "messages": [
            {"role": "user", "content": user_msg}
        ]
    })
}

async fn call_ai_api(
    provider: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_message: &str,
) -> Result<String, String> {
    let client = Client::new();

    // OpenCode Go: auto-detect endpoint from model name
    // MiniMax models use Anthropic-compat endpoint; others use OpenAI-compat
    let opencode_is_anthropic = {
        let m = model.to_lowercase();
        m.contains("minimax") || m.starts_with("m2-") || m.starts_with("m2.")
    };

    let (endpoint, body, is_anthropic) = match provider {
        "claude" => (
            "https://api.anthropic.com/v1/messages".to_string(),
            build_anthropic_body(model, system_prompt, user_message),
            true,
        ),
        "openrouter" => (
            "https://openrouter.ai/api/v1/chat/completions".to_string(),
            build_openai_body(model, system_prompt, user_message),
            false,
        ),
        "nvidia" => (
            "https://integrate.api.nvidia.com/v1/chat/completions".to_string(),
            build_openai_body(model, system_prompt, user_message),
            false,
        ),
        "gemini" => (
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".to_string(),
            build_openai_body(model, system_prompt, user_message),
            false,
        ),
        // "opencode" + legacy "opencode_anthropic" → auto-detect by model name
        _ => {
            if opencode_is_anthropic {
                (
                    "https://opencode.ai/zen/go/v1/messages".to_string(),
                    build_anthropic_body(model, system_prompt, user_message),
                    true,
                )
            } else {
                (
                    "https://opencode.ai/zen/go/v1/chat/completions".to_string(),
                    build_openai_body(model, system_prompt, user_message),
                    false,
                )
            }
        }
    };

    let mut req = client.post(&endpoint).json(&body);
    if is_anthropic {
        req = req
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json");
    } else {
        req = req.bearer_auth(api_key);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("AI API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        let preview_len = err_text.len().min(400);
        return Err(format!("AI API error {}: {}", status, &err_text[..preview_len]));
    }

    let response_body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse AI response: {}", e))?;

    let text = if is_anthropic {
        response_body["content"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|item| item["text"].as_str())
            .unwrap_or("")
            .to_string()
    } else {
        response_body["choices"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|c| c["message"]["content"].as_str())
            .unwrap_or("")
            .to_string()
    };

    Ok(text)
}

// ============================================================
// Snov.io helpers
// ============================================================

async fn snov_token(client_id: &str, client_secret: &str) -> Result<String, String> {
    let client = Client::new();
    let params = format!(
        "grant_type=client_credentials&client_id={}&client_secret={}",
        client_id, client_secret
    );
    let resp = client
        .post("https://api.snov.io/v1/oauth/access_token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(params)
        .send()
        .await
        .map_err(|e| format!("Snov.io auth failed: {}", e))?;
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    body["access_token"]
        .as_str()
        .ok_or_else(|| format!("No access_token: {}", body))
        .map(String::from)
}

async fn snov_post(client: &Client, url: &str, token: &str, mut body: Value) -> Result<Value, String> {
    body["access_token"] = json!(token);
    let resp = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Snov.io request failed: {}", e))?;
    if !resp.status().is_success() {
        let s = resp.status();
        let t = resp.text().await.unwrap_or_default();
        return Err(format!("Snov.io {} {}: {}", url, s, &t[..t.len().min(200)]));
    }
    resp.json().await.map_err(|e| e.to_string())
}

async fn snov_get(client: &Client, url: &str, token: &str) -> Result<Value, String> {
    let sep = if url.contains('?') { "&" } else { "?" };
    let full = format!("{}{}access_token={}", url, sep, token);
    let resp = client
        .get(&full)
        .send()
        .await
        .map_err(|e| format!("Snov.io GET failed: {}", e))?;
    if !resp.status().is_success() {
        let s = resp.status();
        let t = resp.text().await.unwrap_or_default();
        return Err(format!("Snov.io GET {} {}: {}", url, s, &t[..t.len().min(200)]));
    }
    resp.json().await.map_err(|e| e.to_string())
}

// Poll a Snov.io async task until status == "completed" (max 30s)
async fn snov_poll(client: &Client, result_url: &str, token: &str) -> Result<Value, String> {
    for _ in 0..10 {
        tokio::time::sleep(tokio::time::Duration::from_millis(2500)).await;
        let r = snov_get(client, result_url, token).await?;
        let status = r["status"].as_str().unwrap_or("");
        if status == "completed" || status == "done" {
            return Ok(r);
        }
    }
    Err("Snov.io task timed out".to_string())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnovProspect {
    pub first_name: String,
    pub last_name: String,
    pub position: String,
    pub linkedin_url: String,
    pub email_start_url: String,
    pub email: Option<String>,
    pub source: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub seniority: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuotaInfo {
    pub left: i64,
    pub used: i64,
    pub label: String,
}

// ============================================================
// Twenty CRM helpers
// ============================================================

fn gql_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

async fn find_or_create_company(
    client: &Client,
    api_key: &str,
    company_name: &str,
    domain: Option<&str>,
) -> Result<String, String> {
    let escaped = gql_escape(company_name);

    // Search for existing company by exact name
    let query = format!(
        r#"query {{ companies(filter: {{ name: {{ eq: "{}" }} }}, first: 1) {{ edges {{ node {{ id }} }} }} }}"#,
        escaped
    );
    let resp = client
        .post("https://hitlist.paulvinueza.dev/graphql")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({ "query": query }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(id) = body["data"]["companies"]["edges"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|e| e["node"]["id"].as_str())
    {
        return Ok(id.to_string());
    }

    // Create company — include domainName if we have it (enables logo in Twenty)
    let domain_field = if let Some(d) = domain.filter(|s| !s.is_empty()) {
        let url = if d.starts_with("http") {
            d.to_string()
        } else {
            format!("https://{}", d)
        };
        format!(r#" domainName: {{ primaryLinkUrl: "{}" }}"#, gql_escape(&url))
    } else {
        String::new()
    };

    let mutation = format!(
        r#"mutation {{ createCompany(data: {{ name: "{}"{} }}) {{ id }} }}"#,
        escaped, domain_field
    );
    let resp = client
        .post("https://hitlist.paulvinueza.dev/graphql")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({ "query": mutation }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if let Some(errors) = body.get("errors") {
        return Err(format!("Failed to create company: {}", errors));
    }
    body["data"]["createCompany"]["id"]
        .as_str()
        .ok_or_else(|| "No company ID returned".to_string())
        .map(String::from)
}

// ============================================================
// Tauri commands — isolated in submodule to avoid Rust 1.82+
// macro namespace conflicts with #[tauri::command] + generate_handler!
// ============================================================

pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn get_config(app: AppHandle) -> Result<AppConfig, String> {
        Ok(AppConfig {
            twenty_api_key: store_get(&app, "twenty_api_key")
                .unwrap_or_else(|| DEFAULT_API_KEY.to_string()),
            google_client_id: store_get(&app, "google_client_id").unwrap_or_default(),
            google_client_secret: store_get(&app, "google_client_secret").unwrap_or_default(),
            gmail_connected: store_get(&app, "gmail_access_token").is_some(),
            apollo_api_key: store_get(&app, "apollo_api_key").unwrap_or_default(),
            hunter_api_key: store_get(&app, "hunter_api_key").unwrap_or_default(),
            prospeo_api_key: store_get(&app, "prospeo_api_key").unwrap_or_default(),
            snov_enabled: store_get(&app, "snov_enabled").map(|v| v == "true").unwrap_or(true),
            hunter_enabled: store_get(&app, "hunter_enabled").map(|v| v == "true").unwrap_or(true),
            prospeo_enabled: store_get(&app, "prospeo_enabled").map(|v| v == "true").unwrap_or(true),
            apollo_enabled: store_get(&app, "apollo_enabled").map(|v| v == "true").unwrap_or(false),
            snov_client_id: store_get(&app, "snov_client_id").unwrap_or_default(),
            snov_client_secret: store_get(&app, "snov_client_secret").unwrap_or_default(),
            n8n_webhook_url: store_get(&app, "n8n_webhook_url").unwrap_or_default(),
            ai_samples_count: store_get(&app, "ai_samples_count")
                .and_then(|s| s.parse().ok())
                .unwrap_or(10),
            follow_up_days: store_get(&app, "follow_up_days")
                .and_then(|s| s.parse().ok())
                .unwrap_or(7),
            follow_up_system_prompt: store_get(&app, "follow_up_system_prompt")
                .unwrap_or_else(|| DEFAULT_FOLLOW_UP_SYSTEM_PROMPT.to_string()),
        })
    }

    #[tauri::command]
    pub async fn save_config(
        app: AppHandle,
        api_key: String,
        client_id: String,
        client_secret: String,
        snov_client_id: String,
        snov_client_secret: String,
        hunter_api_key: String,
        apollo_api_key: String,
        prospeo_api_key: String,
        snov_enabled: bool,
        hunter_enabled: bool,
        prospeo_enabled: bool,
        apollo_enabled: bool,
        n8n_webhook_url: String,
        ai_samples_count: usize,
        follow_up_days: usize,
        follow_up_system_prompt: String,
    ) -> Result<(), String> {
        store_set(&app, "twenty_api_key", &api_key)?;
        store_set(&app, "google_client_id", &client_id)?;
        store_set(&app, "google_client_secret", &client_secret)?;
        if !snov_client_id.is_empty() {
            store_set(&app, "snov_client_id", &snov_client_id)?;
        }
        if !snov_client_secret.is_empty() {
            store_set(&app, "snov_client_secret", &snov_client_secret)?;
        }
        if !hunter_api_key.is_empty() {
            store_set(&app, "hunter_api_key", &hunter_api_key)?;
        }
        if !apollo_api_key.is_empty() {
            store_set(&app, "apollo_api_key", &apollo_api_key)?;
        }
        if !prospeo_api_key.is_empty() {
            store_set(&app, "prospeo_api_key", &prospeo_api_key)?;
        }
        store_set(&app, "snov_enabled", if snov_enabled { "true" } else { "false" })?;
        store_set(&app, "hunter_enabled", if hunter_enabled { "true" } else { "false" })?;
        store_set(&app, "prospeo_enabled", if prospeo_enabled { "true" } else { "false" })?;
        store_set(&app, "apollo_enabled", if apollo_enabled { "true" } else { "false" })?;
        store_set(&app, "n8n_webhook_url", &n8n_webhook_url)?;
        store_set(&app, "ai_samples_count", &ai_samples_count.to_string())?;
        store_set(&app, "follow_up_days", &follow_up_days.to_string())?;
        store_set(&app, "follow_up_system_prompt", &follow_up_system_prompt)?;
        Ok(())
    }

    #[tauri::command]
    pub async fn fetch_contacts(app: AppHandle) -> Result<Vec<Person>, String> {
        let api_key = store_get(&app, "twenty_api_key")
            .unwrap_or_else(|| DEFAULT_API_KEY.to_string());

        let query = r#"
            query {
                people(
                    filter: {
                        or: [
                            { createdBy: { name: { like: "%n8n%" } } }
                            { createdBy: { source: { eq: API } } }
                        ]
                    }
                    first: 200
                    orderBy: [{ contacted: AscNullsFirst }, { name: { firstName: AscNullsFirst } }]
                ) {
                    edges {
                        node {
                            id
                            name { firstName lastName }
                            jobTitle
                            emails { primaryEmail }
                            phones { primaryPhoneNumber }
                            linkedinLink { primaryLinkUrl }
                            jobPosting { primaryLinkUrl primaryLinkLabel }
                            contacted
                            company { name }
                            createdAt
                        }
                    }
                    totalCount
                }
            }
        "#;

        let client = Client::new();
        let resp = client
            .post("https://hitlist.paulvinueza.dev/graphql")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&json!({ "query": query }))
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let body: Value = resp
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        if let Some(errors) = body.get("errors") {
            return Err(format!("GraphQL error: {}", errors));
        }

        let edges = body["data"]["people"]["edges"]
            .as_array()
            .ok_or("Unexpected response structure from Twenty API")?;

        let people: Vec<Person> = edges
            .iter()
            .filter_map(|edge| serde_json::from_value(edge["node"].clone()).ok())
            .collect();

        Ok(people)
    }

    #[tauri::command]
    pub async fn mark_contacted(
        app: AppHandle,
        id: String,
        name: String,
        company: Option<String>,
    ) -> Result<(), String> {
        let api_key = store_get(&app, "twenty_api_key")
            .unwrap_or_else(|| DEFAULT_API_KEY.to_string());

        let mutation = format!(
            r#"mutation {{ updatePerson(id: "{}", data: {{ contacted: true }}) {{ id contacted }} }}"#,
            id
        );

        let client = Client::new();
        let resp = client
            .post("https://hitlist.paulvinueza.dev/graphql")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&json!({ "query": mutation }))
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let body: Value = resp
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        if let Some(errors) = body.get("errors") {
            return Err(format!("GraphQL error: {}", errors));
        }

        // Append to local outreach log
        {
            let entry = OutreachEntry {
                person_id: id.clone(),
                name,
                company,
                ts: unix_now(),
            };
            if let Ok(store) = app.store("config.json") {
                let mut log: Vec<OutreachEntry> = store
                    .get("outreach_log")
                    .and_then(|v| serde_json::from_value(v).ok())
                    .unwrap_or_default();
                log.push(entry);
                store.set(
                    "outreach_log",
                    serde_json::to_value(&log).unwrap_or(json!([])),
                );
                let _ = store.save();
            }
        }

        Ok(())
    }

    #[tauri::command]
    pub async fn get_outreach_log(app: AppHandle) -> Result<Vec<OutreachEntry>, String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let log: Vec<OutreachEntry> = store
            .get("outreach_log")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        Ok(log)
    }

    // Use xdg-open directly — tauri_plugin_opener::open_url on Linux can navigate
    // the current WebView instead of launching the system browser.
    fn spawn_browser(url: &str) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(url)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(url)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("rundll32")
                .args(["url.dll,FileProtocolHandler", url])
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
    }

    #[tauri::command]
    pub fn open_viewer_window(_app: AppHandle, url: String, _title: String) -> Result<(), String> {
        spawn_browser(&url)
    }

    #[tauri::command]
    pub fn open_external_url(_app: AppHandle, url: String) -> Result<(), String> {
        spawn_browser(&url)
    }

    // ── Per-contact context (job posting + LinkedIn text) ────────────────────

    #[tauri::command]
    pub async fn save_contact_context(
        app: AppHandle,
        contact_id: String,
        job: String,
        linkedin: String,
    ) -> Result<(), String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let mut map: serde_json::Map<String, Value> = store
            .get("contact_contexts")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        map.insert(contact_id, json!({ "job": job, "linkedin": linkedin }));
        store.set("contact_contexts", json!(map));
        store.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub async fn get_contact_context(
        app: AppHandle,
        contact_id: String,
    ) -> Result<ContactContext, String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let map: serde_json::Map<String, Value> = store
            .get("contact_contexts")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        Ok(map
            .get(&contact_id)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default())
    }

    // ── Per-contact state (failed / replied) ─────────────────────────────────

    #[tauri::command]
    pub async fn set_contact_state(
        app: AppHandle,
        contact_id: String,
        state: String, // "failed" | "replied" | "" (empty = remove)
    ) -> Result<(), String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let mut map: serde_json::Map<String, Value> = store
            .get("contact_states")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        if state.is_empty() {
            map.remove(&contact_id);
        } else {
            map.insert(contact_id, json!(state));
        }
        store.set("contact_states", json!(map));
        store.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub async fn get_contact_states(app: AppHandle) -> Result<Value, String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        Ok(store
            .get("contact_states")
            .unwrap_or_else(|| json!({})))
    }

    // ── Per-contact notes ─────────────────────────────────────────────────────

    #[tauri::command]
    pub async fn save_contact_note(
        app: AppHandle,
        contact_id: String,
        note: String,
    ) -> Result<(), String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let mut map: serde_json::Map<String, Value> = store
            .get("contact_notes")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        if note.is_empty() {
            map.remove(&contact_id);
        } else {
            map.insert(contact_id, json!(note));
        }
        store.set("contact_notes", json!(map));
        store.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub async fn get_contact_note(
        app: AppHandle,
        contact_id: String,
    ) -> Result<String, String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let map: serde_json::Map<String, Value> = store
            .get("contact_notes")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        Ok(map
            .get(&contact_id)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string())
    }

    #[tauri::command]
    pub async fn add_writing_sample(app: AppHandle, text: String) -> Result<(), String> {
        let trimmed = text.trim().to_string();
        if trimmed.len() < 30 {
            return Ok(()); // too short, skip silently
        }
        let mut samples = load_writing_samples(&app);
        // Avoid exact duplicates
        if !samples.iter().any(|s| s == &trimmed) {
            samples.push(trimmed);
        }
        save_writing_samples_list(&app, &samples)
    }

    #[tauri::command]
    pub async fn get_writing_sample_count(app: AppHandle) -> Result<usize, String> {
        Ok(load_writing_samples(&app).len())
    }

    #[tauri::command]
    pub async fn get_writing_samples(app: AppHandle) -> Result<Vec<String>, String> {
        Ok(load_writing_samples(&app))
    }

    #[tauri::command]
    pub async fn delete_writing_sample(app: AppHandle, index: usize) -> Result<(), String> {
        let mut samples = load_writing_samples(&app);
        if index < samples.len() {
            samples.remove(index);
            save_writing_samples_list(&app, &samples)?;
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn save_resume_text(app: AppHandle, text: String) -> Result<(), String> {
        store_set(&app, "resume_text", &text)
    }

    #[tauri::command]
    pub async fn get_resume_text(app: AppHandle) -> Result<String, String> {
        Ok(store_get(&app, "resume_text").unwrap_or_default())
    }

    #[tauri::command]
    pub async fn parse_resume(app: AppHandle, text: String) -> Result<String, String> {
        let provider = store_get(&app, "ai_provider").unwrap_or_else(|| "claude".to_string());
        let api_key = store_get(&app, "ai_api_key")
            .ok_or_else(|| "No AI API key configured. Add it in Settings → AI.".to_string())?;
        if api_key.is_empty() {
            return Err("No AI API key configured. Add it in Settings → AI.".to_string());
        }
        let model = store_get(&app, "ai_model")
            .unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string());
        let system = "You are a resume parser. Extract key information accurately and return valid JSON only.";
        let truncated: String = text.chars().take(8000).collect();
        let prompt = format!(
            "Parse this resume and return a JSON object with these exact fields:\n{{\"name\": \"full name\", \"title\": \"current/most recent job title\", \"summary\": \"2-3 sentence professional summary\", \"skills\": [\"skill1\", \"skill2\"], \"experience\": [\"Most Recent Title at Company (Year)\", \"Previous Title at Company\"], \"education\": \"Degree, School\"}}\n\nResume:\n{}\n\nReturn ONLY valid JSON, no markdown, no explanation.",
            truncated
        );
        call_ai_api(&provider, &api_key, &model, system, &prompt).await
    }

    #[tauri::command]
    pub async fn update_person_fields(
        app: AppHandle,
        id: String,
        email: Option<String>,
        linkedin_url: Option<String>,
        job_posting_url: Option<String>,
        job_posting_label: Option<String>,
        first_name: Option<String>,
        last_name: Option<String>,
    ) -> Result<(), String> {
        let api_key = store_get(&app, "twenty_api_key")
            .unwrap_or_else(|| DEFAULT_API_KEY.to_string());

        let mut data_parts: Vec<String> = Vec::new();

        if first_name.is_some() || last_name.is_some() {
            let fn_val = first_name.as_deref().unwrap_or("").replace('"', "\\\"");
            let ln_val = last_name.as_deref().unwrap_or("").replace('"', "\\\"");
            data_parts.push(format!(
                r#"name: {{ firstName: "{}", lastName: "{}" }}"#,
                fn_val, ln_val
            ));
        }
        if let Some(ref e) = email {
            if !e.is_empty() {
                let escaped = e.replace('"', "\\\"");
                data_parts.push(format!(r#"emails: {{ primaryEmail: "{}" }}"#, escaped));
            }
        }
        if let Some(ref url) = linkedin_url {
            let escaped = url.replace('"', "\\\"");
            data_parts.push(format!(r#"linkedinLink: {{ primaryLinkUrl: "{}" }}"#, escaped));
        }
        if let Some(ref url) = job_posting_url {
            let label = job_posting_label.as_deref().unwrap_or("Job Posting");
            let escaped_url = url.replace('"', "\\\"");
            let escaped_label = label.replace('"', "\\\"");
            data_parts.push(format!(
                r#"jobPosting: {{ primaryLinkUrl: "{}", primaryLinkLabel: "{}" }}"#,
                escaped_url, escaped_label
            ));
        }

        if data_parts.is_empty() {
            return Ok(());
        }

        let data_str = data_parts.join(", ");
        let mutation = format!(
            r#"mutation {{ updatePerson(id: "{}", data: {{ {} }}) {{ id }} }}"#,
            id, data_str
        );

        let client = Client::new();
        let resp = client
            .post("https://hitlist.paulvinueza.dev/graphql")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&json!({ "query": mutation }))
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(errors) = body["errors"].as_array() {
            if !errors.is_empty() {
                return Err(format!(
                    "GraphQL error: {}",
                    errors[0]["message"].as_str().unwrap_or("Unknown error")
                ));
            }
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn get_contact_api_quota(app: AppHandle, api: String) -> Result<QuotaInfo, String> {
        let client = Client::new();
        match api.as_str() {
            "snov" => {
                let client_id = store_get(&app, "snov_client_id").ok_or("No Snov.io credentials configured")?;
                let client_secret = store_get(&app, "snov_client_secret").ok_or("No Snov.io credentials configured")?;
                let token = snov_token(&client_id, &client_secret).await?;
                let r = snov_get(&client, "https://api.snov.io/v1/get-balance", &token).await?;
                let balance = r["balance"].as_i64().unwrap_or(0);
                Ok(QuotaInfo { left: balance, used: 0, label: "email credits".to_string() })
            }
            "hunter" => {
                let key = store_get(&app, "hunter_api_key").ok_or("No Hunter.io API key configured")?;
                let resp = client.get("https://api.hunter.io/v2/account")
                    .query(&[("api_key", key.as_str())])
                    .send().await.map_err(|e| e.to_string())?;
                let body: Value = resp.json().await.map_err(|e| e.to_string())?;
                if let Some(errs) = body["errors"].as_array() {
                    if !errs.is_empty() {
                        return Err(format!("Hunter.io: {}", errs[0]["details"].as_str().unwrap_or("auth failed")));
                    }
                }
                let searches = &body["data"]["requests"]["searches"];
                let left = searches["left"].as_i64().unwrap_or(0);
                let used = searches["used"].as_i64().unwrap_or(0);
                Ok(QuotaInfo { left, used, label: "searches".to_string() })
            }
            "apollo" => {
                let key = store_get(&app, "apollo_api_key").ok_or("No Apollo.io API key configured")?;
                let resp = client.get("https://api.apollo.io/api/v1/auth/health")
                    .header("X-Api-Key", &key)
                    .header("Content-Type", "application/json")
                    .send().await.map_err(|e| e.to_string())?;
                if resp.status().is_success() {
                    Ok(QuotaInfo { left: -1, used: 0, label: "exports".to_string() })
                } else {
                    Err(format!("Apollo.io auth failed: {}", resp.status()))
                }
            }
            "prospeo" => {
                let key = store_get(&app, "prospeo_api_key").ok_or("No Prospeo API key configured")?;
                let resp = client.get("https://api.prospeo.io/user-information")
                    .header("Authorization", format!("Bearer {}", &key))
                    .send().await.map_err(|e| e.to_string())?;
                let body: Value = resp.json().await.map_err(|e| e.to_string())?;
                if body["error"].as_bool().unwrap_or(false) {
                    return Err(format!("Prospeo: {}", body["message"].as_str().unwrap_or("auth failed")));
                }
                let left = body["response"]["credit_left"].as_i64().unwrap_or(0);
                let used = body["response"]["credit_used"].as_i64().unwrap_or(0);
                Ok(QuotaInfo { left, used, label: "credits".to_string() })
            }
            _ => Err(format!("Unknown API: {}", api))
        }
    }

    #[tauri::command]
    pub async fn hunter_search_prospects(app: AppHandle, domain: String, location: Option<String>) -> Result<Vec<SnovProspect>, String> {
        let key = store_get(&app, "hunter_api_key").ok_or("No Hunter.io API key configured")?;
        let client = Client::new();

        let resp = client.get("https://api.hunter.io/v2/domain-search")
            .query(&[
                ("domain", domain.as_str()),
                ("api_key", key.as_str()),
                ("limit", "20"),
                ("type", "personal"),
            ])
            .send().await.map_err(|e| format!("Hunter.io request failed: {}", e))?;

        if !resp.status().is_success() {
            let s = resp.status();
            let t = resp.text().await.unwrap_or_default();
            return Err(format!("Hunter.io {}: {}", s, &t[..t.len().min(200)]));
        }

        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(errs) = body["errors"].as_array() {
            if !errs.is_empty() {
                return Err(format!("Hunter.io: {}", errs[0]["details"].as_str().unwrap_or("unknown error")));
            }
        }

        fn title_score(pos: &str) -> u8 {
            let p = pos.to_lowercase();
            if p.contains("technical recruiter") || p.contains("tech recruiter") { return 0; }
            if p.contains("talent acquisition") || p.contains("technical sourcer") { return 1; }
            if p.contains("talent") { return 2; }
            if p.contains("recruiting") || p.contains("recruiter") { return 3; }
            if p.contains("hr") || p.contains("people ops") { return 4; }
            5
        }

        let recruiter_depts = ["hr", "recruiting", "people", "talent"];

        let mut prospects: Vec<SnovProspect> = body["data"]["emails"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|e| {
                let first = e["first_name"].as_str().unwrap_or("").to_string();
                let last = e["last_name"].as_str().unwrap_or("").to_string();
                let email = e["value"].as_str().unwrap_or("").to_string();
                let position = e["position"].as_str().unwrap_or("").to_string();
                let dept = e["department"].as_str().unwrap_or("").to_lowercase();
                let linkedin = e["linkedin"].as_str().unwrap_or("").to_string();
                if first.is_empty() && last.is_empty() { return None; }
                if email.is_empty() { return None; }
                let is_recruiter = recruiter_depts.iter().any(|d| dept.contains(d))
                    || title_score(&position) < 5;
                if !is_recruiter { return None; }
                Some(SnovProspect {
                    first_name: first,
                    last_name: last,
                    position,
                    linkedin_url: linkedin,
                    email_start_url: String::new(),
                    email: Some(email),
                    source: Some("hunter".to_string()),
                    city: None,
                    country: None,
                    seniority: None,
                })
            })
            .collect();

        // Client-side location filter for Hunter (API doesn't support it)
        if let Some(loc) = &location {
            let loc_lower = loc.to_lowercase();
            if !loc_lower.is_empty() {
                prospects.retain(|p| {
                    let city = p.city.as_deref().unwrap_or("").to_lowercase();
                    let country = p.country.as_deref().unwrap_or("").to_lowercase();
                    city.contains(&loc_lower) || country.contains(&loc_lower)
                });
            }
        }

        prospects.sort_by_key(|p| title_score(&p.position));
        Ok(prospects)
    }

    #[tauri::command]
    pub async fn apollo_search_prospects(app: AppHandle, domain: String, location: Option<String>) -> Result<Vec<SnovProspect>, String> {
        let key = store_get(&app, "apollo_api_key").ok_or("No Apollo.io API key configured")?;
        let client = Client::new();

        let mut body = json!({
            "api_key": &key,
            "person_titles": [
                "recruiter", "technical recruiter", "talent acquisition",
                "talent acquisition specialist", "talent acquisition manager",
                "technical sourcer", "senior recruiter", "hr manager", "people operations"
            ],
            "page": 1,
            "per_page": 25
        });
        if !domain.is_empty() {
            body["organization_domains"] = json!([&domain]);
        }
        if let Some(loc) = &location {
            if !loc.is_empty() {
                body["person_locations"] = json!([loc]);
            }
        }

        let resp = client.post("https://api.apollo.io/v1/people/search")
            .header("X-Api-Key", &key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send().await.map_err(|e| format!("Apollo.io request failed: {}", e))?;

        if !resp.status().is_success() {
            let s = resp.status();
            let t = resp.text().await.unwrap_or_default();
            if s.as_u16() == 403 {
                return Err(format!("Apollo.io: The people/search API requires a paid plan. Free plans are limited. Please upgrade at https://app.apollo.io/ or use another API."));
            }
            return Err(format!("Apollo.io {}: {}", s, &t[..t.len().min(200)]));
        }

        let body: Value = resp.json().await.map_err(|e| e.to_string())?;

        fn title_score(pos: &str) -> u8 {
            let p = pos.to_lowercase();
            if p.contains("technical recruiter") || p.contains("tech recruiter") { return 0; }
            if p.contains("talent acquisition") || p.contains("technical sourcer") { return 1; }
            if p.contains("talent") { return 2; }
            if p.contains("recruiting") || p.contains("recruiter") { return 3; }
            4
        }

        let mut prospects: Vec<SnovProspect> = body["people"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|p| {
                let first = p["first_name"].as_str().unwrap_or("").to_string();
                let last = p["last_name"].as_str().unwrap_or("").to_string();
                let title = p["title"].as_str().unwrap_or("").to_string();
                let linkedin = p["linkedin_url"].as_str().unwrap_or("").to_string();
                let email = p["email"].as_str().filter(|s| !s.is_empty()).map(String::from);
                if first.is_empty() && last.is_empty() { return None; }
                Some(SnovProspect {
                    first_name: first,
                    last_name: last,
                    position: title,
                    linkedin_url: linkedin,
                    email_start_url: String::new(),
                    email,
                    source: Some("apollo".to_string()),
                    city: p["city"].as_str().filter(|s| !s.is_empty()).map(String::from),
                    country: p["country"].as_str().filter(|s| !s.is_empty()).map(String::from),
                    seniority: p["seniority"].as_str().filter(|s| !s.is_empty()).map(String::from),
                })
            })
            .collect();

        prospects.sort_by_key(|p| title_score(&p.position));
        Ok(prospects)
    }

    #[tauri::command]
    pub async fn prospeo_search_prospects(app: AppHandle, domain: String, location: Option<String>) -> Result<Vec<SnovProspect>, String> {
        let key = store_get(&app, "prospeo_api_key").ok_or("No Prospeo API key configured")?;
        let client = Client::new();

        let resp = client.post("https://api.prospeo.io/search-person")
            .header("Authorization", format!("Bearer {}", &key))
            .header("Content-Type", "application/json")
            .json(&json!({
                "filters": {
                    "company.websites": { "include": [&domain] }
                },
                "limit": 25
            }))
            .send().await.map_err(|e| format!("Prospeo request failed: {}", e))?;

        if !resp.status().is_success() {
            let s = resp.status();
            let t = resp.text().await.unwrap_or_default();
            if let Ok(body) = serde_json::from_str::<Value>(&t) {
                if body["error"].as_bool().unwrap_or(false) {
                    let error_code = body["error_code"].as_str().unwrap_or("");
                    let message = body["message"].as_str().unwrap_or("");
                    if error_code == "INVALID_API_KEY" {
                        return Err(format!("Prospeo: Invalid API key. Please check your API key in Settings → Contact APIs and ensure it's not expired."));
                    }
                    return Err(format!("Prospeo: {} (code: {})", message, error_code));
                }
            }
            return Err(format!("Prospeo {}: {}", s.as_u16(), &t[..t.len().min(300)]));
        }

        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        if !body["req_status"].as_bool().unwrap_or(true) {
            return Err(format!("Prospeo: {}", body["error_toast"].as_str().unwrap_or("unknown error")));
        }
        if body["error"].as_bool().unwrap_or(false) {
            return Err(format!("Prospeo: {}", body["message"].as_str().unwrap_or("API error")));
        }

        fn title_score(pos: &str) -> u8 {
            let p = pos.to_lowercase();
            if p.contains("technical recruiter") || p.contains("tech recruiter") { return 0; }
            if p.contains("talent acquisition") || p.contains("technical sourcer") { return 1; }
            if p.contains("talent") { return 2; }
            if p.contains("recruiting") || p.contains("recruiter") { return 3; }
            4
        }

        let recruiter_keywords = ["recruit", "talent", "hr", "people", "hiring", "sourcer"];

        let mut prospects: Vec<SnovProspect> = body["response"]["results"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|p| {
                let id = p["id"].as_str().unwrap_or("").to_string();
                let first = p["first_name"].as_str().unwrap_or("").to_string();
                let last = p["last_name"].as_str().unwrap_or("").to_string();
                let title = p["title"].as_str()
                    .or_else(|| p["job_title"].as_str())
                    .unwrap_or("").to_string();
                let linkedin = p["linkedin_url"].as_str().unwrap_or("").to_string();
                if (first.is_empty() && last.is_empty()) || id.is_empty() { return None; }
                let t_lower = title.to_lowercase();
                if !recruiter_keywords.iter().any(|k| t_lower.contains(k)) { return None; }
                Some(SnovProspect {
                    first_name: first,
                    last_name: last,
                    position: title,
                    linkedin_url: linkedin,
                    email_start_url: id, // person_id stored here for enrich call
                    email: None,
                    source: Some("prospeo".to_string()),
                    city: p["location"].as_str().filter(|s| !s.is_empty()).map(String::from),
                    country: p["country"].as_str().filter(|s| !s.is_empty()).map(String::from),
                    seniority: p["seniority"].as_str().filter(|s| !s.is_empty()).map(String::from),
                })
            })
            .collect();

        // Client-side location filter for Prospeo
        if let Some(loc) = &location {
            let loc_lower = loc.to_lowercase();
            if !loc_lower.is_empty() {
                prospects.retain(|p| {
                    let city = p.city.as_deref().unwrap_or("").to_lowercase();
                    let country = p.country.as_deref().unwrap_or("").to_lowercase();
                    city.contains(&loc_lower) || country.contains(&loc_lower)
                });
            }
        }

        prospects.sort_by_key(|p| title_score(&p.position));
        Ok(prospects)
    }

    #[tauri::command]
    pub async fn prospeo_fetch_email(app: AppHandle, person_id: String) -> Result<String, String> {
        let key = store_get(&app, "prospeo_api_key").ok_or("No Prospeo API key configured")?;
        let client = Client::new();

        let resp = client.post("https://api.prospeo.io/enrich-person")
            .header("Authorization", format!("Bearer {}", &key))
            .header("Content-Type", "application/json")
            .json(&json!({ "data": { "person_id": &person_id } }))
            .send().await.map_err(|e| format!("Prospeo enrich request failed: {}", e))?;

        if !resp.status().is_success() {
            let s = resp.status();
            let t = resp.text().await.unwrap_or_default();
            if let Ok(body) = serde_json::from_str::<Value>(&t) {
                if body["error"].as_bool().unwrap_or(false) {
                    let error_code = body["error_code"].as_str().unwrap_or("");
                    if error_code == "INVALID_API_KEY" {
                        return Err(format!("Prospeo: Invalid API key. Please check your API key in Settings → Contact APIs."));
                    }
                }
            }
            return Err(format!("Prospeo enrich {}: {}", s.as_u16(), &t[..t.len().min(300)]));
        }

        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        if !body["req_status"].as_bool().unwrap_or(true) {
            return Err(format!("Prospeo: {}", body["error_toast"].as_str().unwrap_or("unknown error")));
        }

        body["response"]["email"].as_str()
            .filter(|s| !s.is_empty())
            .map(String::from)
            .ok_or_else(|| "No email returned by Prospeo".to_string())
    }

    #[tauri::command]
    pub async fn delete_person(app: AppHandle, id: String) -> Result<(), String> {
        let api_key = store_get(&app, "twenty_api_key")
            .unwrap_or_else(|| DEFAULT_API_KEY.to_string());
        let mutation = format!(
            r#"mutation {{ deletePerson(id: "{}") {{ id }} }}"#,
            id
        );
        let client = Client::new();
        let resp = client
            .post("https://hitlist.paulvinueza.dev/graphql")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&json!({ "query": mutation }))
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;
        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(errors) = body["errors"].as_array() {
            if !errors.is_empty() {
                return Err(format!(
                    "GraphQL error: {}",
                    errors[0]["message"].as_str().unwrap_or("Unknown error")
                ));
            }
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn start_gmail_auth(app: AppHandle) -> Result<(), String> {
        let client_id = store_get(&app, "google_client_id")
            .ok_or_else(|| "No Google Client ID. Configure in Settings.".to_string())?;

        if store_get(&app, "google_client_secret").is_none() {
            return Err("No Google Client Secret. Configure in Settings.".to_string());
        }

        let redirect_uri = "http://localhost:3141/oauth";
        let scope = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly";

        let auth_url = url::Url::parse_with_params(
            "https://accounts.google.com/o/oauth2/v2/auth",
            &[
                ("client_id", client_id.as_str()),
                ("redirect_uri", redirect_uri),
                ("scope", scope),
                ("response_type", "code"),
                ("access_type", "offline"),
                ("prompt", "consent"),
            ],
        )
        .map_err(|e| e.to_string())?
        .to_string();

        app.opener()
            .open_url(&auth_url, None::<&str>)
            .map_err(|e| format!("Failed to open browser: {}", e))?;

        let app_clone = app.clone();
        tokio::spawn(async move {
            match await_oauth_callback(&app_clone).await {
                Ok(()) => {
                    let _ = app_clone.emit("gmail-auth-success", true);
                }
                Err(e) => {
                    let _ = app_clone.emit("gmail-auth-error", e);
                }
            }
        });

        Ok(())
    }

    #[tauri::command]
    pub async fn send_email(
        app: AppHandle,
        to: String,
        subject: String,
        body: String,
        thread_id: Option<String>,
        reply_to_message_id: Option<String>,
        contact_id: Option<String>,
        contact_name: Option<String>,
        contact_company: Option<String>,
    ) -> Result<(), String> {
        let access_token = get_valid_token(&app).await?;

        let mut headers_str = format!(
            "To: {}\r\nSubject: {}\r\nContent-Type: text/plain; charset=UTF-8",
            to, subject
        );

        if let Some(ref msg_id) = reply_to_message_id {
            headers_str.push_str(&format!("\r\nIn-Reply-To: {}", msg_id));
            headers_str.push_str(&format!("\r\nReferences: {}", msg_id));
        }

        let mime_message = format!("{}\r\n\r\n{}", headers_str, body);
        let raw = URL_SAFE_NO_PAD.encode(mime_message.as_bytes());

        let mut request_body = json!({ "raw": raw });
        if let Some(tid) = thread_id {
            request_body["threadId"] = json!(tid);
        }

        let client = Client::new();
        let resp = client
            .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
            .bearer_auth(&access_token)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Send request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body: Value = resp.json().await.unwrap_or_default();
            return Err(format!(
                "Gmail API error {}: {}",
                status,
                err_body["error"]["message"]
                    .as_str()
                    .unwrap_or("unknown error")
            ));
        }

        // Auto-mark as contacted in Twenty CRM + outreach log
        if let Some(id) = contact_id {
            if !id.is_empty() {
                let api_key = store_get(&app, "twenty_api_key")
                    .unwrap_or_else(|| DEFAULT_API_KEY.to_string());
                let mutation = format!(
                    r#"mutation {{ updatePerson(id: "{}", data: {{ contacted: true }}) {{ id contacted }} }}"#,
                    id
                );
                let gql_client = Client::new();
                let _ = gql_client
                    .post("https://hitlist.paulvinueza.dev/graphql")
                    .header("Authorization", format!("Bearer {}", api_key))
                    .json(&json!({ "query": mutation }))
                    .send()
                    .await;

                // Append to local outreach log
                let name = contact_name.unwrap_or_default();
                let company = contact_company;
                let entry = OutreachEntry { person_id: id, name, company, ts: unix_now() };
                if let Ok(store) = app.store("config.json") {
                    let mut log: Vec<OutreachEntry> = store
                        .get("outreach_log")
                        .and_then(|v| serde_json::from_value(v).ok())
                        .unwrap_or_default();
                    log.push(entry);
                    store.set("outreach_log", serde_json::to_value(&log).unwrap_or(json!([])));
                    let _ = store.save();
                }
            }
        }

        Ok(())
    }

    #[tauri::command]
    pub async fn get_email_threads(
        app: AppHandle,
        email: String,
    ) -> Result<Vec<EmailThread>, String> {
        let access_token = get_valid_token(&app).await?;
        let client = Client::new();

        let query = format!("from:{} OR to:{}", email, email);

        let search_resp = client
            .get("https://gmail.googleapis.com/gmail/v1/users/me/threads")
            .bearer_auth(&access_token)
            .query(&[("q", query.as_str()), ("maxResults", "10")])
            .send()
            .await
            .map_err(|e| format!("Thread search failed: {}", e))?;

        let search_body: Value = search_resp
            .json()
            .await
            .map_err(|e| format!("Thread search parse error: {}", e))?;

        let thread_ids: Vec<String> = search_body["threads"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|t| t["id"].as_str().map(String::from))
            .collect();

        if thread_ids.is_empty() {
            return Ok(vec![]);
        }

        let mut threads = Vec::new();
        for tid in thread_ids.iter().take(8) {
            let thread_resp = client
                .get(format!(
                    "https://gmail.googleapis.com/gmail/v1/users/me/threads/{}",
                    tid
                ))
                .bearer_auth(&access_token)
                .query(&[("format", "full")])
                .send()
                .await
                .map_err(|e| format!("Thread fetch failed: {}", e))?;

            let thread_body: Value = thread_resp
                .json()
                .await
                .map_err(|e| format!("Thread parse error: {}", e))?;

            if let Some(thread) = parse_thread(&thread_body) {
                threads.push(thread);
            }
        }

        threads.sort_by(|a, b| b.last_date.cmp(&a.last_date));

        Ok(threads)
    }

    #[tauri::command]
    pub async fn disconnect_gmail(app: AppHandle) -> Result<(), String> {
        store_delete(&app, "gmail_access_token")?;
        store_delete(&app, "gmail_refresh_token")?;
        store_delete(&app, "gmail_token_expiry")?;
        Ok(())
    }

    // ---- AI commands ----

    #[tauri::command]
    pub async fn test_ai_config(app: AppHandle) -> Result<String, String> {
        let provider = store_get(&app, "ai_provider")
            .unwrap_or_else(|| "claude".to_string());
        let api_key = store_get(&app, "ai_api_key")
            .ok_or_else(|| "No AI API key configured.".to_string())?;
        if api_key.is_empty() {
            return Err("No AI API key configured.".to_string());
        }
        let model = store_get(&app, "ai_model")
            .unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string());

        let text = call_ai_api(
            &provider,
            &api_key,
            &model,
            "You are a connection tester. Be very concise.",
            "Respond with exactly one word: ok",
        )
        .await?;

        if text.trim().is_empty() {
            Err("Empty response from AI API — check your API key and model.".to_string())
        } else {
            let preview: String = text.trim().chars().take(60).collect();
            Ok(format!("Connected ✓ — \"{}\"", preview))
        }
    }

    #[tauri::command]
    pub async fn get_ai_config(app: AppHandle) -> Result<AiConfig, String> {
        Ok(AiConfig {
            provider: store_get(&app, "ai_provider")
                .unwrap_or_else(|| "claude".to_string()),
            api_key: store_get(&app, "ai_api_key").unwrap_or_default(),
            model: store_get(&app, "ai_model")
                .unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string()),
            system_prompt: store_get(&app, "ai_system_prompt")
                .unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string()),
        })
    }

    #[tauri::command]
    pub async fn save_ai_config(
        app: AppHandle,
        provider: String,
        api_key: String,
        model: String,
        system_prompt: String,
    ) -> Result<(), String> {
        store_set(&app, "ai_provider", &provider)?;
        store_set(&app, "ai_api_key", &api_key)?;
        store_set(&app, "ai_model", &model)?;
        store_set(&app, "ai_system_prompt", &system_prompt)?;
        Ok(())
    }

    #[tauri::command]
    pub async fn scrape_url(url: String) -> Result<String, String> {
        let client = Client::builder()
            .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(std::time::Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Fetch failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }

        let html = resp.text().await.map_err(|e| e.to_string())?;
        let text = strip_html_to_text(&html);

        // Limit output
        if text.chars().count() > 8000 {
            Ok(text.chars().take(8000).collect::<String>() + "…")
        } else {
            Ok(text)
        }
    }

    #[tauri::command]
    pub async fn generate_email(
        app: AppHandle,
        contact_name: String,
        contact_email: String,
        job_title: Option<String>,
        company: Option<String>,
        job_posting_text: Option<String>,
        linkedin_text: Option<String>,
        user_note: Option<String>,
    ) -> Result<GeneratedEmail, String> {
        let provider = store_get(&app, "ai_provider")
            .unwrap_or_else(|| "claude".to_string());
        let api_key = store_get(&app, "ai_api_key")
            .ok_or_else(|| "No AI API key configured. Add it in Settings → AI.".to_string())?;
        if api_key.is_empty() {
            return Err("No AI API key configured. Add it in Settings → AI.".to_string());
        }
        let model = store_get(&app, "ai_model")
            .unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string());
        let system_prompt = store_get(&app, "ai_system_prompt")
            .unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string());

        // Include resume in system prompt if available
        let resume_text = store_get(&app, "resume_text").unwrap_or_default();
        let full_system_prompt = if !resume_text.is_empty() {
            let truncated_resume: String = resume_text.chars().take(3000).collect();
            format!("{}\n\nMy Resume / Background:\n{}", system_prompt, truncated_resume)
        } else {
            system_prompt
        };

        // Load writing samples from local file
        let all_samples = load_writing_samples(&app);
        let samples_limit: usize = store_get(&app, "ai_samples_count")
            .and_then(|s| s.parse().ok())
            .unwrap_or(10);
        let selected = pick_random_samples(&all_samples, samples_limit);
        let samples: Option<String> = if selected.is_empty() {
            None
        } else {
            Some(selected.join("\n---\n"))
        };

        // Build user prompt — writing samples FIRST to establish voice and tone
        let mut prompt = String::new();

        let samples_used = if let Some(ref s) = samples {
            if !s.is_empty() {
                let count = s.split("\n---\n").filter(|p| !p.trim().is_empty()).count();
                prompt.push_str(&format!(
                    "WRITING SAMPLES — These are my actual sent emails. Match this voice, tone, and style EXACTLY:\n\n{}\n\n---\n\n",
                    s
                ));
                count
            } else { 0 }
        } else { 0 };

        prompt.push_str(&format!(
            "Now write a cold outreach email to:\nName: {}\nEmail: {}\n",
            contact_name, contact_email
        ));

        if let Some(ref title) = job_title {
            if !title.is_empty() {
                prompt.push_str(&format!("Their Title: {}\n", title));
            }
        }
        if let Some(ref co) = company {
            if !co.is_empty() {
                prompt.push_str(&format!("Company: {}\n", co));
            }
        }

        if let Some(ref posting) = job_posting_text {
            if !posting.is_empty() {
                let truncated: String = posting.chars().take(1500).collect();
                prompt.push_str(&format!("\nJob Posting:\n{}\n", truncated));
            }
        }

        if let Some(ref linkedin) = linkedin_text {
            if !linkedin.is_empty() {
                let truncated: String = linkedin.chars().take(1000).collect();
                prompt.push_str(&format!("\nRecruiter LinkedIn Profile:\n{}\n", truncated));
            }
        }

        if let Some(ref note) = user_note {
            if !note.is_empty() {
                prompt.push_str(&format!("\nSpecific instructions: {}\n", note));
            }
        }

        prompt.push_str(
            "\nReturn ONLY valid JSON with this exact structure (no markdown, no explanation):\n{\"subject\": \"...\", \"body\": \"...\"}",
        );

        let response_text =
            call_ai_api(&provider, &api_key, &model, &full_system_prompt, &prompt).await?;

        let json_str = extract_json(&response_text);
        let parsed: Value = serde_json::from_str(&json_str).map_err(|e| {
            let preview = &response_text[..response_text.len().min(200)];
            format!("Failed to parse AI response as JSON: {} — Raw: {}", e, preview)
        })?;

        Ok(GeneratedEmail {
            subject: parsed["subject"].as_str().unwrap_or("").to_string(),
            body: parsed["body"].as_str().unwrap_or("").to_string(),
            samples_used,
        })
    }

    // ── Snov.io prospect search ───────────────────────────────────────────────

    /// Step 1: given a company domain OR name, return list of recruiter-type prospects.
    /// Title priority sort: Technical Recruiter > Talent Acquisition > Talent > HR
    #[tauri::command]
    pub async fn snov_search_prospects(
        app: AppHandle,
        domain: String,  // e.g. "stripe.com"
        location: Option<String>,
    ) -> Result<Vec<SnovProspect>, String> {
        let client_id = store_get(&app, "snov_client_id")
            .ok_or("No Snov.io Client ID. Add it in Settings.")?;
        let client_secret = store_get(&app, "snov_client_secret")
            .ok_or("No Snov.io Client Secret. Add it in Settings.")?;
        let token = snov_token(&client_id, &client_secret).await?;
        let client = Client::new();

        let r = snov_post(&client, "https://api.snov.io/v2/domain-search/prospects/start", &token, json!({
            "domain": domain,
            "positions": [
                "technical recruiter",
                "tech recruiter",
                "senior technical recruiter",
                "talent acquisition",
                "talent acquisition specialist",
                "talent acquisition manager",
                "technical sourcer",
                "recruiter",
                "hr manager",
                "people operations",
            ],
            "limit": 25,
            "lastId": 0
        })).await?;

        let result_url = r["links"]["result"]
            .as_str()
            .ok_or("No result URL from Snov.io")?
            .to_string();

        let result = snov_poll(&client, &result_url, &token).await?;

        // Title priority scoring for sorting
        fn title_score(pos: &str) -> u8 {
            let p = pos.to_lowercase();
            if p.contains("technical recruiter") || p.contains("tech recruiter") { return 0; }
            if p.contains("talent acquisition") || p.contains("technical sourcer") { return 1; }
            if p.contains("talent") { return 2; }
            if p.contains("recruiting") || p.contains("recruiter") { return 3; }
            4 // hr / people ops
        }

        let mut prospects: Vec<SnovProspect> = result["data"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|p| {
                let first = p["first_name"].as_str().unwrap_or("").to_string();
                let last = p["last_name"].as_str().unwrap_or("").to_string();
                let position = p["position"].as_str().unwrap_or("").to_string();
                let linkedin = p["source_page"].as_str().unwrap_or("").to_string();
                let email_start = p["search_emails_start"].as_str().unwrap_or("").to_string();
                let city = p["city"].as_str().filter(|s| !s.is_empty()).map(String::from);
                let country = p["country"].as_str().filter(|s| !s.is_empty()).map(String::from);
                let seniority = p["seniority"].as_str().filter(|s| !s.is_empty()).map(String::from);
                if first.is_empty() && last.is_empty() { return None; }
                Some(SnovProspect { first_name: first, last_name: last, position, linkedin_url: linkedin, email_start_url: email_start, email: None, source: Some("snov".to_string()), city, country, seniority })
            })
            .collect();

        // Client-side location filter for Snov
        if let Some(loc) = &location {
            let loc_lower = loc.to_lowercase();
            if !loc_lower.is_empty() {
                prospects.retain(|p| {
                    let city = p.city.as_deref().unwrap_or("").to_lowercase();
                    let country = p.country.as_deref().unwrap_or("").to_lowercase();
                    city.contains(&loc_lower) || country.contains(&loc_lower)
                });
            }
        }

        prospects.sort_by_key(|p| title_score(&p.position));
        Ok(prospects)
    }

    /// Step 2: fetch email for a single prospect (costs 1 Snov.io credit).
    #[tauri::command]
    pub async fn snov_fetch_email(
        app: AppHandle,
        email_start_url: String,
    ) -> Result<String, String> {
        let client_id = store_get(&app, "snov_client_id")
            .ok_or("No Snov.io Client ID")?;
        let client_secret = store_get(&app, "snov_client_secret")
            .ok_or("No Snov.io Client Secret")?;
        let token = snov_token(&client_id, &client_secret).await?;
        let client = Client::new();

        let r = snov_post(&client, &email_start_url, &token, json!({})).await?;
        let result_url = r["links"]["result"]
            .as_str()
            .ok_or("No result URL")?
            .to_string();

        let result = snov_poll(&client, &result_url, &token).await?;
        let email = result["data"]["emails"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|e| e["email"].as_str())
            .unwrap_or("")
            .to_string();
        Ok(email)
    }

    /// Resolve a company name → domain using Snov.io company-domain-by-name
    #[tauri::command]
    pub async fn snov_resolve_domain(
        app: AppHandle,
        company_name: String,
    ) -> Result<String, String> {
        let client_id = store_get(&app, "snov_client_id")
            .ok_or("No Snov.io Client ID")?;
        let client_secret = store_get(&app, "snov_client_secret")
            .ok_or("No Snov.io Client Secret")?;
        let token = snov_token(&client_id, &client_secret).await?;
        let client = Client::new();

        let r = snov_post(&client, "https://api.snov.io/v2/company-domain-by-name/start", &token, json!({
            "names": [company_name]
        })).await?;

        let task_hash = r["data"]["task_hash"]
            .as_str()
            .ok_or_else(|| format!("No task_hash in response: {}", r))?
            .to_string();

        // Poll via POST (this endpoint uses POST to fetch results, not GET)
        let mut domain = String::new();
        for _ in 0..10 {
            tokio::time::sleep(tokio::time::Duration::from_millis(2500)).await;
            let poll = snov_post(
                &client,
                "https://api.snov.io/v2/company-domain-by-name/result",
                &token,
                json!({ "task_hash": task_hash }),
            ).await?;
            let status = poll["status"].as_str().unwrap_or("");
            if status == "completed" || status == "done" {
                domain = poll["data"]
                    .as_array()
                    .and_then(|arr| arr.first())
                    .and_then(|item| item["domain"].as_str())
                    .unwrap_or("")
                    .to_string();
                break;
            }
        }
        Ok(domain)
    }

    // ── Create contact in Twenty CRM ─────────────────────────────────────────

    #[tauri::command]
    pub async fn create_contact(
        app: AppHandle,
        first_name: String,
        last_name: String,
        email: Option<String>,
        job_title: Option<String>,
        company_name: Option<String>,
        company_domain: Option<String>,
        linkedin_url: Option<String>,
        job_posting_url: Option<String>,
        job_posting_label: Option<String>,
    ) -> Result<Person, String> {
        let api_key = store_get(&app, "twenty_api_key")
            .unwrap_or_else(|| DEFAULT_API_KEY.to_string());
        let client = Client::new();

        let company_id = match company_name.as_deref().filter(|s| !s.is_empty()) {
            Some(name) => Some(find_or_create_company(&client, &api_key, name, company_domain.as_deref()).await?),
            None => None,
        };

        let mut data_fields = vec![format!(
            r#"name: {{ firstName: "{}", lastName: "{}" }}"#,
            gql_escape(&first_name),
            gql_escape(&last_name)
        )];

        if let Some(ref e) = email { if !e.is_empty() {
            data_fields.push(format!(r#"emails: {{ primaryEmail: "{}" }}"#, gql_escape(e)));
        }}
        if let Some(ref t) = job_title { if !t.is_empty() {
            data_fields.push(format!(r#"jobTitle: "{}""#, gql_escape(t)));
        }}
        if let Some(ref id) = company_id {
            data_fields.push(format!(r#"companyId: "{}""#, id));
        }
        if let Some(ref li) = linkedin_url { if !li.is_empty() {
            data_fields.push(format!(r#"linkedinLink: {{ primaryLinkUrl: "{}" }}"#, gql_escape(li)));
        }}
        if let Some(ref jp_url) = job_posting_url { if !jp_url.is_empty() {
            let label = job_posting_label.as_deref().unwrap_or("Job Posting");
            data_fields.push(format!(
                r#"jobPosting: {{ primaryLinkUrl: "{}", primaryLinkLabel: "{}" }}"#,
                gql_escape(jp_url), gql_escape(label)
            ));
        }}

        let mutation = format!(
            r#"mutation {{ createPerson(data: {{ {} }}) {{ id name {{ firstName lastName }} emails {{ primaryEmail }} jobTitle company {{ name }} linkedinLink {{ primaryLinkUrl }} jobPosting {{ primaryLinkUrl primaryLinkLabel }} contacted createdAt }} }}"#,
            data_fields.join(", ")
        );

        let resp = client
            .post("https://hitlist.paulvinueza.dev/graphql")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&json!({ "query": mutation }))
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;
        let body: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        if let Some(errors) = body.get("errors") {
            return Err(format!("GraphQL error: {}", errors));
        }
        serde_json::from_value(body["data"]["createPerson"].clone())
            .map_err(|e| format!("Failed to parse created person: {}", e))
    }

    // ── PDF text extraction ───────────────────────────────────────────────────

    #[tauri::command]
    pub async fn extract_pdf_text(data: Vec<u8>) -> Result<String, String> {
        pdf_extract::extract_text_from_mem(&data)
            .map_err(|e| format!("PDF extraction failed: {}", e))
    }

    // ── AI prompt preview (debug) ─────────────────────────────────────────────

    #[tauri::command]
    pub async fn get_ai_prompt_preview(
        app: AppHandle,
        contact_name: String,
        contact_email: String,
        job_title: Option<String>,
        company: Option<String>,
        job_posting_text: Option<String>,
        linkedin_text: Option<String>,
        user_note: Option<String>,
    ) -> Result<AiPromptPreview, String> {
        let provider = store_get(&app, "ai_provider").unwrap_or_else(|| "claude".to_string());
        let model = store_get(&app, "ai_model")
            .unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string());
        let system_prompt = store_get(&app, "ai_system_prompt")
            .unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string());

        let resume_text = store_get(&app, "resume_text").unwrap_or_default();
        let full_system_prompt = if !resume_text.is_empty() {
            let truncated: String = resume_text.chars().take(3000).collect();
            format!("{}\n\nMy Resume / Background:\n{}", system_prompt, truncated)
        } else {
            system_prompt
        };

        let all_samples = load_writing_samples(&app);
        let samples_limit: usize = store_get(&app, "ai_samples_count")
            .and_then(|s| s.parse().ok())
            .unwrap_or(10);
        let selected = pick_random_samples(&all_samples, samples_limit);

        let mut prompt = String::new();
        let sample_text = selected.join("\n---\n");
        let samples_count = if !selected.is_empty() {
            let count = selected.len();
            prompt.push_str(&format!(
                "WRITING SAMPLES — These are my actual sent emails. Match this voice, tone, and style EXACTLY:\n\n{}\n\n---\n\n",
                sample_text
            ));
            count
        } else { 0 };
        prompt.push_str(&format!(
            "Now write a cold outreach email to:\nName: {}\nEmail: {}\n",
            contact_name, contact_email
        ));
        if let Some(ref t) = job_title { if !t.is_empty() { prompt.push_str(&format!("Their Title: {}\n", t)); } }
        if let Some(ref co) = company { if !co.is_empty() { prompt.push_str(&format!("Company: {}\n", co)); } }
        if let Some(ref posting) = job_posting_text {
            if !posting.is_empty() {
                let truncated: String = posting.chars().take(1500).collect();
                prompt.push_str(&format!("\nJob Posting:\n{}\n", truncated));
            }
        }
        if let Some(ref linkedin) = linkedin_text {
            if !linkedin.is_empty() {
                let truncated: String = linkedin.chars().take(1000).collect();
                prompt.push_str(&format!("\nRecruiter LinkedIn Profile:\n{}\n", truncated));
            }
        }
        if let Some(ref note) = user_note {
            if !note.is_empty() { prompt.push_str(&format!("\nSpecific instructions: {}\n", note)); }
        }
        prompt.push_str(
            "\nReturn ONLY valid JSON with this exact structure (no markdown, no explanation):\n{\"subject\": \"...\", \"body\": \"...\"}",
        );

        let endpoint = match provider.as_str() {
            "claude" => "https://api.anthropic.com/v1/messages",
            "openrouter" => "https://openrouter.ai/api/v1/chat/completions",
            "nvidia" => "https://integrate.api.nvidia.com/v1/chat/completions",
            "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            _ => "https://opencode.ai/zen/go/v1/chat/completions",
        };

        Ok(AiPromptPreview {
            system_prompt: full_system_prompt,
            user_message: prompt,
            model,
            provider,
            endpoint: endpoint.to_string(),
            samples_count,
        })
    }

    // ── Scheduled emails ──────────────────────────────────────────────────────

    async fn fire_scheduler_webhook(app: &AppHandle, payload: serde_json::Value) {
        if let Some(url) = store_get(app, "n8n_webhook_url") {
            if !url.is_empty() {
                let client = Client::new();
                let _ = client
                    .post(&url)
                    .json(&payload)
                    .timeout(std::time::Duration::from_secs(10))
                    .send()
                    .await;
            }
        }
    }

    #[tauri::command]
    pub async fn schedule_email(
        app: AppHandle,
        contact_id: String,
        contact_name: String,
        contact_email: String,
        contact_company: Option<String>,
        subject: String,
        body: String,
        scheduled_at: i64,
    ) -> Result<ScheduledEmail, String> {
        let entry = ScheduledEmail {
            id: gen_id(),
            contact_id,
            contact_name,
            contact_email,
            contact_company,
            subject,
            body,
            scheduled_at,
            status: "pending".to_string(),
        };

        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let mut list: Vec<ScheduledEmail> = store
            .get("scheduled_emails")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        list.push(entry.clone());
        store.set("scheduled_emails", serde_json::to_value(&list).unwrap_or(json!([])));
        store.save().map_err(|e| e.to_string())?;

        fire_scheduler_webhook(&app, json!({
            "to": entry.contact_email,
            "subject": entry.subject,
            "body": entry.body,
            "scheduled_at": entry.scheduled_at,
        })).await;

        Ok(entry)
    }

    #[tauri::command]
    pub async fn get_scheduled_emails(app: AppHandle) -> Result<Vec<ScheduledEmail>, String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        Ok(store
            .get("scheduled_emails")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default())
    }

    #[tauri::command]
    pub async fn delete_scheduled_email(app: AppHandle, id: String) -> Result<(), String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let mut list: Vec<ScheduledEmail> = store
            .get("scheduled_emails")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        list.retain(|e| e.id != id);
        store.set("scheduled_emails", serde_json::to_value(&list).unwrap_or(json!([])));
        store.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub async fn update_scheduled_email(
        app: AppHandle,
        id: String,
        subject: String,
        body: String,
        scheduled_at: i64,
    ) -> Result<(), String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let mut list: Vec<ScheduledEmail> = store
            .get("scheduled_emails")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        if let Some(entry) = list.iter_mut().find(|e| e.id == id) {
            entry.subject = subject.clone();
            entry.body = body.clone();
            entry.scheduled_at = scheduled_at;
        }
        store.set("scheduled_emails", serde_json::to_value(&list).unwrap_or(json!([])));
        store.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    // ── Test n8n webhook ─────────────────────────────────────────────────────

    #[tauri::command]
    pub async fn test_n8n_webhook(app: AppHandle) -> Result<String, String> {
        let webhook_url = store_get(&app, "n8n_webhook_url").unwrap_or_default();
        if webhook_url.is_empty() {
            return Err("No n8n webhook URL configured in Settings.".to_string());
        }
        let now = unix_now();
        let payload = json!({
            "action": "create",
            "id": format!("test-{}", now),
            "contact_id": "test",
            "contact_name": "Paul Vinueza",
            "contact_email": "paulvinueza30@gmail.com",
            "contact_company": null,
            "subject": "Hitlist n8n webhook test",
            "body": "This is a test email sent by the Hitlist app to confirm your n8n webhook is working correctly.",
            "scheduled_at": now + 60,
        });
        let client = Client::new();
        let resp = client
            .post(&webhook_url)
            .json(&payload)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        if status >= 200 && status < 300 {
            Ok(format!("Success ({}). Test email scheduled to send in ~1 minute.", status))
        } else {
            Err(format!("Webhook returned {} — {}", status, body.chars().take(200).collect::<String>()))
        }
    }

    // ── Follow-up reminders ───────────────────────────────────────────────────

    #[tauri::command]
    pub async fn set_contact_reminder(
        app: AppHandle,
        contact_id: String,
        ts: Option<i64>, // Unix seconds; None = clear
    ) -> Result<(), String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        let mut map: serde_json::Map<String, Value> = store
            .get("contact_reminders")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        match ts {
            Some(t) => { map.insert(contact_id, json!(t)); }
            None => { map.remove(&contact_id); }
        }
        store.set("contact_reminders", json!(map));
        store.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub async fn get_contact_reminders(app: AppHandle) -> Result<Value, String> {
        let store = app.store("config.json").map_err(|e| e.to_string())?;
        Ok(store.get("contact_reminders").unwrap_or_else(|| json!({})))
    }

    // ── Follow-up writing samples ─────────────────────────────────────────────

    #[tauri::command]
    pub async fn get_follow_up_samples(app: AppHandle) -> Result<Vec<String>, String> {
        Ok(load_follow_up_samples(&app))
    }

    #[tauri::command]
    pub async fn add_follow_up_sample(app: AppHandle, text: String) -> Result<(), String> {
        let trimmed = text.trim().to_string();
        if trimmed.len() < 20 {
            return Ok(());
        }
        let mut samples = load_follow_up_samples(&app);
        if !samples.iter().any(|s| s == &trimmed) {
            samples.push(trimmed);
        }
        save_follow_up_samples_list(&app, &samples)
    }

    #[tauri::command]
    pub async fn delete_follow_up_sample(app: AppHandle, index: usize) -> Result<(), String> {
        let mut samples = load_follow_up_samples(&app);
        if index < samples.len() {
            samples.remove(index);
            save_follow_up_samples_list(&app, &samples)?;
        }
        Ok(())
    }

    // ── Generate follow-up email ──────────────────────────────────────────────

    #[tauri::command]
    pub async fn generate_follow_up_email(
        app: AppHandle,
        contact_name: String,
        contact_email: String,
        job_title: Option<String>,
        company: Option<String>,
        days_since_contact: i64,
        original_subject: Option<String>,
    ) -> Result<GeneratedEmail, String> {
        let provider = store_get(&app, "ai_provider")
            .unwrap_or_else(|| "claude".to_string());
        let api_key = store_get(&app, "ai_api_key")
            .ok_or_else(|| "No AI API key configured. Add it in Settings → AI.".to_string())?;
        if api_key.is_empty() {
            return Err("No AI API key configured. Add it in Settings → AI.".to_string());
        }
        let model = store_get(&app, "ai_model")
            .unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string());
        let system_prompt = store_get(&app, "follow_up_system_prompt")
            .unwrap_or_else(|| DEFAULT_FOLLOW_UP_SYSTEM_PROMPT.to_string());

        // Load follow-up samples (fall back to regular samples if none)
        let fu_samples = load_follow_up_samples(&app);
        let samples_limit: usize = store_get(&app, "ai_samples_count")
            .and_then(|s| s.parse().ok())
            .unwrap_or(5);

        let all_samples = if !fu_samples.is_empty() { fu_samples } else { load_writing_samples(&app) };
        let selected = pick_random_samples(&all_samples, samples_limit.min(5));

        let mut prompt = String::new();

        let samples_used = if !selected.is_empty() {
            let sample_text: String = selected.join("\n---\n").chars().take(2000).collect();
            let count = sample_text.split("\n---\n").filter(|p| !p.trim().is_empty()).count();
            prompt.push_str(&format!(
                "FOLLOW-UP WRITING SAMPLES — Match this voice and brevity:\n\n{}\n\n---\n\n",
                sample_text
            ));
            count
        } else { 0 };

        prompt.push_str(&format!(
            "Write a brief follow-up email to:\nName: {}\nEmail: {}\n",
            contact_name, contact_email
        ));
        prompt.push_str(&format!("Days since original outreach: {}\n", days_since_contact));

        if let Some(ref t) = job_title { if !t.is_empty() { prompt.push_str(&format!("Their Title: {}\n", t)); } }
        if let Some(ref co) = company { if !co.is_empty() { prompt.push_str(&format!("Company: {}\n", co)); } }
        if let Some(ref s) = original_subject { if !s.is_empty() { prompt.push_str(&format!("Original email subject: {}\n", s)); } }

        prompt.push_str(
            "\nReturn ONLY valid JSON: {\"subject\": \"Re: <original subject or blank if replying>\", \"body\": \"...\"}",
        );

        let response_text =
            call_ai_api(&provider, &api_key, &model, &system_prompt, &prompt).await?;

        let json_str = extract_json(&response_text);
        let parsed: Value = serde_json::from_str(&json_str).map_err(|e| {
            let preview = &response_text[..response_text.len().min(200)];
            format!("Failed to parse AI response as JSON: {} — Raw: {}", e, preview)
        })?;

        Ok(GeneratedEmail {
            subject: parsed["subject"].as_str().unwrap_or("").to_string(),
            body: parsed["body"].as_str().unwrap_or("").to_string(),
            samples_used,
        })
    }

    // ── AI-assisted system prompt refinement ──────────────────────────────────

    #[tauri::command]
    pub async fn refine_system_prompt(
        app: AppHandle,
        current_prompt: String,
        refinement_request: String,
        prompt_type: String, // "outreach" | "follow_up"
    ) -> Result<String, String> {
        let provider = store_get(&app, "ai_provider")
            .unwrap_or_else(|| "claude".to_string());
        let api_key = store_get(&app, "ai_api_key")
            .ok_or_else(|| "No AI API key configured.".to_string())?;
        if api_key.is_empty() {
            return Err("No AI API key configured.".to_string());
        }
        let model = store_get(&app, "ai_model")
            .unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string());

        let context = if prompt_type == "follow_up" {
            "follow-up emails to recruiters who haven't replied"
        } else {
            "cold outreach emails to recruiters"
        };

        let system = "You are a prompt engineering expert. Improve the given system prompt based on user feedback. Return ONLY the improved system prompt text with no explanation, no markdown, no preamble. Preserve what is working, apply the requested changes.";
        let user_msg = format!(
            "Current system prompt for {}:\n\n{}\n\nUser's refinement request: {}\n\nReturn ONLY the improved system prompt:",
            context, current_prompt, refinement_request
        );

        call_ai_api(&provider, &api_key, &model, system, &user_msg).await
    }
}

// ============================================================
// OAuth callback handler (not a command, called from spawn)
// ============================================================

async fn await_oauth_callback(app: &AppHandle) -> Result<(), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::time::{timeout, Duration};

    let listener = TcpListener::bind("127.0.0.1:3141")
        .await
        .map_err(|e| format!("Failed to start local OAuth server on port 3141: {}", e))?;

    let accept_and_parse = async {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("Accept error: {}", e))?;

        let mut buf = vec![0u8; 8192];
        let n = stream
            .read(&mut buf)
            .await
            .map_err(|e| format!("Read error: {}", e))?;
        let request = String::from_utf8_lossy(&buf[..n]).to_string();

        let code = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|path| {
                url::Url::parse(&format!("http://localhost{}", path)).ok()
            })
            .and_then(|u| {
                u.query_pairs()
                    .find(|(k, _)| k == "code")
                    .map(|(_, v)| v.to_string())
            });

        let html = if code.is_some() {
            "<html><head><style>body{font-family:sans-serif;text-align:center;padding:60px;background:#111318;color:#e2e8f0}</style></head><body><h2 style='color:#22c55e'>&#10003; Authorization Successful</h2><p>You can close this tab and return to Hitlist Outreach.</p></body></html>"
        } else {
            "<html><head><style>body{font-family:sans-serif;text-align:center;padding:60px;background:#111318;color:#e2e8f0}</style></head><body><h2 style='color:#ef4444'>&#10007; Authorization Failed</h2><p>No code received. Please try again.</p></body></html>"
        };

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        );
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.flush().await;

        code.ok_or_else(|| "No authorization code in OAuth callback".to_string())
    };

    let code = timeout(Duration::from_secs(300), accept_and_parse)
        .await
        .map_err(|_| "OAuth timed out after 5 minutes. Please try again.".to_string())??;

    let client_id = store_get(app, "google_client_id")
        .ok_or_else(|| "No Google client ID".to_string())?;
    let client_secret = store_get(app, "google_client_secret")
        .ok_or_else(|| "No Google client secret".to_string())?;

    let client = Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", "http://localhost:3141/oauth"),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Token exchange parse error: {}", e))?;

    if let Some(error) = body.get("error") {
        return Err(format!(
            "Token exchange failed: {} — {}",
            error,
            body["error_description"].as_str().unwrap_or("")
        ));
    }

    let access_token = body["access_token"]
        .as_str()
        .ok_or("No access_token in token response")?;
    let refresh_token = body["refresh_token"].as_str().unwrap_or("");
    let expires_in = body["expires_in"].as_i64().unwrap_or(3600);

    store_set(app, "gmail_access_token", access_token)?;
    if !refresh_token.is_empty() {
        store_set(app, "gmail_refresh_token", refresh_token)?;
    }
    store_set(
        app,
        "gmail_token_expiry",
        &(unix_now() + expires_in).to_string(),
    )?;

    Ok(())
}

// ============================================================
// App entry point
// ============================================================

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Ok(store) = app.handle().store("config.json") {
                if store.get("twenty_api_key").is_none() {
                    store.set("twenty_api_key", json!(DEFAULT_API_KEY));
                    let _ = store.save();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::fetch_contacts,
            commands::mark_contacted,
            commands::start_gmail_auth,
            commands::send_email,
            commands::get_email_threads,
            commands::disconnect_gmail,
            commands::get_ai_config,
            commands::save_ai_config,
            commands::scrape_url,
            commands::generate_email,
            commands::test_ai_config,
            commands::get_outreach_log,
            commands::open_viewer_window,
            commands::open_external_url,
            commands::save_contact_context,
            commands::get_contact_context,
            commands::set_contact_state,
            commands::get_contact_states,
            commands::save_contact_note,
            commands::get_contact_note,
            commands::add_writing_sample,
            commands::get_writing_sample_count,
            commands::get_writing_samples,
            commands::delete_writing_sample,
            commands::save_resume_text,
            commands::get_resume_text,
            commands::parse_resume,
            commands::update_person_fields,
            commands::snov_search_prospects,
            commands::snov_fetch_email,
            commands::snov_resolve_domain,
            commands::create_contact,
            commands::set_contact_reminder,
            commands::get_contact_reminders,
            commands::extract_pdf_text,
            commands::get_ai_prompt_preview,
            commands::schedule_email,
            commands::get_scheduled_emails,
            commands::delete_scheduled_email,
            commands::update_scheduled_email,
            commands::test_n8n_webhook,
            commands::get_follow_up_samples,
            commands::add_follow_up_sample,
            commands::delete_follow_up_sample,
            commands::generate_follow_up_email,
            commands::refine_system_prompt,
            commands::delete_person,
            commands::get_contact_api_quota,
            commands::hunter_search_prospects,
            commands::apollo_search_prospects,
            commands::prospeo_search_prospects,
            commands::prospeo_fetch_email,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
