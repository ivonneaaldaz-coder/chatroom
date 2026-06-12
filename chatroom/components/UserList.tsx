interface UserListProps {
  users: string[]
  currentUser: string
}

// Stable color palette for usernames — deterministic based on string
function usernameColor(name: string): string {
  const colors = [
    '#800000', '#000080', '#008000', '#800080',
    '#006666', '#664400', '#004466', '#660044',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function UserList({ users, currentUser }: UserListProps) {
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
        {users.map(user => (
          <div
            key={user}
            style={{
              padding: '4px 16px 4px 10px',
              fontSize: 12,
              fontFamily: 'Courier New',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{ color: '#008000', fontSize: 10 }}>●</span>
            <span
              style={{
                color: usernameColor(user),
                fontWeight: user === currentUser ? 'bold' : 'normal',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user}
            </span>
            {user === currentUser && (
              <span style={{ fontSize: 9, color: '#808080' }}>(you)</span>
            )}
          </div>
        ))}
      </div>

      <div style={{
        padding: '3px 8px',
        fontSize: 10,
        color: '#808080',
        borderTop: '1px solid #c0c0c0',
        flexShrink: 0,
      }}>
        {users.length} online
      </div>
    </div>
  )
}
