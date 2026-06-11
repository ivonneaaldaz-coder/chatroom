import { useState, useRef } from 'react'
import { validateMessage, MAX_MESSAGE_LENGTH } from '@/lib/moderation'

interface MessageInputProps {
  onSend: (content: string) => Promise<void>
  disabled?: boolean
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSend() {
    const trimmed = value.trim()
    if (!trimmed || sending) return

    const result = validateMessage(trimmed)
    if (!result.ok) {
      if (result.error) setError(result.error)
      return
    }

    setSending(true)
    setError('')
    try {
      await onSend(trimmed)
      setValue('')
    } catch (e) {
      setError('failed to send — try again')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (error) setError('')
  }

  const charsLeft = MAX_MESSAGE_LENGTH - value.length
  const nearLimit = charsLeft < 60

  return (
    <div style={{
      background: '#f0f0f0',
      borderTop: '1px solid #808080',
      padding: '6px 8px',
      flexShrink: 0,
    }}>
      {error && (
        <div style={{
          fontSize: 11,
          color: '#800000',
          fontFamily: 'Courier New',
          marginBottom: 4,
          padding: '2px 4px',
          background: '#fff0f0',
          border: '1px solid #ffaaaa',
        }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          ref={inputRef}
          className="input-retro"
          style={{ flex: 1, fontSize: 13 }}
          value={value}
          onChange={e => { setValue(e.target.value); setError('') }}
          onKeyDown={handleKeyDown}
          placeholder="say something..."
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={disabled || sending}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="btn-retro"
          onClick={handleSend}
          disabled={disabled || sending || !value.trim()}
          style={{ flexShrink: 0, opacity: (!value.trim() || sending) ? 0.5 : 1 }}
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 3,
        fontSize: 10,
        color: '#808080',
        fontFamily: 'Courier New',
      }}>
        <span>press Enter to send</span>
        {nearLimit && (
          <span style={{ color: charsLeft < 20 ? '#800000' : '#808080' }}>
            {charsLeft} left
          </span>
        )}
      </div>
    </div>
  )
}
