'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { generateUsername, sanitizeUsername, generateDeviceToken } from '@/lib/usernames'
import {
  getDeviceToken,
  saveClaimedIdentity,
  saveGuestIdentity,
} from '@/lib/identity'
import { supabase } from '@/lib/supabase'

type Stage = 'booting' | 'landing' | 'pin-login'
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
  const [usernameHasPin, setUsernameHasPin] = useState(false)
  const [usernameError, setUsernameError] = useState('')
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [loading, setLoading] = useState(false)

  // Returning browsers go straight back in. If someone intentionally chose
  // "switch username" or "sign out", skip the auto-login and show the picker.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const choosingIdentity = params.get('switch') === '1' || params.get('signedout') === '1'
    const saved = localStorage.getItem('chatroom_username')

    if (saved && !choosingIdentity) {
      router.push('/chat')
      return
    }

    if (choosingIdentity) {
      setStage('landing')
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
      setUsernameHasPin(false)
      return
    }

    setUsernameStatus('checking')
    if (checkTimeout.current) clearTimeout(checkTimeout.current)

    checkTimeout.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('username_status', {
        p_username: clean,
      })

      if (error) {
        setUsernameStatus('idle')
        setUsernameError('could not check that username — try again')
        return
      }

      setUsernameError('')
      setUsernameHasPin(Boolean(data?.has_pin))
      setUsernameStatus(Boolean(data?.claimed) ? 'taken' : 'available')
    }, 300)

    return () => {
      if (checkTimeout.current) clearTimeout(checkTimeout.current)
    }
  }, [inputUsername, stage])

  function enterAsGuest() {
    const username = generateUsername()
    saveGuestIdentity(username)
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
      const deviceToken = generateDeviceToken()
      const { data, error } = await supabase.rpc('claim_username', {
        p_username: clean,
        p_device_token: deviceToken,
      })

      if (error || !data) {
        const { data: status } = await supabase.rpc('username_status', { p_username: clean })
        setUsernameHasPin(Boolean(status?.has_pin))
        setUsernameStatus('taken')
        setUsernameError('that username was just claimed — try signing in')
        return
      }

      saveClaimedIdentity(clean, deviceToken, false)
      localStorage.setItem('chatroom_just_claimed', 'true')
      router.push('/chat')
    } catch {
      setUsernameError('something went wrong — try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleEnter() {
    const clean = sanitizeUsername(inputUsername)
    if (clean.length < 2 || loading) return

    if (usernameStatus === 'available') {
      await claimAndEnter()
      return
    }

    if (usernameStatus !== 'taken') return

    // If this browser already owns the username, use its saved device token.
    const savedDeviceToken = getDeviceToken(clean)
    if (savedDeviceToken) {
      setLoading(true)
      setUsernameError('')
      try {
        const { data, error } = await supabase.rpc('verify_device', {
          p_username: clean,
          p_device_token: savedDeviceToken,
        })

        if (!error && data) {
          saveClaimedIdentity(clean, savedDeviceToken, usernameHasPin)
          router.push('/chat')
          return
        }
      } finally {
        setLoading(false)
      }
    }

    if (usernameHasPin) {
      setPinInput('')
      setPinError('')
      setStage('pin-login')
      return
    }

    setUsernameError('that username is claimed on another browser and does not have a PIN yet')
  }

  async function handlePinSignIn() {
    const clean = sanitizeUsername(inputUsername)
    if (!/^\d{6}$/.test(pinInput)) {
      setPinError('PIN must be 6 digits')
      return
    }

    setLoading(true)
    setPinError('')

    try {
      const deviceToken = generateDeviceToken()
      const { data, error } = await supabase.rpc('verify_pin_and_register_device', {
        p_username: clean,
        p_pin: pinInput,
        p_device_token: deviceToken,
      })

      if (error || !data) {
        setPinError('wrong PIN — or too many attempts. try again in a bit.')
        return
      }

      saveClaimedIdentity(clean, deviceToken, true)
      router.push('/chat')
    } catch {
      setPinError('could not sign in — check your connection and try again')
    } finally {
      setLoading(false)
    }
  }

  function UsernameStatusBadge() {
    if (usernameStatus === 'checking') {
      return <span style={{ fontSize: 11, color: '#808080', fontFamily: 'Courier New' }}>checking...</span>
    }
    if (usernameStatus === 'available') {
      return <span style={{ fontSize: 11, color: '#006600', fontFamily: 'Courier New' }}>✓ available — claim it</span>
    }
    if (usernameStatus === 'taken') {
      const savedHere = Boolean(getDeviceToken(sanitizeUsername(inputUsername)))
      if (savedHere) {
        return <span style={{ fontSize: 11, color: '#006600', fontFamily: 'Courier New' }}>✓ yours on this browser</span>
      }
      return (
        <span style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New' }}>
          × claimed{usernameHasPin ? ' — PIN required' : ''}
        </span>
      )
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
                  setUsernameHasPin(false)
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
                {loading ? '...' : usernameStatus === 'available' ? 'CLAIM' : 'ENTER'}
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

  if (stage === 'pin-login') {
    return (
      <div className="boot-screen">
        <div className="win-outer" style={{ width: 360, maxWidth: '92vw' }}>
          <div className="titlebar">
            <span>🔐</span>
            <span className="titlebar-title">welcome back — {sanitizeUsername(inputUsername)}</span>
          </div>

          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontFamily: 'Courier New', marginBottom: 12, color: '#444', lineHeight: 1.6 }}>
              enter the 6-digit PIN for this username.
            </div>

            <input
              className="input-retro"
              style={{
                width: '100%',
                marginBottom: 6,
                letterSpacing: '0.22em',
                fontSize: 18,
                textAlign: 'center',
              }}
              value={pinInput}
              onChange={e => {
                setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                setPinError('')
              }}
              onKeyDown={e => e.key === 'Enter' && handlePinSignIn()}
              placeholder="______"
              maxLength={6}
              inputMode="numeric"
              autoFocus
            />

            <div style={{ minHeight: 18 }}>
              {pinError && (
                <span style={{ fontSize: 11, color: '#800000', fontFamily: 'Courier New' }}>⚠ {pinError}</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 12 }}>
              <button
                className="btn-retro"
                style={{ fontSize: 12 }}
                onClick={() => {
                  setStage('landing')
                  setPinInput('')
                  setPinError('')
                  setInputUsername('')
                  setUsernameStatus('idle')
                  setUsernameHasPin(false)
                }}
              >
                ← choose another
              </button>

              <button
                className="btn-retro primary"
                onClick={handlePinSignIn}
                disabled={pinInput.length !== 6 || loading}
                style={{ opacity: pinInput.length === 6 ? 1 : 0.5 }}
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
