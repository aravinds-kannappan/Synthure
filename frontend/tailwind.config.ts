import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Synthure design system
        navy:    { DEFAULT: '#04091a', surface: '#0d1525', elevated: '#162035' },
        teal:    { DEFAULT: '#00e5c3', muted: '#00b89e' },
        indigo:  { DEFAULT: '#818cf8', muted: '#6366f1' },
        amber:   { DEFAULT: '#fbbf24' },
        success: { DEFAULT: '#34d399' },
        error:   { DEFAULT: '#f87171' },
        violet:  { DEFAULT: '#a78bfa' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
