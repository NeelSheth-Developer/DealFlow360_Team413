/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        accent: {
          pink: '#ec4899',
          indigo: '#6366f1',
          teal: '#14b8a6',
          amber: '#f59e0b',
        },
        ink: {
          DEFAULT: '#1e1033',
          soft: '#4b3b6b',
          muted: '#7c6f93',
        },
        surface: {
          base: '#faf9ff',
          raised: '#ffffff',
        },
        state: {
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          info: '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        glass: '1.25rem',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(124,58,237,.08)',
        'glass-strong': '0 12px 40px rgba(124,58,237,.14)',
        'glass-hover': '0 16px 48px rgba(124,58,237,.16)',
      },
      backgroundImage: {
        'grad-hero': 'linear-gradient(135deg, #ede9fe 0%, #f5f3ff 45%, #ffe4f3 100%)',
        'grad-brand': 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
        'grad-cta': 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
      },
      keyframes: {
        blobFloat: {
          '0%, 100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(30px,-40px) scale(1.12)' },
          '66%': { transform: 'translate(-25px,25px) scale(.94)' },
        },
        pulseValue: {
          '0%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        blobFloat: 'blobFloat 18s ease-in-out infinite',
        pulseValue: 'pulseValue .45s ease-out',
        shimmer: 'shimmer 1.6s infinite',
        slideUp: 'slideUp .25s ease-out',
      },
    },
  },
  plugins: [],
};
