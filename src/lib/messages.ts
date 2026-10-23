import type { ApiError, ApiErrorCode, Evidence, ClaimSource } from '../shared/types';

export const ERROR_LABEL: Record<ApiErrorCode, string> = {
  repo_not_found: 'repo not found or private',
  bad_input: 'that input doesn’t look right',
  live_ui_failed: 'couldn’t load the live UI',
  rate_limited: 'rate limited',
  overloaded: 'the reviewer is overloaded',
  no_verified_evidence: 'no evidence could be verified',
  devpost_unreadable: 'couldn’t read that Devpost page',
  failed: 'something went wrong',
};
export const errorLabel = (e?: ApiError): string => (e ? ERROR_LABEL[e.error] ?? ERROR_LABEL.failed : ERROR_LABEL.failed);

export const SOURCE_LABEL: Record<ClaimSource, string> = {
  devpost: 'Devpost description', readme: 'README', github: 'GitHub description',
};

export const evidenceText = (ev: Evidence): string =>
  ev.kind === 'quote' ? plain(ev.quote) : ev.kind === 'region' ? `Screenshot (${ev.screenshot}): ${ev.note}` : `${ev.name}: ${ev.value}`;

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
export const countWord = (n: number): string => WORDS[n] ?? String(n);

/** Claim text and notes come from markdown: drop the emphasis markers, keep the words. */
export const plain = (t: string): string => t.replace(/\*\*/g, '');
export const pts = (n: number): string => `${n} ${n === 1 ? 'pt' : 'pts'}`;
