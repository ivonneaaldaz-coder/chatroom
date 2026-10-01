const ADJECTIVES = [
  'dialup', 'offline', 'tiny', 'soft', 'painted', 'static', 'fuzzy',
  'dim', 'pixel', 'lost', 'slow', 'quiet', 'old', 'blinking', 'cached',
  'buffering', 'glitchy', 'vintage', 'analog', 'idle', 'wandering',
]

const NOUNS = [
  'dreamer', 'window', 'signal', 'stranger', 'poet', 'error', 'ghost',
  'cursor', 'modem', 'screen', 'archive', 'memory', 'packet', 'user',
  'visitor', 'lurker', 'explorer', 'nomad', 'pixel', 'byte',
]

const PRESETS = [
  'guest_1998', 'dialup_dreamer', 'away_message', 'painted_pixel',
  'internet_stranger', 'soft_error', 'tiny_window', 'border_signal',
  'pixel_poet', 'offline_forever', 'fuzzy_modem', 'cached_memory',
]

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateUsername(): string {
  // 30% chance of a preset, 70% generated
  if (Math.random() < 0.3) return randomItem(PRESETS)
  const adj = randomItem(ADJECTIVES)
  const noun = randomItem(NOUNS)
  const year = Math.random() < 0.4
    ? '_' + (Math.floor(Math.random() * 10) + 1994).toString()
    : ''
  return `${adj}_${noun}${year}`
}

export function sanitizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .slice(0, 30)
}

// ── Recovery code utilities ────────────────────────────────
// New users get a 12-character code such as K7MX-R4QH-2DNP.
// The readable code stays in that browser's localStorage. Only
// its SHA-256 hash is saved in the existing users.pin_hash column.
//
// Existing 6-digit PINs still verify because numeric PINs normalize
// to the exact same string that the original hashPin() used.

const RECOVERY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function normalizeRecoveryCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(12)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }

  const raw = Array.from(bytes, b => RECOVERY_CHARS[b % RECOVERY_CHARS.length]).join('')
  return raw.match(/.{1,4}/g)?.join('-') ?? raw
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const encoder = new TextEncoder()
  const normalized = normalizeRecoveryCode(code)
  const data = encoder.encode(normalized + 'chatroom-exe-salt')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
