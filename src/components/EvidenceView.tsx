import type { Evidence, Fix, JudgeResult } from '../shared/types';
import { SOURCE_LABEL, plain } from '../lib/messages';

type Props = { fix: Fix | null; repo: JudgeResult; ui: JudgeResult; onClose: () => void };

function Shot({ ev, ui }: { ev: Extract<Evidence, { kind: 'region' }>; ui: JudgeResult }) {
  const src = ui.screenshots?.[ev.screenshot];
  const [x, y, w, h] = ev.box;
  return (
    <div className="evblock">
      <div className="evsrc">Screenshot · {ev.screenshot}</div>
      {src ? (
        <div className={`shot ${ev.screenshot}`}>
          <img src={src} alt={`${ev.screenshot} screenshot of the live page`} />
          <div className="box" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }} />
        </div>
      ) : <div className="cnote">Screenshot unavailable.</div>}
      <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-soft)', margin: '12px 0 0' }}>{ev.note}</p>
    </div>
  );
}

export function EvidenceView({ fix, repo, ui, onClose }: Props) {
  if (!fix) {
    return (
      <aside className="glass evpanel idle" aria-label="Evidence">
        <button className="btn ghost close" onClick={onClose}>Close</button>
        <div className="empty"><div className="big">Evidence</div>Select a fix to see the exact quote or screenshot region behind it.</div>
      </aside>
    );
  }
  const judge = fix.raisedBy === 'repo' ? repo : fix.raisedBy === 'ui' ? ui : null;
  const partKey = fix.id.split(':')[1];
  return (
    <aside className="glass evpanel" aria-label="Evidence" aria-live="polite">
      <button className="btn ghost close" onClick={onClose}>Close</button>
      <div className="eyebrow">Evidence</div>
      <h4>{fix.title}</h4>
      {fix.evidence.map((ev, i) => {
        if (ev.kind === 'quote') {
          const label = ev.source === 'devpost' || ev.source === 'readme' || ev.source === 'github'
            ? SOURCE_LABEL[ev.source] : ev.source;
          return <div className="evblock" key={i}><div className="evsrc">{label}</div><span className="ev">“{plain(ev.quote)}”</span></div>;
        }
        if (ev.kind === 'region') return <Shot key={i} ev={ev} ui={ui} />;
        return <div className="evblock" key={i}><div className="metric"><span>{ev.name}</span><b>{ev.value}</b></div></div>;
      })}
      {fix.detail && <p style={{ fontSize: 15, lineHeight: 1.6, color: '#c9d4e0', marginTop: 22 }}>{fix.detail}</p>}
      {judge && (
        <div className="parts">
          <div className="eyebrow muted">{judge.judge === 'repo' ? 'Judge I parts' : 'Judge II parts'}</div>
          {judge.parts.map((p) => (
            <div key={p.key} className={`part ${p.key === partKey ? 'hot' : ''}`}>
              <span>{p.label}</span>
              <b>{p.points === null ? 'couldn’t check' : `${p.points} / ${p.max}`}</b>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
