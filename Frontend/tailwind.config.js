/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'asan-dark': '#0B3D2E',
        'asan-mid': '#1A6B4A',
        'asan-accent': '#27AE7A',
        'asan-accent-hover': '#219668',
        'asan-warning': '#E09B2D',
        'asan-error': '#E74C3C',
        'asan-success': '#27AE60',
        'asan-text': '#1A202C',
        'asan-text-light': '#718096',
        'asan-bg': '#FFFFFF',
        'asan-surface': '#F7FAFC',
        'asan-border': '#E2E8F0',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

