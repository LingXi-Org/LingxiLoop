import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        skype: {
          DEFAULT: '#00A8F0',
          deep: '#0078C8',
          ink: '#003B6F',
        },
        sky2: {
          50: '#F2FAFE',
          100: '#E1F3FD',
          200: '#C2E6FB',
          300: '#8FD3F7',
          glow: '#4FC2F4',
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
        ink: {
          900: '#0A1B2E',
          700: '#233A53',
          500: '#5B7186',
          300: '#94A8BC',
          200: '#C5D2DE',
          100: '#E5ECF2',
        },
        cloud: '#FFFFFF',
        paper: '#FAFCFE',
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
