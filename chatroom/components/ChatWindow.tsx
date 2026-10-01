'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getDeviceToken, hasLocalPin, setLocalPinStatus, clearActiveIdentity } from '@/lib/identity'
import { getNextSystemMessage, nextSystemMessageDelay } from '@/lib/systemMessages'
import { type Message, type SystemMessage, type Room } from '@/types'
import RoomList from './RoomList'
import DMWindow from './DMWindow'
import UserList from './UserList'
import MessageFeed from './MessageFeed'
import MessageInput from './MessageInput'

type Entry = Message | SystemMessage

let systemMsgCounter = 0

function makeSystemMsg(content: string): SystemMessage {
  return { id: `sys-${Date.now()}-${systemMsgCounter++}`, content, type: 'system' }
}

interface ChatWindowProps {
  username: string
}

const PRESENCE_INTERVAL = 25000 // heartbeat every 25s
const PRESENCE_TIMEOUT  = 60000 // consider offline after 60s

export default function ChatWindow({ username }: ChatWindowProps) {
  const router = useRouter()
  const [currentRoom, setCurrentRoom] = useState<Room>('lobby')
  const [entries, setEntries] = useState<Entry[]>([])
  const [onlineUsers, setOnlineUsers] = useState<string[]>([username])
  const [connected, setConnected] = useState(false)
  const [showUsers, setShowUsers] = useState(false)
  const [openDMs, setOpenDMs] = useState<string[]>([])
  const [unreadFrom, setUnreadFrom] = useState<string[]>([])
  const [recentContacts, setRecentContacts] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(localStorage.getItem('chatroom_recent_contacts') || '[]')
    } catch { return [] }
  })
  const [isMobile, setIsMobile] = useState(false)
  const [isEmbedded, setIsEmbedded] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [claimedIdentity, setClaimedIdentity] = useState(false)
  const [hasPin, setHasPin] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinMessage, setPinMessage] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [showClaimNudge, setShowClaimNudge] = useState(false)
  useEffect(() => {
    const check = () => {
      // Check both window width and parent frame width for embedded context
      const w = window.innerWidth || document.documentElement.clientWidth
      setIsMobile(w <= 768)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    // Check URL param — lab passes ?embedded=1 when loading in iframe
    const params = new URLSearchParams(window.location.search)
    setIsEmbedded(params.get('embedded') === '1')
  }, [])

  useEffect(() => {
    const claimed = localStorage.getItem('chatroom_claimed') === 'true'
    const justClaimed = localStorage.getItem('chatroom_just_claimed') === 'true'

    setClaimedIdentity(claimed)
    setHasPin(claimed ? hasLocalPin(username) : false)

    if (justClaimed) {
      setShowClaimNudge(true)
      localStorage.removeItem('chatroom_just_claimed')
      const timer = setTimeout(() => setShowClaimNudge(false), 7000)
      return () => clearTimeout(timer)
    }
  }, [username])

  async function savePin() {
    if (!/^\d{6}$/.test(pinInput)) {
      setPinMessage('PIN must be 6 digits')
      return
    }
    if (pinInput !== pinConfirm) {
      setPinMessage('PINs do not match')
      return
    }

    const deviceToken = getDeviceToken(username)
    if (!deviceToken) {
      setPinMessage('this browser is missing its identity token — switch usernames and sign back in')
      return
    }

    setPinSaving(true)
    setPinMessage('')

    try {
      const { data, error } = await supabase.rpc('set_username_pin', {
        p_username: username,
        p_device_token: deviceToken,
        p_pin: pinInput,
      })

      if (error || !data) {
        setPinMessage('could not save PIN — try again')
        return
      }

      setLocalPinStatus(username, true)
      setHasPin(true)
      setPinInput('')
      setPinConfirm('')
      setPinMessage('PIN saved ✓')
    } catch {
      setPinMessage('could not save PIN — check your connection')
    } finally {
      setPinSaving(false)
    }
  }

  function chooseAnotherUsername() {
    clearActiveIdentity()
    setProfileOpen(false)
    router.push('/?switch=1')
  }

  function signOut() {
    clearActiveIdentity()
    setProfileOpen(false)
    router.push('/?signedout=1')
  }

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const systemTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load recent messages ──────────────────────────────
  const loadMessages = useCallback(async (room: Room) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room', room)
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .limit(80)

    if (error) {
      console.error('load error:', error)
      return
    }

    const msgs = (data ?? []) as Message[]
    setEntries([
      makeSystemMsg('welcome to the room.'),
      makeSystemMsg('no algorithm is watching you here.'),
      ...msgs,
    ])
  }, [])

  // ── Subscribe to realtime ─────────────────────────────
  const subscribe = useCallback((room: Room) => {
    // Tear down existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase
      .channel(`room:${room}`)
      // New messages
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${room}` },
        (payload) => {
          const msg = payload.new as Message
          if (msg.deleted) return
          setEntries(prev => [...prev, msg])
        }
      )
      // Soft deletes — remove from view instantly
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room=eq.${room}` },
        (payload) => {
          const updated = payload.new as Message
          if (updated.deleted) {
            setEntries(prev => prev.filter(e => (e as Message).id !== updated.id))
          }
        }
      )
      // Presence for online users
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ username: string }>()
        const names = Object.values(state)
          .flatMap(arr => arr.map(p => p.username))
          .filter((v, i, a) => a.indexOf(v) === i) // dedupe
        setOnlineUsers(names.length ? names : [username])
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        const joiner = (newPresences[0] as unknown as { username: string })?.username
        if (joiner && joiner !== username) {
          setEntries(prev => [...prev, makeSystemMsg(`${joiner} has entered the room.`)])
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const leaver = (leftPresences[0] as unknown as { username: string })?.username
        if (leaver && leaver !== username) {
          setEntries(prev => [...prev, makeSystemMsg(`${leaver} has left.`)])
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          await channel.track({ username, online_at: new Date().toISOString() })
        } else {
          setConnected(false)
        }
      })

    channelRef.current = channel
  }, [username])

  // ── System message scheduler ──────────────────────────
  function scheduleSystemMsg() {
    if (systemTimerRef.current) clearTimeout(systemTimerRef.current)
    systemTimerRef.current = setTimeout(() => {
      setEntries(prev => [...prev, makeSystemMsg(getNextSystemMessage())])
      scheduleSystemMsg()
    }, nextSystemMessageDelay())
  }

  // ── Init + cleanup ────────────────────────────────────
  useEffect(() => {
    loadMessages(currentRoom)
    subscribe(currentRoom)
    scheduleSystemMsg()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (systemTimerRef.current) clearTimeout(systemTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoom])

  function removeRecent(user: string) {
    const updated = recentContacts.filter(u => u !== user)
    setRecentContacts(updated)
    localStorage.setItem('chatroom_recent_contacts', JSON.stringify(updated))
  }

  function openDM(user: string) {
    setOpenDMs(prev => prev.includes(user) ? prev : [...prev, user])
    setUnreadFrom(prev => prev.filter(u => u !== user))
    setShowUsers(false)
    if(typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'dm_opened')
    }
    // Save to recent contacts
    setRecentContacts(prev => {
      const updated = [user, ...prev.filter(u => u !== user)].slice(0, 10)
      localStorage.setItem('chatroom_recent_contacts', JSON.stringify(updated))
      return updated
    })
  }

  function closeDM(user: string) {
    setOpenDMs(prev => prev.filter(u => u !== user))
  }

  // Listen for incoming DMs to show unread indicator
  useEffect(() => {
    const channel = supabase
      .channel(`dm-notify:${username}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `to_username=eq.${username}` },
        (payload) => {
          const msg = payload.new as { from_username: string }
          if (!openDMs.includes(msg.from_username)) {
            setUnreadFrom(prev => prev.includes(msg.from_username) ? prev : [...prev, msg.from_username])
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [username, openDMs])

  // ── Send message ──────────────────────────────────────
  async function handleSend(content: string) {
    const { error } = await supabase
      .from('messages')
      .insert({ room: currentRoom, username, content })

    if (error) {
      if (error.message?.includes('rate_limit_exceeded')) {
        throw new Error('slow down')
      }
      throw error
    }
    if(typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'message_sent', { room_id: currentRoom })
    }
  }

  // ── Change room ───────────────────────────────────────
  function handleRoomChange(room: Room) {
    setCurrentRoom(room)
    setEntries([])
    setConnected(false)
    if(typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'room_visit', { room_id: room })
    }
  }

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      maxWidth: '100vw',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: '#c0c0c0',
      position: 'relative',
    }}>
      {/* Window chrome */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 0, overflow: 'hidden', minWidth: 0, width: '100%', background: '#c0c0c0', border: 'none' }}>

        {/* Title bar — never shown, lab provides window chrome */}

        {/* Slim bar — shows online badge on mobile, connection status on desktop */}
        <div style={{
          background: '#d4d0c8',
          borderBottom: '1px solid #808080',
          padding: '2px 8px',
          fontSize: 11,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          {/* Online badge — always shown on mobile */}
          {isMobile ? (
            <div
              onClick={() => setShowUsers(v => !v)}
              style={{
                background: '#1a5f1a',
                color: '#ffffff',
                fontSize: 11,
                fontFamily: 'Courier New',
                padding: '4px 10px',
                cursor: 'pointer',
                border: '1px solid #4a9f4a',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                userSelect: 'none',
                borderRadius: 2,
                fontWeight: 'bold',
                letterSpacing: '0.03em',
              }}
            >
              ● {onlineUsers.length} online — tap to DM
            </div>
          ) : <span />}
          {/* Connection status — desktop only */}
          {!isMobile && (
            <span style={{ color: connected ? '#008000' : '#808080', marginLeft: 'auto' }}>
              {connected ? '● connected' : '○ connecting...'}
            </span>
          )}
        </div>

        {/* Three-panel layout */}
        <div
          className="chat-layout"
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          <RoomList currentRoom={currentRoom} onRoomChange={handleRoomChange} />

          {/* Center */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <MessageFeed entries={entries} currentUser={username} />
            <MessageInput onSend={handleSend} disabled={!connected} isMobile={isMobile} isEmbedded={isEmbedded} />
          </div>

          <UserList users={onlineUsers} currentUser={username} onDM={openDM} unreadFrom={unreadFrom} recentContacts={recentContacts} onRemoveRecent={removeRecent} />
        </div>

        {/* Mobile users bottom sheet */}
        {showUsers && (
          <div
            className="users-sheet-overlay"
            onClick={() => setShowUsers(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 400,
              display: isMobile ? 'block' : 'none',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: 0,
                left: '4%',
                right: '4%',
                width: '92%',
                background: '#f0f0f0',
                borderTop: '2px solid #ffffff',
                borderLeft: '2px solid #ffffff',
                borderRight: '2px solid #404040',
                maxHeight: '45vh',
                overflowY: 'auto',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
              }}
            >
              <div style={{
                background: '#000080',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 'bold',
                padding: '5px 12px',
                letterSpacing: '0.06em',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                ONLINE NOW
                <span
                  onClick={() => setShowUsers(false)}
                  style={{ cursor: 'pointer', fontSize: 14 }}
                >✕</span>
              </div>
              {onlineUsers.map(user => (
                <div
                  key={user}
                  onClick={() => user !== username && openDM(user)}
                  style={{
                    padding: '12px 14px',
                    fontFamily: 'Courier New',
                    fontSize: 14,
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: user === username ? 'default' : 'pointer',
                    background: unreadFrom.includes(user) ? '#fff0cc' : 'transparent',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ color: '#008000', fontSize: 11, flexShrink: 0 }}>●</span>
                  <span style={{
                    color: user === username ? '#000080' : '#444',
                    fontWeight: user === username ? 'bold' : 'normal',
                    flex: 1,
                  }}>
                    {user}
                  </span>
                  {user === username && (
                    <span style={{ fontSize: 10, color: '#808080' }}>(you)</span>
                  )}
                  {user !== username && (
                    <span style={{
                      fontSize: unreadFrom.includes(user) ? 10 : 11,
                      color: unreadFrom.includes(user) ? '#ffffff' : '#aaaaaa',
                      background: unreadFrom.includes(user) ? '#cc0000' : 'transparent',
                      padding: unreadFrom.includes(user) ? '1px 5px' : '0',
                      fontWeight: unreadFrom.includes(user) ? 'bold' : 'normal',
                      animation: unreadFrom.includes(user) ? 'blink 0.8s step-end infinite' : 'none',
                      flexShrink: 0,
                    }}>
                      {unreadFrom.includes(user) ? 'NEW' : 'DM →'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status bar */}
        <div className="statusbar" style={{ overflow: 'hidden' }}>
          <div className="statusbar-section" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            #{currentRoom} · {onlineUsers.length} online
          </div>
          <div
            className="statusbar-section"
            onClick={() => setProfileOpen(true)}
            title={claimedIdentity ? 'identity + PIN' : 'guest identity — click to claim'}
            style={{
              flex: 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 210,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {claimedIdentity ? '🔑 ' : ''}{username}
          </div>
        </div>
      </div>


      {/* New claim nudge — optional PIN comes later, not before chat */}
      {showClaimNudge && (
        <div
          style={{
            position: 'absolute',
            right: 10,
            bottom: 30,
            zIndex: 450,
            width: 290,
            maxWidth: 'calc(100vw - 20px)',
            background: '#ffffcc',
            color: '#222',
            borderTop: '2px solid #ffffff',
            borderLeft: '2px solid #ffffff',
            borderRight: '2px solid #404040',
            borderBottom: '2px solid #404040',
            boxShadow: '2px 2px 0 rgba(0,0,0,.25)',
            padding: '8px 10px',
            fontFamily: 'Courier New',
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          <strong>{username} claimed ✓</strong><br />
          this browser will remember you.
          <button
            onClick={() => { setShowClaimNudge(false); setProfileOpen(true) }}
            style={{
              display: 'block',
              marginTop: 5,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: '#000080',
              textDecoration: 'underline',
              fontFamily: 'Courier New',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            add a PIN for other devices
          </button>
        </div>
      )}

      {/* Identity panel */}
      {profileOpen && (
        <div
          onClick={() => setProfileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            background: 'rgba(0,0,0,.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="win-outer"
            onClick={e => e.stopPropagation()}
            style={{ width: 390, maxWidth: '94vw', background: '#c0c0c0' }}
          >
            <div className="titlebar">
              <span>{claimedIdentity ? '🔑' : '👤'}</span>
              <span className="titlebar-title">identity — {username}</span>
              <button
                onClick={() => setProfileOpen(false)}
                style={{
                  marginLeft: 'auto',
                  width: 18,
                  height: 18,
                  lineHeight: '14px',
                  padding: 0,
                  fontFamily: 'Arial',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 16, fontFamily: 'Courier New', color: '#222' }}>
              <div style={{ fontSize: 12, marginBottom: 12 }}>
                username: <strong style={{ color: '#000080' }}>{username}</strong>
              </div>

              {claimedIdentity ? (
                <>
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: '#444', marginBottom: 12 }}>
                    this username is claimed and this browser remembers you automatically.
                  </div>

                  <div style={{
                    padding: '10px 11px',
                    background: '#efefef',
                    border: '1px solid #9a9a9a',
                    marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000080', marginBottom: 5 }}>
                      {hasPin ? 'PIN SET ✓' : 'OPTIONAL: CREATE A PIN'}
                    </div>
                    <div style={{ fontSize: 10, lineHeight: 1.5, color: '#555', marginBottom: 8 }}>
                      {hasPin
                        ? 'use a 6-digit PIN to sign into this username on another browser or device. enter a new one below if you want to change it.'
                        : 'want to use this username on another browser or device? create your own 6-digit PIN.'}
                    </div>

                    <input
                      className="input-retro"
                      style={{ width: '100%', marginBottom: 6, textAlign: 'center', letterSpacing: '.2em', fontSize: 16 }}
                      value={pinInput}
                      onChange={e => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinMessage('') }}
                      placeholder={hasPin ? 'new PIN' : '6-digit PIN'}
                      maxLength={6}
                      inputMode="numeric"
                    />
                    <input
                      className="input-retro"
                      style={{ width: '100%', marginBottom: 7, textAlign: 'center', letterSpacing: '.2em', fontSize: 16 }}
                      value={pinConfirm}
                      onChange={e => { setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinMessage('') }}
                      onKeyDown={e => e.key === 'Enter' && savePin()}
                      placeholder="confirm PIN"
                      maxLength={6}
                      inputMode="numeric"
                    />

                    {pinMessage && (
                      <div style={{
                        fontSize: 10,
                        marginBottom: 7,
                        color: pinMessage.includes('✓') ? '#006600' : '#800000',
                      }}>
                        {pinMessage}
                      </div>
                    )}

                    <button
                      className="btn-retro primary"
                      onClick={savePin}
                      disabled={pinInput.length !== 6 || pinConfirm.length !== 6 || pinSaving}
                      style={{
                        width: '100%',
                        opacity: pinInput.length === 6 && pinConfirm.length === 6 && !pinSaving ? 1 : .55,
                      }}
                    >
                      {pinSaving ? 'saving...' : hasPin ? 'change PIN' : 'save PIN'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-retro" onClick={chooseAnotherUsername} style={{ flex: 1 }}>
                      switch username
                    </button>
                    <button className="btn-retro" onClick={signOut} style={{ flex: 1 }}>
                      sign out
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: '#444', marginBottom: 14 }}>
                    guest session. <strong>{username}</strong> is temporary and is not reserved.
                  </div>

                  <button
                    className="btn-retro primary"
                    onClick={chooseAnotherUsername}
                    style={{ width: '100%', marginBottom: 8 }}
                  >
                    claim a username
                  </button>
                  <button className="btn-retro" onClick={signOut} style={{ width: '100%' }}>
                    sign out
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DM Windows */}
      {openDMs.map((dmUser) => (
        <DMWindow
          key={dmUser}
          currentUser={username}
          recipient={dmUser}
          onClose={() => closeDM(dmUser)}
          isMobile={isMobile}
          isEmbedded={isEmbedded}
        />
      ))}
    </div>
  )
}
