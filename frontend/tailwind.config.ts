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
        navy: { DEFAULT: '#05070f', surface: '#0b1220', elevated: '#121b2e' },
        teal: { DEFAULT: '#2dd4bf', muted: '#14b8a6' },
        indigo: { DEFAULT: '#818cf8', muted: '#6366f1' },
        amber: { DEFAULT: '#fbbf24' },
        success: { DEFAULT: '#34d399' },
        error: { DEFAULT: '#f87171' },
        violet: { DEFAULT: '#a78bfa' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.5s linear infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
