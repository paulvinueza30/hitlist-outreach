export interface PersonName {
  firstName: string;
  lastName: string;
}

export interface PersonEmails {
  primaryEmail: string;
}

export interface PersonPhones {
  primaryPhoneNumber: string;
}

export interface PersonLink {
  primaryLinkUrl: string;
}

export interface JobPosting {
  primaryLinkUrl: string;
  primaryLinkLabel: string;
}

export interface Company {
  name: string;
}

export interface Person {
  id: string;
  name: PersonName;
  jobTitle: string | null;
  emails: PersonEmails | null;
  phones: PersonPhones | null;
  linkedinLink: PersonLink | null;
  jobPosting: JobPosting | null;
  contacted: boolean | null;
  company: Company | null;
  createdAt: string | null;
}

export interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  snippet: string;
  isHtml: boolean;
}

export interface EmailThread {
  id: string;
  subject: string;
  snippet: string;
  messages: EmailMessage[];
  lastDate: string;
}

export interface AppConfig {
  twenty_api_key: string;
  google_client_id: string;
  google_client_secret: string;
  gmail_connected: boolean;
  apollo_api_key: string;
  hunter_api_key: string;
  prospeo_api_key: string;
  snov_client_id: string;
  snov_client_secret: string;
  n8n_webhook_url: string;
  ai_samples_count: number;
  follow_up_days: number;
  follow_up_system_prompt: string;
}

export interface ScheduledEmail {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_email: string;
  contact_company: string | null;
  subject: string;
  body: string;
  scheduled_at: number; // Unix seconds
  status: "pending" | "sent" | "failed";
}

export interface AiPromptPreview {
  system_prompt: string;
  user_message: string;
  model: string;
  provider: string;
  endpoint: string;
  samples_count: number;
}

export interface SnovProspect {
  first_name: string;
  last_name: string;
  position: string;
  linkedin_url: string;
  email_start_url: string;
  email?: string;
  source?: string;
  city?: string;
  country?: string;
  seniority?: string;
}

export interface CreateContactInput {
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  jobPostingUrl?: string;
  jobPostingLabel?: string;
}

export interface AiConfig {
  provider: string;
  api_key: string;
  model: string;
  system_prompt: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  samples_used: number;
}

export interface GenerateEmailParams {
  contactName: string;
  contactEmail: string;
  jobTitle: string | null;
  company: string | null;
  jobPostingText: string | null;
  linkedinText: string | null;
  userNote: string | null;
}

export interface OutreachEntry {
  person_id: string;
  name: string;
  company: string | null;
  ts: number; // Unix seconds
}

export interface ContactContext {
  job: string;
  linkedin: string;
}

// "failed" | "replied" | "" (empty = none)
export type ContactState = string;

export interface ParsedResume {
  name: string;
  title: string;
  summary: string;
  skills: string[];
  experience: string[];
  education: string;
}
