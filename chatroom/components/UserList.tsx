import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UserListProps {
  users: string[]
  currentUser: string
  onDM: (username: string) => void
  unreadFrom: string[]
  recentContacts: string[]
  onRemoveRecent: (user: string) => void
}

function usernameColor(name: string): string {
  const colors = ['#800000','#000080','#008000','#800080','#006666','#664400','#004466','#660044']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function UserList({ users, currentUser, onDM, unreadFrom, recentContacts, onRemoveRecent }: UserListProps) {
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
                background: hasUnread ? '#fff0cc' : 'transparent',
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
                <span style={{
                  fontSize: 9,
                  color: '#ffffff',
                  background: '#cc0000',
                  padding: '1px 4px',
                  fontFamily: 'Courier New',
                  fontWeight: 'bold',
                  flexShrink: 0,
                  animation: 'blink 0.8s step-end infinite',
                  letterSpacing: '0.02em',
                }}>NEW</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Recent contacts — offline users you've DM'd before */}
      {recentContacts.filter(u => !users.includes(u) && u !== currentUser).length > 0 && (
        <>
          <div style={{
            padding: '3px 8px',
            background: '#e0e0e0',
            fontSize: 10,
            fontWeight: 'bold',
            letterSpacing: '0.06em',
            color: '#606060',
            borderTop: '1px solid #c0c0c0',
            flexShrink: 0,
          }}>
            RECENT
          </div>
          {recentContacts.filter(u => !users.includes(u) && u !== currentUser).map(user => (
            <div
              key={user}
              style={{
                padding: '4px 14px 4px 10px',
                fontSize: 12,
                fontFamily: 'Courier New',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: unreadFrom.includes(user) ? '#fff0cc' : 'transparent',
              }}
            >
              <span style={{ color: '#aaaaaa', fontSize: 10, flexShrink: 0 }}>○</span>
              <span
                onClick={() => onDM(user)}
                style={{
                  color: '#888888',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  cursor: 'pointer',
                }}
              >
                {user}
              </span>
              {unreadFrom.includes(user) ? (
                <span onClick={() => onDM(user)} style={{
                  fontSize: 9, color: '#ffffff', background: '#cc0000',
                  padding: '1px 4px', fontWeight: 'bold', flexShrink: 0,
                  cursor: 'pointer',
                  animation: 'blink 0.8s step-end infinite',
                }}>NEW</span>
              ) : (
                <span style={{ fontSize: 9, color: '#aaaaaa', flexShrink: 0 }}>offline</span>
              )}
              <span
                onClick={(e) => { e.stopPropagation(); onRemoveRecent(user); }}
                title="remove"
                style={{
                  fontSize: 10,
                  color: '#cccccc',
                  cursor: 'pointer',
                  flexShrink: 0,
                  padding: '0 2px',
                  lineHeight: 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#cc0000')}
                onMouseLeave={e => (e.currentTarget.style.color = '#cccccc')}
              >✕</span>
            </div>
          ))}
        </>
      )}

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
