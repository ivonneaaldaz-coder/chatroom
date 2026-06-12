'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { validateMessage } from '@/lib/moderation'
import EmojiPicker from './EmojiPicker'

interface DMMessage {
  id: string
  from_username: string
  to_username: string
  content: string
  created_at: string
}

interface DMWindowProps {
  currentUser: string
  recipient: string
  onClose: () => void
  isMobile: boolean
}

function conversationId(a: string, b: string) {
  return a < b ? `${a}::${b}` : `${b}::${a}`
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function DMWindow({ currentUser, recipient, onClose, isMobile }: DMWindowProps) {
  const [messages, setMessages] = useState<DMMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const convId = conversationId(currentUser, recipient)

  // Load history
  useEffect(() => {
    supabase
      .from('dm_messages')
      .select('*')
      .eq('conversation_id', convId)
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .limit(60)
      .then(({ data }) => setMessages((data ?? []) as DMMessage[]))
  }, [convId])

  // Subscribe to realtime
  useEffect(() => {
    const channel = supabase
      .channel(`dm:${convId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as DMMessage])
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [convId])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleEmojiSelect(emoji: string) {
    setInput(prev => prev + emoji)
  }

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || sending) return

    const result = validateMessage(trimmed)
    if (!result.ok) { if (result.error) setError(result.error); return }

    setSending(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('dm_messages')
        .insert({ from_username: currentUser, to_username: recipient, content: trimmed })
      if (err) throw err
      setInput('')
    } catch {
      setError('failed to send')
    } finally {
      setSending(false)
    }
  }

  const windowStyle: React.CSSProperties = isMobile ? {
    // Mobile: bottom sheet — narrower, centered, slides up from bottom
    position: 'absolute',
    bottom: 0,
    left: '4%',
    right: '4%',
    width: '92%',
    height: '52%',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    background: '#c0c0c0',
    overflow: 'hidden',
    borderTop: '2px solid #ffffff',
    borderLeft: '2px solid #ffffff',
    borderRight: '2px solid #404040',
    boxShadow: '0 -4px 20px rgba(0,0,0,0.35)',
  } : {
    // Desktop: Yahoo-style PM window bottom-right
    position: 'fixed',
    bottom: 40,
    right: 20,
    width: 320,
    height: 340,
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    background: '#c0c0c0',
    boxShadow: '4px 4px 0 rgba(0,0,0,0.4)',
    borderTop: '2px solid #ffffff',
    borderLeft: '2px solid #ffffff',
    borderRight: '2px solid #404040',
    borderBottom: '2px solid #404040',
  }

  return (
    <div style={windowStyle}>
      {/* Title bar — slim on mobile since lab tbar is above */}
      <div className="titlebar" style={{ flexShrink: 0, fontSize: isMobile ? 12 : undefined, padding: isMobile ? '2px 6px' : undefined }}>
        <span>💬</span>
        <span className="titlebar-title" style={{ fontSize: isMobile ? 11 : undefined }}>
          {isMobile ? recipient : `${recipient} — private message`}
        </span>
        <div className="titlebar-btn" onClick={onClose}>✕</div>
      </div>

      {/* Disclaimer */}
      <div style={{
        background: '#fffbe6',
        borderBottom: '1px solid #c8c800',
        padding: '2px 8px',
        fontSize: 10,
        fontFamily: 'Courier New',
        color: '#666600',
        flexShrink: 0,
      }}>
        *** private channel — not end-to-end encrypted ***
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '8px 10px',
        background: '#ffffff',
        borderTop: '1px solid #808080',
        borderLeft: '1px solid #808080',
        borderRight: '1px solid #ffffff',
        borderBottom: '1px solid #ffffff',
        margin: '4px 4px 0 4px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        WebkitOverflowScrolling: 'touch',
      }}>
        {messages.length === 0 && (
          <div style={{ color: '#808080', fontSize: 11, fontStyle: 'italic', fontFamily: 'Courier New' }}>
            — start a conversation —
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.from_username === currentUser
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#808080', fontFamily: 'Courier New', flexShrink: 0 }}>
                [{formatTime(msg.created_at)}]
              </span>
              <span style={{
                fontFamily: 'Courier New',
                fontSize: 13,
                fontWeight: 'bold',
                color: isMe ? '#000080' : '#800000',
                flexShrink: 0,
              }}>
                {msg.from_username}:
              </span>
              <span style={{ fontFamily: 'Courier New', fontSize: 13, wordBreak: 'break-word', flex: 1 }}>
                {msg.content}
              </span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '4px 4px 8px 4px', flexShrink: 0, background: '#c0c0c0' }}>
        {error && (
          <div style={{ fontSize: 10, color: '#800000', fontFamily: 'Courier New', marginBottom: 2 }}>
            ⚠ {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
          <EmojiPicker onSelect={handleEmojiSelect} isMobile={isMobile} />
          <input
            className="input-retro"
            style={{ flex: 1, fontSize: isMobile ? 16 : 13 }}
            value={input}
            onChange={e => { setInput(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={`message ${recipient}...`}
            maxLength={500}
            disabled={sending}
            />
          <button
            className="btn-retro"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{ flexShrink: 0, opacity: !input.trim() ? 0.5 : 1 }}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
