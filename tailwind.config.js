/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          main: '#0a0a0a',
          card: '#111111',
          sidebar: '#0d0d0d',
        },
        border: {
          DEFAULT: '#1f1f1f',
        },
        text: {
          primary: '#ffffff',
          muted: '#6b7280',
        },
        brand: {
          blue: '#3b82f6',
          green: '#22c55e',
          red: '#ef4444',
          orange: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
}
