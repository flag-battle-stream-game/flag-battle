/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#0a0f1c',
        'bg-mid': '#17233b',
        'accent-gold': '#e8b23d',
        'accent-crimson': '#c13f3f',
        'accent-pink': '#ff3d68',
        ring: '#3e5c76',
        'text-soft': '#f0ebd8',
      },
      fontFamily: {
        serif: ['Georgia', 'Iowan Old Style', 'serif'],
      },
    },
  },
  plugins: [],
};
