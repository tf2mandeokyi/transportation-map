import { defineConfig, Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import * as path from 'path';
import * as fs from 'fs';

// Serves tmp/data.json (a real saved map, gitignored) to the dev UI so it can seed
// itself with real data instead of the fake fixture when the file is present.
function serveTmpData(): Plugin {
  const dataPath = path.resolve(__dirname, 'tmp/data.json');
  return {
    name: 'serve-tmp-data',
    configureServer(server) {
      server.middlewares.use('/__dev-data.json', (_req, res) => {
        if (fs.existsSync(dataPath)) {
          res.setHeader('Content-Type', 'application/json');
          res.end(fs.readFileSync(dataPath, 'utf-8'));
        } else {
          res.statusCode = 404;
          res.end();
        }
      });
    },
  };
}

export default defineConfig({
  root: 'src/dev-backend',
  plugins: [tsconfigPaths(), serveTmpData()],
});
