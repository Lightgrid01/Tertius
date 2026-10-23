import sample from './sample-review.json';
import type { Claim, JudgeResult } from '../shared/types';

export const SAMPLE_LABEL = 'SAMPLE DATA — UI development only. Never used in a real review.';
export const USE_FIXTURES = import.meta.env.VITE_USE_FIXTURES === 'true' || import.meta.env.VITE_USE_FIXTURES === '1';

export const sampleData = sample as unknown as {
  description: string; readme: string; repo: JudgeResult; ui: JudgeResult; claims: Claim[];
};
