export type SanitizerContext = {
  redactContactInfo?: boolean;
  behavioralHintOnly?: boolean;
};

export type SanitizedOutput = {
  content: string;
  redactions: string[];
  transformed: boolean;
};

const SECRET_FIELD_PATTERN = /\b(password|passwd|pwd|api[_\s-]?key|secret[_\s-]?key|access[_\s-]?token|refresh[_\s-]?token|session[_\s-]?secret|database_url|private[_\s-]?key)\b\s*[:=]\s*['"]?[^'",\s}]+/gi;
const API_KEY_PATTERN = /\b(sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,})\b/g;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const BANK_PATTERN = /\b(bank\s*account|routing\s*number|iban|swift|sort\s*code)\b[^.。\n]*/gi;
const MEDICAL_FINANCE_PATTERN = /\b(diagnosis|prescription|medical record|salary|income|net worth|tax id)\b[^.。\n]*/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function redact(content: string, pattern: RegExp, label: string, redactions: string[]) {
  pattern.lastIndex = 0;
  if (!pattern.test(content)) return content;
  redactions.push(label);
  pattern.lastIndex = 0;
  return content.replace(pattern, `[REDACTED:${label}]`);
}

export function sanitizeMemoryOutput(value: unknown, context: SanitizerContext = {}): SanitizedOutput {
  const redactions: string[] = [];
  let content = safeStringify(value);

  content = redact(content, SECRET_FIELD_PATTERN, "secret_field", redactions);
  content = redact(content, API_KEY_PATTERN, "token_or_api_key", redactions);
  content = redact(content, SSN_PATTERN, "ssn", redactions);
  content = redact(content, CARD_PATTERN, "card_number", redactions);
  content = redact(content, BANK_PATTERN, "banking", redactions);
  content = redact(content, MEDICAL_FINANCE_PATTERN, "sensitive_personal_context", redactions);

  if (context.redactContactInfo) {
    content = redact(content, EMAIL_PATTERN, "email", redactions);
    content = redact(content, PHONE_PATTERN, "phone", redactions);
  }

  if (context.behavioralHintOnly) {
    content = toBehavioralHint(content);
    redactions.push("behavioral_hint_only");
  }

  return {
    content,
    redactions: [...new Set(redactions)],
    transformed: redactions.length > 0,
  };
}

export function toBehavioralHint(content: string): string {
  const lower = content.toLowerCase();
  const hints: string[] = [];

  if (/\b(formal|professional|concise|brief)\b/.test(lower)) hints.push("prefer concise professional wording");
  if (/\b(detailed|step by step|explain|thorough)\b/.test(lower)) hints.push("provide structured detail when useful");
  if (/\b(calm|gentle|supportive|friendly)\b/.test(lower)) hints.push("keep tone calm and supportive");
  if (/\b(evidence|source|cite|verify|fact)\b/.test(lower)) hints.push("surface evidence and uncertainty clearly");
  if (/\b(no jokes|serious|direct)\b/.test(lower)) hints.push("avoid playful phrasing in serious contexts");

  if (hints.length === 0) {
    return "Use this only as a sanitized behavioral style signal; do not reveal underlying memory details.";
  }

  return `Behavioral style hints: ${[...new Set(hints)].join("; ")}.`;
}
