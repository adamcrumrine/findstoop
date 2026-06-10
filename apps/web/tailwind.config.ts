import type { Config } from 'tailwindcss'

export default {
  // packages/shared emits class strings too (e.g. paymentRails rowStatus
  // pills) — without scanning it, those classes only ship if an app file
  // happens to use the same ones.
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../packages/shared/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary teal accent. The 500/600 tokens are tuned for WCAG AA — white
        // text on `bg-brand-500` clears 4.5:1, and `text-brand-600` on white
        // clears 4.5:1, so the default button + link styles are accessible
        // without per-component overrides. The 50–400 light end is unchanged
        // because it's only ever used as a background under dark text.
        // The hero `brand-gradient` keeps its original highlight values since
        // it's decorative and never carries body text.
        brand: {
          50:  '#e6f9f6',
          100: '#b3ebe3',
          200: '#80ddcf',
          300: '#4dcfbb',
          400: '#00B4A2',
          500: '#008275', // was #00A896 — 2.98:1 → 4.72:1 vs white
          600: '#006e62', // was #009487 — 3.76:1 → 6.17:1 vs white
          700: '#005951', // was #007a6f — kept dark for hover state
          800: '#003e39',
          900: '#002a26',
        },
        // Primary text — dark charcoal / off-black.
        ink: {
          DEFAULT: '#3A3A3C',
          800: '#424242',
          900: '#3A3A3C',
        },
        // Secondary text. Old "iOS systemGray" (#8E8E93) sits at 3.26:1 on
        // white — fails AA for body copy. Apple uses #6E6E73 for secondary
        // text on light surfaces; same family, 5.07:1.
        mute: {
          DEFAULT: '#6E6E73', // was #8E8E93
          400: '#828287',     // was #9A9A9A — 3.83:1 for large-text labels
          500: '#6E6E73',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #00A896 0%, #00B4A2 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
