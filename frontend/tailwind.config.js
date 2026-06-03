/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sigvaris: {
          blue: '#00305E',
          'blue-light': '#005A9C',
          'blue-pale': '#E8F0F8',
          red: '#C8001E',
        },
      },
    },
  },
  plugins: [],
}
