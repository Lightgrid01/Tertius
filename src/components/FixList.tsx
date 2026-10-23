import type { Fix } from '../shared/types';
import { evidenceText, plain, pts } from '../lib/messages';

const BY = { repo: 'Judge I · Repository', ui: 'Judge II · Interface', claims: 'Claim check' } as const;

type Props = { fixes: Fix[]; selectedId: string | null; onSelect: (id: string) => void };

export function FixList({ fixes, selectedId, onSelect }: Props) {
  if (fixes.length === 0) {
    return (
      <div className="glass fixlist"><div className="empty"><div className="big">Nothing to fix.</div>Every part scored in full and every claim held up.</div></div>
    );
  }
  return (
    <div className="glass fixlist" role="list" aria-label="Ranked fixes">
      {fixes.map((f, i) => {
        const first = f.evidence[0];
        return (
          <button key={f.id} role="listitem" className="fix" aria-pressed={selectedId === f.id} onClick={() => onSelect(f.id)}>
            <div className="n" aria-hidden="true">{i + 1}</div>
            <div>
              <div className="eyebrow muted">{BY[f.raisedBy]}</div>
              <h3>{f.title}</h3>
              {first && (first.kind === 'quote'
                ? <span className="ev">“{plain(first.quote)}”</span>
                : <span className="ev">{evidenceText(first)}</span>)}
              {f.detail && <p className="why">{f.detail}</p>}
              <div className="stake">{f.pointsAtStake > 0 ? `${pts(f.pointsAtStake)} at stake` : 'no points at stake'} · open evidence</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
