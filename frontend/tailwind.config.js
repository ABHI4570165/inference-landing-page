/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Playfair Display"', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        // Deep professional green — the primary brand ramp. 600/700 carry
        // buttons and active states, 800/900 the navigation shell.
        brand: {
          50:  '#f1f8f4',
          100: '#dcefe3',
          200: '#b8dfc8',
          300: '#87c8a5',
          400: '#51ab7e',
          500: '#2f9260',
          600: '#1f7a4d',
          700: '#186240',
          800: '#154e35',
          900: '#103d2a',
          950: '#082a1c',
        },
        // Neutral surfaces — very light, slightly cool. Keeps large areas
        // calm so the green reads as an accent rather than a wash.
        surface: {
          50:  '#fafbfc',
          100: '#f4f6f8',
          200: '#eceff3',
          300: '#e1e6ec',
        },
        // Dark charcoal/navy for type, instead of pure black.
        ink: {
          400: '#7c8798',
          500: '#5c6779',
          600: '#445063',
          700: '#334155',
          800: '#1e293b',
          900: '#111a2b',
        },
        gold: {
          400: '#f5c842',
          500: '#e6b800',
          600: '#cc9f00',
        }
      },
      boxShadow: {
        card:  '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        lift:  '0 4px 6px -2px rgb(16 24 40 / 0.04), 0 12px 20px -4px rgb(16 24 40 / 0.10)',
        panel: '0 8px 32px -8px rgb(16 24 40 / 0.16)',
      },
      keyframes: {
        fadeIn:   { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeUp:   { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:  { '0%': { opacity: '0', transform: 'scale(.97)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        slideIn:  { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
        shimmer:  { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in':  'fadeIn .2s ease-out both',
        'fade-up':  'fadeUp .32s cubic-bezier(.22,.9,.32,1) both',
        'scale-in': 'scaleIn .18s cubic-bezier(.22,.9,.32,1) both',
        'slide-in': 'slideIn .24s cubic-bezier(.22,.9,.32,1) both',
      }
    }
  },
  plugins: []
}
