import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        floor: {
          bg: '#090D16',
          surface: '#111827',
          card: '#1E293B',
          border: '#334155',
          accent: '#10B981',
          amber: '#F59E0B',
          danger: '#EF4444',
        },
      },
      minHeight: {
        glove: '56px',
        'glove-lg': '68px',
      },
    },
  },
  plugins: [],
};

export default config;
