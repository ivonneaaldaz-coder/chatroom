import { useEffect, useRef } from 'react'
import { type Message, type SystemMessage, isSystemMessage } from '@/types'

type Entry = Message | SystemMessage

// Deterministic color per username
function usernameColor(name: string): string {
  const colors = [
    '#800000', '#000080', '#008000', '#800080',
    '#006666', '#664400', '#004466', '#660044',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

interface MessageFeedProps {
  entries: Entry[]
  currentUser: string
  onDM: (username: string) => void
}

export default function MessageFeed({ entries, currentUser, onDM }: MessageFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  return (
    <div
      className="panel-inset"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {entries.length === 0 && (
        <div style={{
          color: '#808080',
          fontSize: 12,
          fontStyle: 'italic',
          fontFamily: 'Courier New',
          padding: '8px 0',
        }}>
          — lobby is quiet. say something. —
        </div>
      )}

      {entries.map(entry => {
        if (isSystemMessage(entry)) {
          return (
            <div key={entry.id} style={{
              color: '#808080',
              fontSize: 11,
              fontFamily: 'Courier New',
              fontStyle: 'italic',
              padding: '2px 0',
            }}>
              *** {entry.content} ***
            </div>
          )
        }

        const isMe = entry.username === currentUser

        return (
          <div key={entry.id} style={{
            padding: '2px 0',
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 10,
              color: '#808080',
              fontFamily: 'Courier New',
              flexShrink: 0,
            }}>
              [{formatTime(entry.created_at)}]
            </span>
            <span
              onClick={() => !isMe && onDM(entry.username)}
              title={isMe ? undefined : `send ${entry.username} a private message`}
              style={{
                fontWeight: 'bold',
                color: isMe ? '#000080' : usernameColor(entry.username),
                fontFamily: 'Courier New',
                fontSize: 13,
                flexShrink: 0,
                cursor: isMe ? 'default' : 'pointer',
                textDecoration: isMe ? 'none' : 'underline',
                textUnderlineOffset: 2,
              }}
            >
              {entry.username}:
            </span>
            <span style={{
              fontFamily: 'Courier New',
              fontSize: 13,
              color: '#000000',
              wordBreak: 'break-word',
              flex: 1,
            }}>
              {entry.content}
            </span>
          </div>
        )
      })}

      <div ref={bottomRef} />
    </div>
  )
}
