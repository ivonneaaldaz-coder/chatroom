// ── Constants ─────────────────────────────────────────────
export const MAX_MESSAGE_LENGTH = 500
export const RATE_LIMIT_COUNT = 4      // max messages
export const RATE_LIMIT_WINDOW = 10000 // per 10 seconds (ms)

// ── Rate limiter (client-side, in-memory) ─────────────────
const sendTimestamps: number[] = []

export function checkRateLimit(): { ok: boolean; message: string } {
  const now = Date.now()
  // Purge timestamps outside the window
  while (sendTimestamps.length && sendTimestamps[0] < now - RATE_LIMIT_WINDOW) {
    sendTimestamps.shift()
  }
  if (sendTimestamps.length >= RATE_LIMIT_COUNT) {
    const wait = Math.ceil((sendTimestamps[0] + RATE_LIMIT_WINDOW - now) / 1000)
    return { ok: false, message: `slow down — wait ${wait}s` }
  }
  sendTimestamps.push(now)
  return { ok: true, message: '' }
}

// ── Link blocking ──────────────────────────────────────────
const LINK_PATTERN = /https?:\/\/|www\.|\.com|\.net|\.org|\.io|\.co\b/i

export function containsLink(text: string): boolean {
  return LINK_PATTERN.test(text)
}

// ── Profanity filter ───────────────────────────────────────
// Intentionally minimal — catches obvious slurs and spam words.
// Extend this list as needed. Using whole-word matching to avoid
// false positives (e.g. "classic" containing "ass").
const BLOCKED_WORDS = [
  'nigger', 'nigga', 'faggot', 'fag', 'chink', 'spic', 'kike',
  'tranny', 'retard', 'cunt', 'slut', 'whore',
  // Spam patterns
  'buy now', 'click here', 'free money', 'make money fast',
]

const PROFANITY_REGEX = new RegExp(
  '\\b(' + BLOCKED_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'i'
)

export function containsProfanity(text: string): boolean {
  return PROFANITY_REGEX.test(text)
}

// ── Main validation ────────────────────────────────────────
export interface ValidationResult {
  ok: boolean
  error: string
}

export function validateMessage(content: string): ValidationResult {
  const trimmed = content.trim()

  if (!trimmed) {
    return { ok: false, error: '' }
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `max ${MAX_MESSAGE_LENGTH} characters` }
  }

  if (containsLink(trimmed)) {
    return { ok: false, error: 'links are disabled for now' }
  }

  if (containsProfanity(trimmed)) {
    return { ok: false, error: 'keep it kind in here' }
  }

  const rateCheck = checkRateLimit()
  if (!rateCheck.ok) {
    return { ok: false, error: rateCheck.message }
  }

  return { ok: true, error: '' }
}
