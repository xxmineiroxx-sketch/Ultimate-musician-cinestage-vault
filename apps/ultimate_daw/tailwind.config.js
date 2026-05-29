/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#020617', 900: '#0f172a', 800: '#1e293b', 700: '#334155' },
        indigo: { 600: '#4F46E5', 500: '#6366f1', 400: '#818cf8' },
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
};
