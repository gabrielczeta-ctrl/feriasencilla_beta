import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Realtime Party Wall',
  description: 'A collaborative realtime message wall powered by WebSocket + Redis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}