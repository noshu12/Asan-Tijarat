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
        'asan-dark': '#2B2118',
        'asan-mid': '#5C4632',
        'asan-accent': '#8C6D1F',
        'asan-accent-hover': '#755A18',
        'asan-accent-light': '#F3EAD3',
        'asan-warning': '#E09B2D',
        'asan-error': '#E74C3C',
        'asan-success': '#27AE60',
        'asan-text': '#2B2118',
        'asan-text-light': '#8A7F70',
        'asan-bg': '#FBF7EE',
        'asan-surface': '#FFFFFF',
        'asan-border': '#EDE3CE',
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
        sans: ['Fraunces', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
export default config;