// Minimal shapes of the request/response Vercel passes to a function (avoids the heavy @vercel/node package).
type VercelRequest = { method?: string; body?: unknown };
type VercelResponse = { setHeader(k: string, v: string): void; status(code: number): VercelResponse; json(body: unknown): void };
import type { ApiError, ApiErrorCode } from '../../src/shared/types';

const STATUS: Record<ApiErrorCode, number> = {
  bad_input: 400, repo_not_found: 404, devpost_unreadable: 422, live_ui_failed: 502,
  rate_limited: 429, overloaded: 503, no_verified_evidence: 502, failed: 500,
};

export class ApiException extends Error {
  constructor(public code: ApiErrorCode, message: string) { super(message); }
}

/** POST-only JSON handler. Any thrown ApiException becomes a typed ApiError; anything else is a generic failure. */
export function handle<TIn, TOut>(run: (body: TIn) => Promise<TOut>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).json({ error: 'bad_input', message: 'POST only.' } satisfies ApiError); return; }
    try {
      let body: unknown = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw new ApiException('bad_input', 'Body must be JSON.'); } }
      if (body === undefined || body === null || typeof body !== 'object') throw new ApiException('bad_input', 'Body must be a JSON object.');
      res.status(200).json(await run(body as TIn));
    } catch (e) {
      if (e instanceof ApiException) { res.status(STATUS[e.code]).json({ error: e.code, message: e.message } satisfies ApiError); return; }
      console.error('unhandled', e);
      res.status(500).json({ error: 'failed', message: 'Something went wrong on our side. Try again.' } satisfies ApiError);
    }
  };
}
