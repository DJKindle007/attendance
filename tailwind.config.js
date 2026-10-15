/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Kindle Education palette (see docs/DECISIONS.md, "Look")
        brand: '#ff6300',
        control: '#c94a00',
        accent: '#2f6b6a',
        'accent-soft': '#e6f0ef',
        paper: '#faf9f5',
        panel: '#ffffff',
        ink: '#33383a',
        muted: '#6d7375',
        line: '#e6e3dc',
        warn: '#fdf2e3',
        'warn-ink': '#92400e',
        bad: '#f7e5e1',
        'bad-ink': '#8a2c1b',
      },
      fontFamily: { sans: ['Montserrat', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
