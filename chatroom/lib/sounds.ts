'use client'

export type ChatSound = 'join' | 'leave' | 'message' | 'send' | 'dm'

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextCtor) return null
    audioContext = new AudioContextCtor()
  }
  return audioContext
}

export function primeChatAudio() {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
}

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'square'
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(start)
  osc.stop(start + duration + 0.01)
}

export function playChatSound(sound: ChatSound, enabled = true) {
  if (!enabled) return

  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running') return

  const now = ctx.currentTime + 0.01

  switch (sound) {
    case 'join':
      tone(ctx, 523.25, now, 0.09, 0.035, 'square')
      tone(ctx, 659.25, now + 0.08, 0.11, 0.035, 'square')
      break

    case 'leave':
      tone(ctx, 659.25, now, 0.09, 0.03, 'square')
      tone(ctx, 440, now + 0.08, 0.12, 0.03, 'square')
      break

    case 'message':
      tone(ctx, 880, now, 0.07, 0.025, 'triangle')
      break

    case 'send':
      tone(ctx, 620, now, 0.045, 0.018, 'square')
      break

    case 'dm':
      tone(ctx, 880, now, 0.07, 0.035, 'triangle')
      tone(ctx, 1174.66, now + 0.09, 0.1, 0.035, 'triangle')
      break
  }
}
