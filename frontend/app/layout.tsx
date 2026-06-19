import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Synthure — One clinical note. Four intelligent reports.',
  description:
    'Synthure is a multi-agent clinical AI engine. Drop in a single clinical note and watch specialized agents write tailored, verified reports for the patient, physician, hospital, and employer — in real time.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-[#05070f] text-slate-200 antialiased font-sans">
        {children}
      </body>
    </html>
  )
}
