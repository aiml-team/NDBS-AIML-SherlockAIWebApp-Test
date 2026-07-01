/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Surfaces (slightly warmer + cooler off-whites for depth)
        bg:  '#f8fafc',
        bg2: '#ffffff',
        bg3: '#f1f5f9',
        bd:  '#e2e8f0',
        bd2: '#cbd5e1',

        // ── Brand blue — shifted deeper, more enterprise / less "Tailwind starter"
        blue: {
          DEFAULT: '#1d4ed8',  // was #2563eb — primary actions, links
          lt:      '#eff6ff',
          mid:     '#bfdbfe',
          dark:    '#1e3a8a',  // was #1d4ed8 — pressed states, headlines
          ink:     '#172554',  // deepest blue, for high-emphasis text on light bg
        },

        // ── Teal kept (mostly unused but referenced by some legacy chips)
        teal: {
          DEFAULT: '#0e7490',
          lt:      '#ecfeff',
        },

        // ── Restrained semantic palette (less "alarm")
        green: {
          DEFAULT: '#15803d',  // was #059669 — calmer success
          lt:      '#f0fdf4',
          mid:     '#86efac',
          dark:    '#166534',
        },
        red: {
          DEFAULT: '#b91c1c',  // was #dc2626 — calmer danger
          lt:      '#fef2f2',
          mid:     '#fecaca',
        },
        amber: {
          DEFAULT: '#a16207',  // was #d97706 — calmer warning
          lt:      '#fefce8',
          mid:     '#fde68a',
          dark:    '#713f12',
        },

        // ── Ink — true near-black headings, slate body
        ink: {
          DEFAULT: '#020617',  // was #0f172a — slate-950 for premium contrast
          muted:   '#334155',
          soft:    '#64748b',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Multi-layer shadows — premium depth
        card:       '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        soft:       '0 4px 8px rgba(15, 23, 42, 0.04), 0 12px 24px rgba(15, 23, 42, 0.07)',
        modal:      '0 12px 24px rgba(15, 23, 42, 0.10), 0 36px 64px rgba(15, 23, 42, 0.16)',
        // Primary button — refined, less neon glow
        btnBlue:    '0 1px 2px rgba(29, 78, 216, 0.20), 0 6px 16px rgba(29, 78, 216, 0.28)',
        btnBlueLg:  '0 2px 4px rgba(29, 78, 216, 0.22), 0 10px 22px rgba(29, 78, 216, 0.34)',
        btnGreen:   '0 1px 2px rgba(21, 128, 61, 0.20), 0 6px 16px rgba(21, 128, 61, 0.26)',
        btnGreenLg: '0 2px 4px rgba(21, 128, 61, 0.22), 0 10px 22px rgba(21, 128, 61, 0.34)',
        // Hairline ring used for focus + subtle elevation
        ring:       '0 0 0 4px rgba(29, 78, 216, 0.14)',
      },
      keyframes: {
        'bounce-dot': {
          '0%, 80%, 100%': { transform: 'translateY(0)' },
          '40%':          { transform: 'translateY(-8px)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(-3px) scale(0.99)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'shimmer': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'bounce-dot': 'bounce-dot 1.2s infinite',
        'pop-in':     'pop-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer':    'shimmer 2.4s linear infinite',
      },
      backgroundImage: {
        // Deeper, slightly less saturated hero gradient
        'hero-gradient':
          'linear-gradient(135deg, #2563eb 0%, #1d4ed8 55%, #1e3a8a 100%)',
        'hero-noise':
          "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.045'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        'table-head': 'linear-gradient(90deg, #1d4ed8, #1e3a8a)',
        'btn-blue':   'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
        'btn-green':  'linear-gradient(180deg, #15803d 0%, #166534 100%)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
