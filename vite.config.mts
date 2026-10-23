import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Local development only: serves the /api functions inside the Vite dev server, so `npm run dev`
 * runs the page and the review functions together (no Vercel CLI, login or network needed).
 * On Vercel the real functions in /api run as usual; this plugin does nothing in a build.
 */
function localApi(): Plugin {
  return {
    name: 'tertius-local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const name = (req.url ?? '/').split('?')[0].replace(/^\/+|\/+$/g, '');
        if (!/^[a-z-]+$/.test(name)) { res.statusCode = 404; res.end('Not found'); return; }
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const raw = Buffer.concat(chunks).toString('utf8');
          const r = req as typeof req & { body?: unknown };
          try { r.body = raw ? JSON.parse(raw) : undefined; } catch { r.body = raw; }
          const out = res as typeof res & { status: (c: number) => typeof out; json: (b: unknown) => void };
          out.status = (c: number) => { res.statusCode = c; return out; };
          out.json = (b: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)); };
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          await mod.default(r, out);
        } catch (e) {
          console.error('[api]', e);
          res.statusCode = 404; res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'failed', message: `No function named “${name}”, or it failed to load.` }));
        }
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Make .env.local keys (GEMINI_API_KEY, GITHUB_TOKEN, PSI_API_KEY ...) visible to the functions while developing.
  if (command === 'serve') {
    const env = loadEnv(mode, process.cwd(), '');
    for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  }
  return {
    plugins: [react(), localApi()],
    test: { include: ['src/**/*.test.ts', 'api/**/*.test.ts'], environment: 'node' },
  };
});
