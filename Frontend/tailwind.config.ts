import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'asan-dark': '#111827',
        'asan-mid': '#2E7D4F',
        'asan-accent': '#53B175',
        'asan-accent-hover': '#479A63',
        'asan-accent-light': '#EAF7EE',
        'asan-warning': '#E09B2D',
        'asan-error': '#E74C3C',
        'asan-success': '#27AE60',
        'asan-text': '#111827',
        'asan-text-light': '#6B7280',
        'asan-bg': '#FFFFFF',
        'asan-surface': '#FFFFFF',
        'asan-border': '#E5E7EB',
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
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;