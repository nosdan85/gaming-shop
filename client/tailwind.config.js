/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cursor: {
          dark: '#26251e',
          cream: '#f2f1ed',
          light: '#e6e5e0',
          surface100: '#f7f7f4',
          surface200: '#f2f1ed',
          surface300: '#ebeae5',
          surface400: '#e6e5e0',
          surface500: '#e1e0db',
          orange: '#f54e00',
          gold: '#c08532',
          error: '#cf2d56',
          success: '#1f8a65',
        },
        paypal: '#003087',
        cashapp: '#00D632',
        discord: '#5865F2',
      },
      fontFamily: {
        gothic: ['Oswald', 'system-ui', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Libre Baskerville', 'Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        system: ['system-ui', '-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        micro: '1.5px',
        sm: '2px',
        md: '4px',
        DEFAULT: '8px',
        featured: '10px',
        pill: '9999px',
      },
    },
  },
  plugins: [],
}
