import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: 'var(--app)',
        panel: 'var(--panel)',
        card: 'var(--card)',
        raised: {
          DEFAULT: 'var(--raised)',
          hover: 'var(--raised-hover)',
        },
        inset: 'var(--inset)',
        hairline: 'var(--hairline)',
        ink: {
          DEFAULT: 'var(--ink)',
          secondary: 'var(--ink-secondary)',
          900: 'var(--ink-900)',
          700: 'var(--ink-700)',
          500: 'var(--ink-500)',
          300: 'var(--ink-300)',
          200: 'var(--ink-200)',
          100: 'var(--ink-100)',
        },
        accent: 'var(--accent)',
        skype: {
          DEFAULT: 'var(--skype)',
          deep: 'var(--skype-deep)',
          ink: 'var(--skype-ink)',
        },
        sky2: {
          50: 'var(--sky2-50)',
          100: 'var(--sky2-100)',
          200: 'var(--sky2-200)',
          300: 'var(--sky2-300)',
          glow: 'var(--sky2-glow)',
        },
        coral: {
          DEFAULT: '#FF7A6B',
          soft: '#FFD9D2',
          deep: '#C84E3F',
        },
        gold: {
          DEFAULT: '#F4B740',
          deep: '#BA8418',
        },
        whisper: {
          DEFAULT: '#7C5CFF',
          deep: '#4A2D9E',
          50: '#F6F3FF',
          100: '#ECE5FF',
          200: '#D9CCFF',
        },
        cloud: 'var(--cloud)',
        paper: 'var(--paper)',
        avail: '#6EC56A',
        working: '#F4B740',
        thinking: '#7C5CFF',
        waiting: '#FF7A6B',
        resting: '#B8C4D1',
      },
      fontFamily: {
        display: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        window: '0 50px 100px -20px rgba(10, 30, 60, 0.25), 0 30px 60px -30px rgba(10, 30, 60, 0.3), 0 0 0 1px rgba(0, 80, 140, 0.06)',
        pop: '0 12px 28px -8px rgba(0, 80, 140, 0.18), 0 0 0 1px rgba(0, 80, 140, 0.06)',
        soft: '0 2px 8px -2px rgba(10, 30, 60, 0.08)',
      },
      animation: {
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
        'rise': 'rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) backwards',
        'drift': 'drift 40s ease-in-out infinite',
        'bounce-dot': 'bounce-dot 1.2s ease-in-out infinite',
        'shine': 'shine 2s linear infinite',
        'fade-in': 'fade-in 200ms ease-out',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.7)' },
        },
        'rise': {
          'from': { opacity: '0', transform: 'translateY(8px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        'drift': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(60px, 30px)' },
        },
        'bounce-dot': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.5' },
          '30%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        'shine': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in': {
          'from': { opacity: '0' },
          'to':   { opacity: '1' },
        },
        'slide-in-right': {
          'from': { transform: 'translateX(100%)' },
          'to':   { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
