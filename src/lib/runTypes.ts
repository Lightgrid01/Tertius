import type { ApiError, CheckInputsResponse, ClaimCheckResponse, JudgeRepoResponse, JudgeUiResponse } from '../shared/types';

export type Inputs = { repoUrl: string; liveUrl: string; devpost: string };
export type SlotStatus = 'waiting' | 'reviewing' | 'done' | 'failed';
export type Slot<T> = { status: SlotStatus; startedAt?: number; error?: ApiError; data?: T };

export type RunState = {
  inputs: Inputs;
  sample?: boolean;
  /** checking: inputs being checked; blocked: bad repo, back to the landing screen */
  phase: 'checking' | 'blocked' | 'judging' | 'claims' | 'done';
  checkError?: ApiError;
  check?: CheckInputsResponse;
  repo: Slot<JudgeRepoResponse>;
  ui: Slot<JudgeUiResponse>;
  claims: Slot<ClaimCheckResponse>;
};

export const emptySlot = <T,>(): Slot<T> => ({ status: 'waiting' });
