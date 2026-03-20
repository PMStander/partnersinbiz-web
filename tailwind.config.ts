/**
 * NOTE: This project uses Tailwind CSS v4. This file is NOT read by the Tailwind v4 engine.
 * All design tokens are defined in app/globals.css via the @theme block.
 * This file is kept as reference documentation only.
 */
import type { Config } from 'tailwindcss'

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
        'surface-container': '#1f1f1f',
        'surface-container-highest': '#353535',
        'on-secondary-container': '#e2e2e2',
        'primary-fixed': '#5d5f5f',
        'on-tertiary-container': '#000000',
        'surface-bright': '#393939',
        'primary-container': '#d4d4d4',
        'surface-container-low': '#1b1b1b',
        'on-error-container': '#ffdad6',
        'tertiary-fixed-dim': '#454747',
        'secondary-container': '#454747',
        'error': '#ffb4ab',
        'surface-variant': '#353535',
        'inverse-surface': '#e2e2e2',
        'outline-variant': '#474747',
        'on-secondary': '#1a1c1c',
        'background': '#000000',
        'on-surface': '#e2e2e2',
        'on-primary-container': '#000000',
        'on-tertiary-fixed-variant': '#e2e2e2',
        'on-tertiary-fixed': '#ffffff',
        'on-tertiary': '#1a1c1c',
        'primary': '#ffffff',
        'surface': '#000000',
        'secondary': '#c6c6c7',
        'on-secondary-fixed': '#1a1c1c',
        'primary-fixed-dim': '#454747',
        'on-primary': '#1a1c1c',
        'surface-tint': '#c6c6c7',
        'secondary-fixed': '#c6c6c7',
        'on-primary-fixed-variant': '#e2e2e2',
        'tertiary': '#e2e2e2',
        'surface-dim': '#000000',
        'inverse-primary': '#5d5f5f',
        'error-container': '#93000a',
        'outline': '#919191',
        'on-secondary-fixed-variant': '#3a3c3c',
        'on-background': '#e2e2e2',
        'surface-container-high': '#2a2a2a',
        'on-surface-variant': '#c6c6c6',
        'inverse-on-surface': '#303030',
        'tertiary-container': '#909191',
        'secondary-fixed-dim': '#aaabab',
        'surface-container-lowest': '#000000',
        'on-error': '#690005',
        'on-primary-fixed': '#ffffff',
        'tertiary-fixed': '#5d5f5f',
      },
      fontFamily: {
        headline: ['var(--font-space-grotesk)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        label: ['var(--font-inter)', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1.5rem',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
export default config
