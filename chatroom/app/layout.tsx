import type { Metadata } from 'next'
import Script from 'next/script'
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
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-8YDD0YJ4MX"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-8YDD0YJ4MX');
        `}</Script>
      </head>
      <body>
        <div className="scanlines" />
        {children}
      </body>
    </html>
  )
}
