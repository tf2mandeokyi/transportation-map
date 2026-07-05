import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  root: 'src/ui/dev',
  plugins: [tsconfigPaths()],
});
