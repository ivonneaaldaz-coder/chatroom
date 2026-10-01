'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  generateUsername,
  sanitizeUsername,
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from '@/lib/usernames'
import { supabase } from '@/lib/supabase'

type Stage = 'booting' | 'landing' | 'recovery'
type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken'

const BOOT_LINES = [
  'initializing...',
  'connecting to the old internet...',
  'loading nostalgia modules...',
  'disabling algorithms...',
  'ready.',
]

export default function LandingPage() {
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('booting')
  const [bootProgress, setBootProgress] = useState(0)
  const [visibleLines, setVisibleLines] = useState<string[]>([])

  const [inputUsername, setInputUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [usernameError, setUsernameError] = useState('')
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [recoveryInput, setRecoveryInput] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [loading, setLoading] = useState(false)

  // Fast little boot sequence. Returning users skip it entirely.
  useEffect(() => {
    const saved = localStorage.getItem('chatroom_username')
    if (saved) {
      router.push('/chat')
      return
    }

    let line = 0
    let progress = 0

    const progressInterval = setInterval(() => {
      progress += Math.random() * 14 + 10
      if (progress >= 100) {
        progress = 100
        clearInterval(progressInterval)
      }
      setBootProgress(Math.min(progress, 100))
    }, 45)

    const lineInterval = setInterval(() => {
      if (line < BOOT_LINES.length) {
        setVisibleLines(prev => [...prev, BOOT_LINES[line]])
        line++
      } else {
        clearInterval(lineInterval)
        setBootProgress(100)
        setTimeout(() => setStage('landing'), 120)
      }
    }, 120)

    return () => {
      clearInterval(progressInterval)
      clearInterval(lineInterval)
    }
  }, [router])

  // Debounced username availability check.
  useEffect(() => {
    if (stage !== 'landing') return

    const clean = sanitizeUsername(inputUsername)
    if (clean.length < 2) {
      setUsernameStatus('idle')
      return
    }

    setUsernameStatus('checking')
    if (checkTimeout.current) clearTimeout(checkTimeout.current)

    checkTimeout.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', clean)
        .maybeSingle()

      if (error) {
        setUsernameStatus('idle')
        setUsernameError('could not check that username — try again')
        return
      }

      setUsernameError('')
      setUsernameStatus(data ? 'taken' : 'available')
    }, 300)

    return () => {
      if (checkTimeout.current) clearTimeout(checkTimeout.current)
    }
  }, [inputUsername, stage])

  function enterAsGuest() {
    const username = generateUsername()
    localStorage.setItem('chatroom_username', username)
    localStorage.removeItem('chatroom_claimed')
    localStorage.removeItem('chatroom_recovery_code')
    localStorage.removeItem('chatroom_just_claimed')
    router.push('/chat')
  }

  async function claimAndEnter() {
    const clean = sanitizeUsername(inputUsername)
    if (clean.length < 2) {
      setUsernameError('username must be at least 2 characters')
      return
    }

    setLoading(true)
    setUsernameError('')

    try {
      const recoveryCode = generateRecoveryCode()
      const recoveryHash = await hashRecoveryCode(recoveryCode)

      const { error } = await supabase
        .from('users')
        // pin_hash is the legacy DB column name; new accounts store a recovery-code hash here.
        .insert({ username: clean, pin_hash: recoveryHash })

      if (error) {
        // Most likely the username was claimed between availability check + submit.
        setUsernameStatus('taken')
        setStage('recovery')
        return
      }

      localStorage.setItem('chatroom_username', clean)
      localStorage.setItem('chatroom_claimed', 'true')
      localStorage.setItem('chatroom_recovery_code', recoveryCode)
      localStorage.setItem('chatroom_just_claimed', 'true')
      router.push('/chat')
    } catch {
      setUsernameError('something went wrong — try again')
    } finally {
      setLoading(false)
    }
  }

  function handleEnter() {
    if (usernameStatus === 'taken') {
      setRecoveryInput('')
      setRecoveryError('')
      setStage('recovery')
      return
    }
    if (usernameStatus === 'available') {
      claimAndEnter()
    }
  }

  async function handleRecoverySignIn() {
    const clean = sanitizeUsername(inputUsername)
    const normalized = normalizeRecoveryCode(recoveryInput)

    if (normalized.length < 6) {
      setRecoveryError('enter your recovery code')
      return
    }

    setLoading(true)
    setRecoveryError('')

    try {
      const hash = await hashRecoveryCode(recoveryInput)
      const { data, error } = await supabase.rpc('verify_pin', {
        p_username: clean,
        p_pin_hash: hash,
      })

      if (error || !data) {
        setRecoveryError('that code does not match')
        return
      }

      localStorage.setItem('chatroom_username', clean)
      localStorage.setItem('chatroom_claimed', 'true')
      // Saving it here means this browser can reveal/copy it later from the profile panel.
      localStorage.setItem('chatroom_recovery_code', recoveryInput.trim().toUpperCase())
      router.push('/chat')
    } catch {
      setRecoveryError('could not sign in — check your connection and try again')
    } finally {
      setLoading(false)
    }
  }

  function UsernameStatusBadge() {
    if (usernameStatus === 'checking') {
      return <span style={{ fontSize: 11, color: '#808080', fontFamily: 'Courier New' }}>checking...</span>
    }
    if (usernameStatus === 'available') {
      return <span style={{ fontSize: 11, color: '#006600', fontFamily: 'Courier New' }}>✓ available</span>
    }
    if (usernameStatus === 'taken') {
      return <span style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New' }}>× already claimed</span>
    }
    return null
  }

  if (stage === 'booting') {
    return (
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
        <div style={{ fontFamily: 'Courier New', fontSize: 12, color: '#8888cc', textAlign: 'left', width: 300, maxWidth: '80vw', minHeight: 96 }}>
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
  }

  if (stage === 'landing') {
    const canContinue =
      !loading &&
      (usernameStatus === 'available' || usernameStatus === 'taken') &&
      sanitizeUsername(inputUsername).length >= 2

    return (
      <div className="boot-screen">
        <div style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: '0.1em' }}>CHATROOM.exe</div>

        <div style={{ fontFamily: 'Courier New', fontSize: 14, color: '#aaaacc', lineHeight: 2, textAlign: 'center' }}>
          A small corner of the internet for curious people.<br /><br />
          No algorithms.<br />No optimization.<br />No funnels.<br /><br />
          Just people hanging out.
        </div>

        <div className="win-outer" style={{ width: 390, maxWidth: '90vw', marginTop: 8 }}>
          <div className="titlebar">
            <span>💬</span>
            <span className="titlebar-title">choose a username</span>
          </div>

          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 12, fontFamily: 'Courier New', color: '#444', marginBottom: 8 }}>
              pick a handle. we'll remember you on this browser.
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                className="input-retro"
                style={{ flex: 1, minWidth: 0 }}
                value={inputUsername}
                onChange={e => {
                  setInputUsername(e.target.value)
                  setUsernameError('')
                }}
                onKeyDown={e => e.key === 'Enter' && canContinue && handleEnter()}
                placeholder="your_username"
                maxLength={30}
                autoFocus
                spellCheck={false}
              />
              <button
                className="btn-retro primary"
                onClick={handleEnter}
                disabled={!canContinue}
                style={{ opacity: canContinue ? 1 : 0.5, minWidth: 88 }}
              >
                {loading ? '...' : usernameStatus === 'taken' ? 'SIGN IN' : 'ENTER'}
              </button>
            </div>

            <div style={{ minHeight: 18, marginTop: 6 }}>
              {usernameError
                ? <span style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New' }}>⚠ {usernameError}</span>
                : <UsernameStatusBadge />
              }
            </div>

            <div style={{ marginTop: 8, paddingTop: 9, borderTop: '1px solid #c0c0c0', textAlign: 'center' }}>
              <button
                onClick={enterAsGuest}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#000080',
                  textDecoration: 'underline',
                  fontFamily: 'Courier New',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                or continue as guest
              </button>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#6666aa', fontFamily: 'Courier New', marginTop: 12, textAlign: 'center' }}>
          inspired by Yahoo Chat, AIM, MSN Messenger<br />
          and the weird little communities that made the early internet feel human.
        </div>
      </div>
    )
  }

  if (stage === 'recovery') {
    return (
      <div className="boot-screen">
        <div className="win-outer" style={{ width: 390, maxWidth: '92vw' }}>
          <div className="titlebar">
            <span>🔑</span>
            <span className="titlebar-title">welcome back — {sanitizeUsername(inputUsername)}</span>
          </div>

          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontFamily: 'Courier New', marginBottom: 12, color: '#444', lineHeight: 1.6 }}>
              that username is already claimed.<br />
              enter its recovery code to use it on this browser.
            </div>

            <input
              className="input-retro"
              style={{
                width: '100%',
                marginBottom: 6,
                letterSpacing: '0.12em',
                fontSize: 16,
                textAlign: 'center',
                textTransform: 'uppercase',
              }}
              value={recoveryInput}
              onChange={e => {
                setRecoveryInput(e.target.value.slice(0, 20))
                setRecoveryError('')
              }}
              onKeyDown={e => e.key === 'Enter' && handleRecoverySignIn()}
              placeholder="XXXX-XXXX-XXXX"
              autoFocus
              spellCheck={false}
              autoCapitalize="characters"
            />

            <div style={{ minHeight: 18 }}>
              {recoveryError && (
                <span style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New' }}>⚠ {recoveryError}</span>
              )}
            </div>

            <div style={{ fontSize: 10, color: '#777', fontFamily: 'Courier New', lineHeight: 1.5, marginTop: 4 }}>
              old account? your original 6-digit PIN still works here.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 14 }}>
              <button
                className="btn-retro"
                style={{ fontSize: 12 }}
                onClick={() => {
                  setStage('landing')
                  setRecoveryInput('')
                  setRecoveryError('')
                  setInputUsername('')
                  setUsernameStatus('idle')
                }}
              >
                ← choose another
              </button>

              <button
                className="btn-retro primary"
                onClick={handleRecoverySignIn}
                disabled={normalizeRecoveryCode(recoveryInput).length < 6 || loading}
                style={{ opacity: normalizeRecoveryCode(recoveryInput).length < 6 ? 0.5 : 1 }}
              >
                {loading ? 'checking...' : 'ENTER →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
