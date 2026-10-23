// Open http://localhost:3000/api/health to see which keys the server actually loaded. Shows yes/no only, never the keys.
type Res = { setHeader(k: string, v: string): void; status(c: number): Res; json(b: unknown): void };
export default function handler(_req: unknown, res: Res) {
  const has = (k: string) => (process.env[k] ? 'yes' : 'NO');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    GEMINI_API_KEY: has('GEMINI_API_KEY'),
    GEMINI_MODEL: process.env.GEMINI_MODEL || '(not set, default gemini-2.5-flash)',
    GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL || '(not set)',
    GITHUB_TOKEN: has('GITHUB_TOKEN'),
    PSI_API_KEY: has('PSI_API_KEY'),
    node: process.version,
  });
}
