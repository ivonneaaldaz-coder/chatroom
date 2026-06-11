import type { Metadata } from 'next'
import '../styles/retro.css'

export const metadata: Metadata = {
  title: 'CHATROOM.exe',
  description: 'A small corner of the internet for curious people.',
  openGraph: {
    title: 'CHATROOM.exe',
    description: 'No algorithms. No optimization. No funnels. Just people hanging out.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="scanlines" />
        {children}
      </body>
    </html>
  )
}
