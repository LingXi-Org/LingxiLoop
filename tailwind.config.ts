import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)'
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)'
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)'
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)'
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)'
        },
        app: 'var(--app)',
        panel: 'var(--panel)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        raised: {
          DEFAULT: 'var(--raised)',
          hover: 'var(--raised-hover)'
        },
        inset: 'var(--inset)',
        hairline: 'var(--hairline)',
        ink: {
          '100': 'var(--ink-100)',
          '200': 'var(--ink-200)',
          '300': 'var(--ink-300)',
          '500': 'var(--ink-500)',
          '700': 'var(--ink-700)',
          '900': 'var(--ink-900)',
          DEFAULT: 'var(--ink)',
          secondary: 'var(--ink-secondary)'
        },
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        skype: {
          DEFAULT: 'var(--skype)',
          deep: 'var(--skype-deep)',
          ink: 'var(--skype-ink)'
        },
        sky2: {
          '50': 'var(--sky2-50)',
          '100': 'var(--sky2-100)',
          '200': 'var(--sky2-200)',
          '300': 'var(--sky2-300)',
          glow: 'var(--sky2-glow)'
        },
        coral: {
          DEFAULT: 'var(--destructive)',
          soft: 'var(--coral-soft)',
          deep: 'var(--coral-deep)'
        },
        gold: {
          DEFAULT: 'var(--chart-1)',
          deep: 'var(--gold-deep)'
        },
        whisper: {
          '50': 'var(--whisper-50)',
          '100': 'var(--whisper-100)',
          '200': 'var(--whisper-200)',
          DEFAULT: 'var(--secondary-foreground)',
          deep: 'var(--whisper-deep)'
        },
        cloud: 'var(--cloud)',
        paper: 'var(--paper)',
        avail: 'var(--avail)',
        working: 'var(--working)',
        thinking: 'var(--thinking)',
        waiting: 'var(--waiting)',
        resting: 'var(--resting)'
      },
      fontFamily: {
        display: [
          'var(--font-heading)'
        ],
        body: [
          'var(--font-sans)'
        ],
        mono: [
          'JetBrains Mono',
          'monospace'
        ]
      },
      boxShadow: {
        window: '0 50px 100px -20px color-mix(in srgb, var(--foreground) 25%, transparent), 0 30px 60px -30px color-mix(in srgb, var(--foreground) 30%, transparent), 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent)',
        pop: '0 12px 28px -8px color-mix(in srgb, var(--foreground) 18%, transparent), 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent)',
        soft: '0 2px 8px -2px color-mix(in srgb, var(--foreground) 8%, transparent)'
      },
      animation: {
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
        rise: 'rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) backwards',
        drift: 'drift 40s ease-in-out infinite',
        'bounce-dot': 'bounce-dot 1.2s ease-in-out infinite',
        shine: 'shine 2s linear infinite',
        'fade-in': 'fade-in 200ms ease-out',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': {
            opacity: '1',
            transform: 'scale(1)'
          },
          '50%': {
            opacity: '0.4',
            transform: 'scale(0.7)'
          }
        },
        rise: {
          from: {
            opacity: '0',
            transform: 'translateY(8px)'
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)'
          }
        },
        drift: {
          '0%, 100%': {
            transform: 'translate(0, 0)'
          },
          '50%': {
            transform: 'translate(60px, 30px)'
          }
        },
        'bounce-dot': {
          '0%, 60%, 100%': {
            transform: 'translateY(0)',
            opacity: '0.5'
          },
          '30%': {
            transform: 'translateY(-4px)',
            opacity: '1'
          }
        },
        shine: {
          '0%': {
            transform: 'translateX(-100%)'
          },
          '100%': {
            transform: 'translateX(100%)'
          }
        },
        'fade-in': {
          from: {
            opacity: '0'
          },
          to: {
            opacity: '1'
          }
        },
        'slide-in-right': {
          from: {
            transform: 'translateX(100%)'
          },
          to: {
            transform: 'translateX(0)'
          }
        },
        'accordion-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-accordion-content-height)'
          }
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)'
          },
          to: {
            height: '0'
          }
        }
      }
    }
  },
  plugins: [],
}

export default config
