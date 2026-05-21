import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary teal accent — gradient spans #00A896 → #00B4A2
        brand: {
          50:  '#e6f9f6',
          100: '#b3ebe3',
          200: '#80ddcf',
          300: '#4dcfbb',
          400: '#00B4A2',
          500: '#00A896',
          600: '#009487',
          700: '#007a6f',
          800: '#005f57',
          900: '#003d38',
        },
        // Primary text — dark charcoal / off-black
        ink: {
          DEFAULT: '#3A3A3C',
          800: '#424242',
          900: '#3A3A3C',
        },
        // Secondary / mute text — cool gray (the ".com" gray)
        mute: {
          DEFAULT: '#8E8E93',
          400: '#9A9A9A',
          500: '#8E8E93',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #00A896 0%, #00B4A2 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
