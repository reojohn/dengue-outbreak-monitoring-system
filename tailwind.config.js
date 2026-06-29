/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#173B63',
          blue: '#2D6EA3',
          teal: '#2E8795',
          green: '#4D9A69',
          orange: '#E29A3B',
          red: '#D56A6A',
          bg: '#F7F9FC',
          panel: '#FFFFFF',
          line: '#E4EBF2',
          text: '#223548',
          muted: '#66778A',
        },
      },
      boxShadow: {
        soft: '0 10px 30px rgba(23, 59, 99, 0.08)',
        panel: '0 6px 18px rgba(17, 40, 70, 0.08)',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
}