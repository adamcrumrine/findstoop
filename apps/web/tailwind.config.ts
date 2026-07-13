import type { Config } from 'tailwindcss'

export default {
  // packages/shared emits class strings too (e.g. paymentRails rowStatus
  // pills) — without scanning it, those classes only ship if an app file
  // happens to use the same ones.
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../packages/shared/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary accent. The 500/600 tokens are tuned for WCAG AA — white
        // text on `bg-brand-500` clears 4.5:1, and `text-brand-600` on white
        // clears 4.5:1, so the default button + link styles are accessible
        // without per-component overrides. The 50–400 light end is only ever
        // used as a background under dark text.
        // Values live as RGB-triplet CSS variables (src/index.css holds the
        // Stoop teal defaults; src/lib/brand.ts overwrites them at boot for
        // white-label builds selected via VITE_BRAND). Every brand's ramp
        // must clear the same AA bars.
        brand: {
          50:  'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)', // stoop: #008275 — 4.72:1 vs white
          600: 'rgb(var(--brand-600) / <alpha-value>)', // stoop: #006e62 — 6.17:1 vs white
          700: 'rgb(var(--brand-700) / <alpha-value>)', // stoop: #005951 — hover state
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        // Primary (broad-shading) palette — tenant-portal header/footer/nav.
        // Same variable + AA discipline as `brand`; defaults to the accent
        // unless a white-label landlord picks a distinct primary color.
        primary: {
          50:  'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)',
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
        // Decorative hero gradient — endpoints are brand variables too.
        'brand-gradient': 'linear-gradient(135deg, rgb(var(--brand-grad-from)) 0%, rgb(var(--brand-grad-to)) 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
