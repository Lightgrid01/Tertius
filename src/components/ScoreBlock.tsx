import type { JudgeResult, ReviewScore } from '../shared/types';
import { PENALTY_CAP, VAGUE_CAP } from '../shared/types';

type Props = { score: ReviewScore; repo: JudgeResult; ui: JudgeResult };
const dash = '—';

export function ScoreBlock({ score, repo, ui }: Props) {
  const scaled = ui.parts.some((p) => p.points === null);
  return (
    <section className="score-block glass" aria-label="Scores">
      <div className="score-row">
        <div className="stat"><div className="eyebrow muted">Repo · Judge I</div><div className="num">{score.repo ?? dash}<small>/100</small></div><div className="tag">sum of five parts</div></div>
        <div className="stat"><div className="eyebrow muted">UI · Judge II</div><div className="num">{score.ui ?? dash}<small>/100</small></div><div className="tag">{scaled ? 'scaled over observed parts' : 'sum of five parts'}</div></div>
        <div className="stat"><div className="eyebrow muted">Base</div><div className="num">{score.base ?? dash}<small>/100</small></div><div className="tag">average of both</div></div>
        <div className="stat"><div className="eyebrow muted">Claim check</div><div className="num">{score.penalty === 0 ? '0' : `−${score.penalty}`}<small>pts lost</small></div><div className="tag">{score.penalty >= PENALTY_CAP ? `capped at ${PENALTY_CAP}` : `${score.checkable} checkable claims`}</div></div>
        <div className="stat final"><div className="eyebrow">Final</div><div className="num">{score.final ?? dash}<small>/100</small></div><div className="tag">{score.capped ? ((score.uncappedFinal ?? 0) > VAGUE_CAP ? `capped at ${VAGUE_CAP}: add specifics` : 'fewer than 3 checkable claims') : 'base minus claim check'}</div></div>
      </div>
      <div className="score-evidence">
        <div><div className="eyebrow">I · Repository</div><ul className="lines">{repo.evidenceLines.slice(0, 3).map((l, i) => <li key={i}>{l}</li>)}</ul></div>
        <div><div className="eyebrow">II · Interface</div><ul className="lines">{ui.evidenceLines.slice(0, 3).map((l, i) => <li key={i}>{l}</li>)}</ul></div>
      </div>
    </section>
  );
}
