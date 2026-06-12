export type Room = 'lobby' | 'artists' | 'builders' | 'marketers' | 'travelers' | 'random'

export interface Message {
  id: string
  room: Room
  username: string
  content: string
  created_at: string
  deleted: boolean
}

export interface SystemMessage {
  id: string
  content: string
  type: 'system'
}

export type ChatEntry = Message | SystemMessage

export function isSystemMessage(entry: ChatEntry): entry is SystemMessage {
  return (entry as SystemMessage).type === 'system'
}

export const ROOMS: { id: Room; label: string; live: boolean }[] = [
  { id: 'lobby',     label: '# lobby',     live: true  },
  { id: 'artists',   label: '# artists',   live: true },
  { id: 'builders',  label: '# builders',  live: true },
  { id: 'marketers', label: '# marketers', live: true },
  { id: 'travelers', label: '# travelers', live: true },
  { id: 'random',    label: '# random',    live: true },
]
