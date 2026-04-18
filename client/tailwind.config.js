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
          dark: '#070b12',
          cream: '#f2f8ff',
          light: '#dce9f8',
          surface100: '#0b1220',
          surface200: '#101a29',
          surface300: '#162235',
          surface400: '#1b2a40',
          surface500: '#21324d',
          orange: '#67c8ff',
          gold: '#c08532',
          error: '#cf2d56',
          success: '#1f8a65',
        },
        paypal: '#003087',
        cashapp: '#00D632',
        discord: '#5865F2',
      },
      fontFamily: {
        gothic: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        system: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
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
