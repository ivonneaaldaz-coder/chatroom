import { ROOMS, type Room } from '@/types'

interface RoomListProps {
  currentRoom: Room
  onRoomChange: (room: Room) => void
}

export default function RoomList({ currentRoom, onRoomChange }: RoomListProps) {
  return (
    <div style={{
      width: 140,
      flexShrink: 0,
      background: '#f0f0f0',
      borderRight: '1px solid #808080',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }} className="sidebar-left">

      {/* Header — hidden on mobile via CSS */}
      <div style={{
        padding: '4px 8px',
        background: '#000080',
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: '0.06em',
        flexShrink: 0,
      }}>
        CHAT ROOMS
      </div>

      {/* Room list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {ROOMS.map(room => (
          <div
            key={room.id}
            className="room-item-mobile"
            onClick={() => room.live && onRoomChange(room.id)}
            style={{
              padding: '5px 10px',
              fontSize: 12,
              fontFamily: 'Courier New',
              cursor: room.live ? 'default' : 'not-allowed',
              background: currentRoom === room.id ? '#000080' : 'transparent',
              color: currentRoom === room.id
                ? '#ffffff'
                : room.live ? '#000000' : '#b0b0b0',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {room.label}
            {!room.live && (
              <span style={{
                fontSize: 9,
                color: '#aaaaaa',
                marginLeft: 'auto',
                fontFamily: 'Courier New',
                fontStyle: 'italic',
              }}>
                soon
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
