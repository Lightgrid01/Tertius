// Shared by the page (src/) and the functions (api/). Nothing here touches the network.

export type Evidence =
  | { kind: 'quote'; source: string; quote: string } // repo file, README, or description
  // box = [x, y, width, height], each a fraction (0..1) of the screenshot's width/height
  | { kind: 'region'; screenshot: 'mobile' | 'desktop'; box: [number, number, number, number]; note: string }
  | { kind: 'metric'; name: string; value: string };

/** points === null means "couldn't check": left out of the total. */
export type Part = {
  key: string;
  label: string;
  max: number;
  points: number | null;
  evidence: Evidence[];
  advice?: string; // short imperative fix headline, e.g. "Say who it's for."
  why?: string; // one sentence on why it costs points
};

export type JudgeResult = {
  judge: 'repo' | 'ui';
  score: number; // 0-100, computed by code
  parts: Part[];
  evidenceLines: string[]; // 2-3 lines shown under the judge in the score block
  filesRead?: string[];
  observedSummary?: string;
  screenshots?: { mobile: string; desktop: string }; // data URIs
};

export type ClaimStatus = 'supported' | 'unsupported' | 'contradicted' | 'unverifiable';
export type ClaimSource = 'devpost' | 'readme' | 'github';

export type Claim = {
  id: string;
  text: string; // exact quote from its source
  source: ClaimSource;
  status: ClaimStatus;
  evidence: Evidence[];
  pointsLost: number; // set by code, never by the model
  note?: string; // what was checked / what contradicts
};

export type Fix = {
  id: string;
  title: string;
  detail?: string;
  raisedBy: 'repo' | 'ui' | 'claims';
  pointsAtStake: number;
  evidence: Evidence[];
};

export type ReviewScore = {
  repo: number | null;
  ui: number | null;
  base: number | null;
  penalty: number; // 0..25, shown as points lost
  final: number | null; // null when Judge II failed: no Final score
  uncappedFinal: number | null;
  capped: boolean; // true when fewer than 3 checkable claims limited the Final
  checkable: number;
};

// ---- API contracts -------------------------------------------------------

export type ApiErrorCode =
  | 'repo_not_found'
  | 'bad_input'
  | 'live_ui_failed'
  | 'rate_limited'
  | 'overloaded'
  | 'no_verified_evidence'
  | 'devpost_unreadable'
  | 'failed';

export type ApiError = { error: ApiErrorCode; message: string };

export type CheckInputsRequest = { repoUrl: string; devpost?: string };
export type CheckInputsResponse = {
  owner: string;
  repo: string;
  description: string | null;
  defaultBranch: string;
  /** Devpost text, whether pasted or fetched. Absent when none was given. */
  devpostText?: string;
};

export type JudgeRepoRequest = { owner: string; repo: string; defaultBranch: string; description: string | null };
export type JudgeRepoResponse = { result: JudgeResult; readme: string; description: string | null };

export type JudgeUiRequest = { liveUrl: string };
export type JudgeUiResponse = { result: JudgeResult };

export type ClaimCheckRequest = {
  devpostText?: string;
  readme: string;
  description: string | null;
  repo: JudgeResult;
  ui: JudgeResult;
};
export type ClaimCheckResponse = { claims: Claim[] };

export const PENALTY_PER_STATUS: Record<ClaimStatus, number> = {
  supported: 0,
  unsupported: 2,
  contradicted: 6,
  unverifiable: 0,
};
export const PENALTY_CAP = 25;
export const VAGUE_CAP = 85;
export const MIN_CHECKABLE = 3;
