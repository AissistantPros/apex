/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        serif: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs:   ['16px', { lineHeight: '1.5' }],
        sm:   ['16px', { lineHeight: '1.5' }],
        base: ['16px', { lineHeight: '1.6' }],
        lg:   ['18px', { lineHeight: '1.6' }],
        xl:   ['20px', { lineHeight: '1.5' }],
        '2xl':  ['24px', { lineHeight: '1.4' }],
        '3xl':  ['30px', { lineHeight: '1.3' }],
        '4xl':  ['36px', { lineHeight: '1.2' }],
      },
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
