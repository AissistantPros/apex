/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#070a0e',
        'bg-2': '#0c1118',
        'bg-3': '#111820',
        'bg-4': '#161f28',
        'b-1': '#1e2d3d',
        'b-2': '#2a3f54',
        'b-3': '#3a5570',
        'acc': '#00e5a0',
        'acc-2': '#0ea5e9',
        'acc-3': '#f97316',
        'acc-4': '#a78bfa',
        'tx': '#dde6ef',
        'tx-2': '#7a95aa',
        'tx-3': '#3d5870',
        'card': '#0d1520',
        'card-2': '#101c28',
      },
    },
  },
  plugins: [],
};
