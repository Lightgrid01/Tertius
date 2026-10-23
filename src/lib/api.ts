import type {
  ApiError, CheckInputsRequest, CheckInputsResponse, ClaimCheckRequest, ClaimCheckResponse,
  JudgeRepoRequest, JudgeRepoResponse, JudgeUiRequest, JudgeUiResponse,
} from '../shared/types';

/** Thrown for every failed call, always carrying the typed ApiError. */
export class ApiCallError extends Error {
  constructor(public api: ApiError) { super(api.message); }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(175_000) });
  } catch {
    throw new ApiCallError({ error: 'failed', message: 'Couldn’t reach the server. Check your connection and retry.' });
  }
  let json: unknown = null;
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (res.ok && json) return json as T;
  const e = json as Partial<ApiError> | null;
  if (e && typeof e.error === 'string' && typeof e.message === 'string') throw new ApiCallError(e as ApiError);
  if (res.status === 404) throw new ApiCallError({ error: 'failed', message: 'The review functions aren’t running. Start the app with npm run dev.' });
  if (res.status === 504 || res.status === 408) throw new ApiCallError({ error: 'failed', message: 'The review took too long and was stopped. Retry.' });
  throw new ApiCallError({ error: 'failed', message: 'Something went wrong on the server. Retry.' });
}

export const api = {
  checkInputs: (b: CheckInputsRequest) => post<CheckInputsResponse>('check-inputs', b),
  judgeRepo: (b: JudgeRepoRequest) => post<JudgeRepoResponse>('judge-repo', b),
  judgeUi: (b: JudgeUiRequest) => post<JudgeUiResponse>('judge-ui', b),
  claimCheck: (b: ClaimCheckRequest) => post<ClaimCheckResponse>('claim-check', b),
};
