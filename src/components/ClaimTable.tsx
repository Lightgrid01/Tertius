import type { Claim } from '../shared/types';
import { SOURCE_LABEL, evidenceText, plain } from '../lib/messages';

const LABEL: Record<Claim['status'], string> = {
  supported: 'Supported', unsupported: 'Unsupported', contradicted: 'Contradicted', unverifiable: 'Unverifiable',
};

export function ClaimTable({ claims }: { claims: Claim[] }) {
  if (claims.length === 0) {
    return (
      <section className="glass claims" aria-label="Claim check">
        <div className="empty"><div className="big">No claims found.</div>The description makes no statements a judge could check. Add specifics and run it again.</div>
      </section>
    );
  }
  return (
    <section className="glass claims" aria-label="Claim check">
      <table className="ctable">
        <thead><tr><th>Claim</th><th>Status</th><th>Evidence</th><th className="lost">Points lost</th></tr></thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id}>
              <td><span className="claimtext">“{plain(c.text)}”</span><span className="src">{SOURCE_LABEL[c.source]}</span></td>
              <td><span className={`status ${c.status}`}>{LABEL[c.status]}</span>{c.status === 'unverifiable' && <div className="cnote">couldn’t check</div>}</td>
              <td>
                <div className="cev">{c.evidence.map((e, i) => <span className="ev" key={i}>{evidenceText(e)}</span>)}</div>
                {c.note && <div className="cnote">{plain(c.note)}</div>}
                {c.evidence.length === 0 && !c.note && <span className="cnote">—</span>}
              </td>
              <td className="lost">{c.pointsLost > 0 ? `−${c.pointsLost}` : '0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
