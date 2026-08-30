/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        frost: '#22d3ee',
        leaf: '#34d399',
        ember: '#f97316',
      },
      boxShadow: {
        panel: '0 10px 30px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
}
