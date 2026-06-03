import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '◈ Synthure',
  description: 'Clinical AI platform — four portals, one engine.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#04091a] text-slate-200 antialiased">
        {children}
      </body>
    </html>
  )
}
