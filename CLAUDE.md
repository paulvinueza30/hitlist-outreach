# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Personal outreach desktop app for managing recruiter contacts from the Twenty CRM. Displays contacts, sends emails via Gmail, marks contacts as reached out to, and shows full email conversation threads — all from one place.

## Tech Stack

- **Desktop**: Tauri v2 (Rust backend + system WebView)
- **Frontend**: React + TypeScript + Vite
- **Email**: Gmail API via Google OAuth 2.0
- **CRM**: Twenty CRM GraphQL API

## Commands

```bash
npm run dev          # Frontend only (Vite)
npm run tauri dev    # Full app with Tauri (use this for development)
npm run tauri build  # Production build
npm run lint         # ESLint
npm run build        # TypeScript compile + Vite build
```

## Project Structure

```
src/                  # React frontend (TypeScript)
  components/         # UI components
  hooks/              # Custom React hooks
  lib/                # API clients (Twenty, Gmail)
  pages/              # Top-level views
src-tauri/            # Tauri/Rust backend
  src/main.rs         # Tauri entry + command handlers
  tauri.conf.json     # App config (permissions, window, bundle)
  Cargo.toml          # Rust dependencies
```

## Architecture

All sensitive operations (OAuth token storage, API key storage) happen in the Rust/Tauri layer. The frontend calls Tauri commands via `invoke()` — it never holds tokens directly.

**Data flow:**
- Twenty CRM → GraphQL queries via Tauri command → React state
- Gmail send → Tauri command (using stored OAuth token) → Gmail API
- Gmail threads → Tauri command → displayed in frontend

**State:** No external state library unless complexity demands it. Use React context or simple `useState`/`useEffect` for now.

## Key Integrations

### Twenty CRM API

- **GraphQL endpoint**: `https://hitlist.paulvinueza.dev/graphql`
- **Auth**: Bearer JWT API key — stored in Tauri secure storage, passed in `Authorization: Bearer <token>` header
- **"n8n contacts"**: People where `createdBy.name` contains `"n8n"` — these are recruiter contacts imported via n8n automation workflows

**Querying n8n contacts:**
```graphql
people(filter: { createdBy: { name: { like: "%n8n%" } } }) {
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
    }
  }
  totalCount
}
```

**Marking as contacted:**
```graphql
mutation {
  updatePerson(id: "<uuid>", data: { contacted: true }) {
    id contacted
  }
}
```

**Email threads**: `getTimelineThreadsFromPersonId` requires OAuth user context (returns Forbidden with API key). Use Gmail API directly to look up threads by email address instead.

**Key Person fields**: `id`, `name{firstName,lastName}`, `emails{primaryEmail}`, `phones{primaryPhoneNumber}`, `linkedinLink{primaryLinkUrl}`, `jobPosting{primaryLinkUrl,primaryLinkLabel}`, `contacted` (Boolean), `company{name}`, `createdBy{source,name}`

### Gmail API

- OAuth 2.0 with scopes: `gmail.send`, `gmail.readonly`
- Tokens stored via Tauri's keychain/secure storage
- OAuth redirect handled via a custom Tauri deep link scheme (e.g. `hitlist://oauth`)
- To view conversation with a contact: search Gmail threads by `from:<email> OR to:<email>`

## Environment / Config

Store secrets using Tauri's plugin-store or OS keychain — never in `.env` files committed to the repo. A `.env.local` (gitignored) can hold the Google OAuth client ID/secret for development.

## Shell Environment Notes

In this dev environment, `curl`, `head`, `tail` are aliased to SSH (will fail). Use `python3` with `urllib.request` for any HTTP calls in scripts.
