import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UserListProps {
  users: string[]
  currentUser: string
  onDM: (username: string) => void
  unreadFrom: string[]
}

function usernameColor(name: string): string {
  const colors = ['#800000','#000080','#008000','#800080','#006666','#664400','#004466','#660044']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function UserList({ users, currentUser, onDM, unreadFrom }: UserListProps) {
  return (
    <div style={{
      width: 180,
      minWidth: 140,
      maxWidth: 180,
      flexShrink: 1,
      background: '#f0f0f0',
      borderLeft: '1px solid #808080',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }} className="sidebar-right">
      <div style={{
        padding: '4px 8px',
        background: '#000080',
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: '0.06em',
        flexShrink: 0,
      }}>
        ONLINE NOW
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {users.length === 0 && (
          <div style={{ padding: '6px 10px', fontSize: 11, color: '#808080', fontStyle: 'italic' }}>
            nobody here yet
          </div>
        )}
        {users.map(user => {
          const isMe = user === currentUser
          const hasUnread = unreadFrom.includes(user)
          return (
            <div
              key={user}
              onClick={() => !isMe && onDM(user)}
              title={isMe ? undefined : `send ${user} a private message`}
              style={{
                padding: '4px 14px 4px 10px',
                fontSize: 12,
                fontFamily: 'Courier New',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: isMe ? 'default' : 'pointer',
                background: hasUnread ? '#fffbe6' : 'transparent',
              }}
            >
              <span style={{ color: '#008000', fontSize: 10, flexShrink: 0 }}>●</span>
              <span style={{
                color: usernameColor(user),
                fontWeight: isMe ? 'bold' : 'normal',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {user}
              </span>
              {isMe && (
                <span style={{ fontSize: 9, color: '#808080', flexShrink: 0 }}>(you)</span>
              )}
              {hasUnread && !isMe && (
                <span style={{ fontSize: 9, color: '#cc6600', flexShrink: 0, animation: 'blink 1s step-end infinite' }}>●</span>
              )}
              {!isMe && !hasUnread && (
                <span style={{ fontSize: 9, color: '#aaaaaa', flexShrink: 0, opacity: 0 }}>✉</span>
              )}
            </div>
          )
        })}
      </div>

      <div style={{
        padding: '3px 8px',
        fontSize: 10,
        color: '#808080',
        borderTop: '1px solid #c0c0c0',
        flexShrink: 0,
      }}>
        {users.length} online · click to DM
      </div>
    </div>
  )
}
