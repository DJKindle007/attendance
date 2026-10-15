import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  globalIgnores(['.next/**', 'node_modules/**', 'drizzle/**']),
  {
    rules: {
      // The school logo is a small external PNG; next/image would need remotePatterns for no gain.
      '@next/next/no-img-element': 'off',
    },
  },
]);
