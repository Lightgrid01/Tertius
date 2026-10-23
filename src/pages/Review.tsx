import { useEffect, useMemo, useState } from 'react';
import { ScoreBlock } from '../components/ScoreBlock';
import { ClaimTable } from '../components/ClaimTable';
import { FixList } from '../components/FixList';
import { EvidenceView } from '../components/EvidenceView';
import { computeReview } from '../shared/score';
import { rankFixes } from '../shared/rank';
import { countWord } from '../lib/messages';
import { SAMPLE_LABEL } from '../fixtures';
import type { RunState } from '../lib/runTypes';

type Props = { run: RunState; onReset: () => void };

export function Review({ run, onReset }: Props) {
  const repo = run.repo.data!.result;
  const ui = run.ui.data!.result;
  const claims = run.claims.data!.claims;
  const score = useMemo(() => computeReview(repo.score, ui.score, claims), [repo, ui, claims]);
  const fixes = useMemo(() => rankFixes(repo, ui, claims, score), [repo, ui, claims, score]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // Desktop shows the evidence panel beside the list, so open the first fix. On phones it is a sheet: leave it closed.
    if (window.matchMedia('(min-width: 961px)').matches && fixes[0]) setSelected(fixes[0].id);
    window.scrollTo({ top: 0 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fix = fixes.find((f) => f.id === selected) ?? null;
  const n = fixes.length;
  const title = n === 0 ? 'Nothing left to fix.' : `${countWord(n)} ${n === 1 ? 'fix' : 'fixes'} before you submit.`;

  return (
    <div className="shell">
      <div className="backdrop" aria-hidden="true" />
      <main className="page">
        <header className="topbar">
          <button className="wordmark" onClick={onReset} aria-label="Tertius, start a new review">Tertius</button>
          <button className="btn ghost" onClick={onReset}>New review</button>
        </header>
        <div className="eyebrow" style={{ marginTop: 56 }}>III · Verdict</div>
        <h1 className="page-title">{title}</h1>
        {run.sample && <div style={{ marginTop: 18 }}><span className="banner">{SAMPLE_LABEL}</span></div>}
        <div className="section"><ScoreBlock score={score} repo={repo} ui={ui} /></div>
        <div className="section"><div className="eyebrow" style={{ margin: '0 0 14px 4px' }}>Claim check</div><ClaimTable claims={claims} /></div>
        <div className="section">
          <div className="eyebrow" style={{ margin: '0 0 14px 4px' }}>Ranked fixes</div>
          <div className="fix-grid">
            <FixList fixes={fixes} selectedId={selected} onSelect={setSelected} />
            <EvidenceView fix={fix} repo={repo} ui={ui} onClose={() => setSelected(null)} />
          </div>
        </div>
      </main>
    </div>
  );
}
