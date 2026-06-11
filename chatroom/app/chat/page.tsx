'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ChatWindow from '@/components/ChatWindow'

export default function ChatPage() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('chatroom_username')
    if (!saved) {
      router.push('/')
      return
    }
    setUsername(saved)
  }, [router])

  if (!username) return null

  return <ChatWindow username={username} />
}
