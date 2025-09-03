'use client';

import type { Metadata } from 'next'
import './globals.css'
import { GameStateProvider } from './contexts/GameStateContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <GameStateProvider>
          {children}
        </GameStateProvider>
      </body>
    </html>
  )
}