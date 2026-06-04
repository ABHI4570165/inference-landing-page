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
        brand: {
          50: '#f0f9f0',
          100: '#dcf0dc',
          200: '#bce2bc',
          300: '#8dcc8d',
          400: '#5aaf5a',
          500: '#3a9a3a',
          600: '#2d7d2d',
          700: '#266326',
          800: '#234f23',
          900: '#1e421e',
        },
        gold: {
          400: '#f5c842',
          500: '#e6b800',
          600: '#cc9f00',
        }
      }
    }
  },
  plugins: []
}
