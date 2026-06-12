'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { generateUsername, sanitizeUsername, generatePin, hashPin } from '@/lib/usernames'
import { supabase } from '@/lib/supabase'

type Stage = 'booting' | 'landing' | 'username-input' | 'pin-set' | 'pin-confirm' | 'pin-return' | 'guest-confirm'

const BOOT_LINES = [
  'CHATROOM.exe v0.1',
  'initializing...',
  'connecting to the old internet...',
  'loading nostalgia modules...',
  'disabling algorithms...',
  'ready.',
]

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'yours'

export default function LandingPage() {
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('booting')
  const [bootProgress, setBootProgress] = useState(0)
  const [visibleLines, setVisibleLines] = useState<string[]>([])

  // Username input
  const [inputUsername, setInputUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [usernameError, setUsernameError] = useState('')
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // PIN flow
  const [generatedPin, setGeneratedPin] = useState('')
  const [pinConfirmInput, setPinConfirmInput] = useState('')
  const [pinReturnInput, setPinReturnInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [loading, setLoading] = useState(false)

  // Boot sequence
  useEffect(() => {
    const saved = localStorage.getItem('chatroom_username')
    if (saved) { router.push('/chat'); return }

    let line = 0
    let progress = 0
    const progressInterval = setInterval(() => {
      progress += Math.random() * 8 + 2
      if (progress >= 100) { progress = 100; clearInterval(progressInterval) }
      setBootProgress(Math.min(progress, 100))
    }, 80)
    const lineInterval = setInterval(() => {
      if (line < BOOT_LINES.length) {
        setVisibleLines(prev => [...prev, BOOT_LINES[line]])
        line++
      } else {
        clearInterval(lineInterval)
        setTimeout(() => setStage('landing'), 400)
      }
    }, 320)
    return () => { clearInterval(progressInterval); clearInterval(lineInterval) }
  }, [router])

  // Debounced username availability check
  useEffect(() => {
    if (stage !== 'username-input') return
    const clean = sanitizeUsername(inputUsername)
    if (clean.length < 2) { setUsernameStatus('idle'); return }

    setUsernameStatus('checking')
    if (checkTimeout.current) clearTimeout(checkTimeout.current)
    checkTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('users')
        .select('username')
        .eq('username', clean)
        .maybeSingle()
      setUsernameStatus(data ? 'taken' : 'available')
    }, 400)
  }, [inputUsername, stage])

  async function handleUsernameNext() {
    const clean = sanitizeUsername(inputUsername)
    if (clean.length < 2) { setUsernameError('too short'); return }

    if (usernameStatus === 'taken') {
      // Go to PIN return flow
      setStage('pin-return')
      return
    }
    if (usernameStatus === 'available') {
      // Generate PIN, show it to user
      const pin = generatePin()
      setGeneratedPin(pin)
      setStage('pin-set')
      return
    }
  }

  async function handlePinConfirm() {
    if (pinConfirmInput !== generatedPin) {
      setPinError('PINs do not match — try again')
      setPinConfirmInput('')
      return
    }
    setLoading(true)
    setPinError('')
    try {
      const clean = sanitizeUsername(inputUsername)
      const hash = await hashPin(generatedPin)
      const { error } = await supabase
        .from('users')
        .insert({ username: clean, pin_hash: hash })
      if (error) throw error
      localStorage.setItem('chatroom_username', clean)
      localStorage.setItem('chatroom_claimed', 'true')
      router.push('/chat')
    } catch {
      setPinError('something went wrong — try a different username')
      setStage('username-input')
    } finally {
      setLoading(false)
    }
  }

  async function handlePinReturn() {
    if (pinReturnInput.length !== 6) { setPinError('PIN must be 6 digits'); return }
    setLoading(true)
    setPinError('')
    try {
      const clean = sanitizeUsername(inputUsername)
      const hash = await hashPin(pinReturnInput)
      const { data } = await supabase.rpc('verify_pin', {
        p_username: clean,
        p_pin_hash: hash,
      })
      if (!data) {
        setPinError('wrong PIN')
        setLoading(false)
        return
      }
      localStorage.setItem('chatroom_username', clean)
      localStorage.setItem('chatroom_claimed', 'true')
      router.push('/chat')
    } catch (e) {
      setPinError('could not verify PIN — check your connection and try again')
      setLoading(false)
    }
  }

  function enterAsGuest() {
    const username = generateUsername()
    localStorage.setItem('chatroom_username', username)
    localStorage.removeItem('chatroom_claimed')
    router.push('/chat')
  }

  // ── Status indicator ───────────────────────────────────
  function UsernameStatusBadge() {
    if (usernameStatus === 'checking') return (
      <span style={{ fontSize: 11, color: '#808080', fontFamily: 'Courier New' }}>checking...</span>
    )
    if (usernameStatus === 'available') return (
      <span style={{ fontSize: 11, color: '#006600', fontFamily: 'Courier New' }}>✓ available</span>
    )
    if (usernameStatus === 'taken') return (
      <span style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New' }}>✗ not available — enter PIN to sign in, or choose another</span>
    )
    return null
  }

  // ── Boot screen ────────────────────────────────────────
  if (stage === 'booting') return (
    <div className="boot-screen">
      <div style={{ fontFamily: 'Courier New', fontSize: 14, color: '#aaaacc', marginBottom: 8 }}>
        Copyright (C) 2026 bywhitespace.com
      </div>
      <div style={{ fontSize: 28, fontWeight: 'bold', letterSpacing: '0.1em' }}>
        CHATROOM<span className="cursor-blink">.exe</span>
      </div>
      <div className="loading-bar-track">
        <div className="loading-bar-fill" style={{ width: `${bootProgress}%` }} />
      </div>
      <div style={{ fontFamily: 'Courier New', fontSize: 12, color: '#8888cc', textAlign: 'left', width: 300, maxWidth: '80vw', minHeight: 120 }}>
        {visibleLines.map((line, i) => (
          <div key={i} style={{ marginBottom: 2 }}>
            <span style={{ color: '#aaaaff' }}>C:\&gt;</span> <span>{line}</span>
          </div>
        ))}
        {visibleLines.length < BOOT_LINES.length && (
          <span className="cursor-blink" style={{ color: '#ffffff' }}>_</span>
        )}
      </div>
    </div>
  )

  // ── Landing ────────────────────────────────────────────
  if (stage === 'landing') return (
    <div className="boot-screen">
      <div style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: '0.1em' }}>CHATROOM.exe</div>
      <div style={{ fontFamily: 'Courier New', fontSize: 14, color: '#aaaacc', lineHeight: 2, textAlign: 'center' }}>
        A small corner of the internet for curious people.<br /><br />
        No algorithms.<br />No optimization.<br />No funnels.<br /><br />
        Just people hanging out.
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn-retro primary" style={{ fontSize: 14, padding: '6px 24px', minWidth: 160 }}
          onClick={() => setStage('username-input')}>
          [ Claim Username ]
        </button>
        <button className="btn-retro" style={{ fontSize: 14, padding: '6px 24px', minWidth: 160 }}
          onClick={() => setStage('username-input')}>
          [ Sign Back In ]
        </button>
        <button className="btn-retro" style={{ fontSize: 14, padding: '6px 24px', minWidth: 160 }}
          onClick={enterAsGuest}>
          [ Guest ]
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#6666aa', fontFamily: 'Courier New', marginTop: 8, textAlign: 'center' }}>
        inspired by Yahoo Chat, AIM, MSN Messenger<br />
        and the weird little communities that made the early internet feel human.
      </div>
    </div>
  )

  // ── Username input ─────────────────────────────────────
  if (stage === 'username-input') return (
    <div className="boot-screen">
      <div className="win-outer" style={{ width: 360, maxWidth: '92vw' }}>
        <div className="titlebar">
          <span>💬</span>
          <span className="titlebar-title">CHATROOM.exe — choose a username</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, marginBottom: 10, fontFamily: 'Courier New', color: '#000080' }}>
            enter your username to claim it or sign back in.<br />
            <span style={{ color: '#444' }}>claimed usernames require a 6-digit PIN.</span>
          </div>
          <input
            className="input-retro"
            style={{ width: '100%', marginBottom: 6 }}
            value={inputUsername}
            onChange={e => { setInputUsername(e.target.value); setUsernameError('') }}
            onKeyDown={e => e.key === 'Enter' && handleUsernameNext()}
            placeholder="your_username"
            maxLength={30}
            autoFocus
            spellCheck={false}
          />
          <div style={{ minHeight: 18, marginBottom: 8 }}>
            {usernameError
              ? <span style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New' }}>⚠ {usernameError}</span>
              : <UsernameStatusBadge />
            }
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn-retro" style={{ fontSize: 12 }} onClick={() => setStage('landing')}>
              ← back
            </button>
            <button className="btn-retro" style={{ fontSize: 12 }} onClick={enterAsGuest}>
              guest
            </button>
            <button
              className="btn-retro primary"
              onClick={handleUsernameNext}
              disabled={usernameStatus === 'checking' || usernameStatus === 'idle' || inputUsername.length < 2}
              style={{ opacity: (usernameStatus === 'checking' || usernameStatus === 'idle' || inputUsername.length < 2) ? 0.5 : 1 }}
            >
              {usernameStatus === 'taken' ? 'Sign In →' : 'Claim →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── PIN display (first time) ───────────────────────────
  if (stage === 'pin-set') return (
    <div className="boot-screen">
      <div className="win-outer" style={{ width: 360, maxWidth: '92vw' }}>
        <div className="titlebar">
          <span>🔐</span>
          <span className="titlebar-title">your PIN — write this down</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontFamily: 'Courier New', marginBottom: 12, color: '#444' }}>
            username: <strong style={{ color: '#000080' }}>{sanitizeUsername(inputUsername)}</strong>
          </div>
          <div style={{
            background: '#000080', color: '#ffffff',
            fontFamily: 'Courier New', fontSize: 32,
            letterSpacing: '0.3em', textAlign: 'center',
            padding: '16px 0', marginBottom: 12,
            border: '2px inset #404040',
          }}>
            {generatedPin}
          </div>
          <div style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New', marginBottom: 16, lineHeight: 1.6 }}>
            ⚠ write this down — you will need it to sign back in.<br />
            there is no recovery. no email. no reset.<br />
            this is the only time you will see it.
          </div>
          <div style={{ fontSize: 12, fontFamily: 'Courier New', marginBottom: 8 }}>
            confirm your PIN to continue:
          </div>
          <input
            className="input-retro"
            style={{ width: '100%', marginBottom: 6, letterSpacing: '0.2em', fontSize: 18, textAlign: 'center' }}
            value={pinConfirmInput}
            onChange={e => { setPinConfirmInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError('') }}
            onKeyDown={e => e.key === 'Enter' && handlePinConfirm()}
            placeholder="______"
            maxLength={6}
            inputMode="numeric"
            autoFocus
          />
          {pinError && (
            <div style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New', marginBottom: 8 }}>⚠ {pinError}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              className="btn-retro primary"
              onClick={handlePinConfirm}
              disabled={pinConfirmInput.length !== 6 || loading}
              style={{ opacity: pinConfirmInput.length !== 6 ? 0.5 : 1 }}
            >
              {loading ? 'saving...' : 'Confirm →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── PIN return (sign back in) ──────────────────────────
  if (stage === 'pin-return') return (
    <div className="boot-screen">
      <div className="win-outer" style={{ width: 360, maxWidth: '92vw' }}>
        <div className="titlebar">
          <span>🔐</span>
          <span className="titlebar-title">sign in — {sanitizeUsername(inputUsername)}</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontFamily: 'Courier New', marginBottom: 12, color: '#444' }}>
            that username is claimed.<br />
            enter your 6-digit PIN to sign in.
          </div>
          <input
            className="input-retro"
            style={{ width: '100%', marginBottom: 6, letterSpacing: '0.2em', fontSize: 18, textAlign: 'center' }}
            value={pinReturnInput}
            onChange={e => { setPinReturnInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError('') }}
            onKeyDown={e => e.key === 'Enter' && handlePinReturn()}
            placeholder="______"
            maxLength={6}
            inputMode="numeric"
            autoFocus
          />
          {pinError && (
            <div style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New', marginBottom: 8 }}>⚠ {pinError}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8 }}>
            <button className="btn-retro" style={{ fontSize: 12 }}
              onClick={() => { setStage('username-input'); setPinReturnInput(''); setPinError('') }}>
              ← different username
            </button>
            <button
              className="btn-retro primary"
              onClick={handlePinReturn}
              disabled={pinReturnInput.length !== 6 || loading}
              style={{ opacity: pinReturnInput.length !== 6 ? 0.5 : 1 }}
            >
              {loading ? 'checking...' : 'Sign In →'}
            </button>
          </div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #c0c0c0' }}>
            <button className="btn-retro" style={{ fontSize: 11, width: '100%' }} onClick={enterAsGuest}>
              forgot PIN — enter as guest instead
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return null
}
