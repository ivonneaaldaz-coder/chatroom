'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getNextSystemMessage, nextSystemMessageDelay } from '@/lib/systemMessages'
import { type Message, type SystemMessage, type Room } from '@/types'
import RoomList from './RoomList'
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
  }

  // ── Change room ───────────────────────────────────────
  function handleRoomChange(room: Room) {
    setCurrentRoom(room)
    setEntries([])
    setConnected(false)
  }

  // ── Leave ─────────────────────────────────────────────
  function handleLeave() {
    localStorage.removeItem('chatroom_username')
    router.push('/')
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
    }}>
      {/* Window chrome */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 0, overflow: 'hidden', minWidth: 0, width: '100%', background: '#c0c0c0', border: 'none' }}>

        {/* Title bar */}
        <div className="titlebar">
          <span>💬</span>
          <span className="titlebar-title">CHATROOM.exe — #{currentRoom}</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <div className="titlebar-btn" title="Minimize">_</div>
            <div className="titlebar-btn" title="Maximize">□</div>
            <div className="titlebar-btn" title="Leave" onClick={handleLeave}>✕</div>
          </div>
        </div>

        {/* Connection status — slim bar replacing menu */}
        <div style={{ background: '#d4d0c8', borderBottom: '1px solid #808080', padding: '2px 8px', fontSize: 11, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <span style={{ color: connected ? '#008000' : '#808080' }}>
            {connected ? '● connected' : '○ connecting...'}
          </span>
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
            <MessageInput onSend={handleSend} disabled={!connected} />
          </div>

          <UserList users={onlineUsers} currentUser={username} />
        </div>

        {/* Status bar */}
        <div className="statusbar">
          <div className="statusbar-section">
            #{currentRoom} · {onlineUsers.length} online
          </div>
          <div className="statusbar-section" style={{ flex: 'none' }}>
            {username}
          </div>
        </div>
      </div>


    </div>
  )
}
