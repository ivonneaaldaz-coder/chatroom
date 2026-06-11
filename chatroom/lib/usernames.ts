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
    .slice(0, 30) || generateUsername()
}


// ── PIN utilities ──────────────────────────────────────────

export function generatePin(): string {
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('')
}

// Simple hash — we use SHA-256 via Web Crypto API
// This runs in the browser; the raw PIN never leaves the client
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + 'chatroom-exe-salt')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
