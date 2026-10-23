import { JudgePanel } from '../components/JudgePanel';
import type { RunState } from '../lib/runTypes';

type Props = { run: RunState; onRetry: (which: 'repo' | 'ui' | 'claims') => void; onReset: () => void };

export function Running({ run, onRetry, onReset }: Props) {
  const both = run.repo.status === 'done' && run.ui.status === 'done';
  const partial = run.ui.status === 'failed' && run.repo.status === 'done';
  const claimsFailed = run.claims.status === 'failed';
  return (
    <div className="shell">
      <div className="backdrop" aria-hidden="true" />
      <main className="page">
        <header className="topbar">
          <button className="wordmark" onClick={onReset} aria-label="Tertius, back to start">Tertius</button>
          <button className="btn ghost" onClick={onReset}>Edit inputs</button>
        </header>
        <div className="eyebrow" style={{ marginTop: 56 }}>{partial ? 'Partial result' : 'In review'}</div>
        <h1 className="page-title">{partial ? 'Judge II couldn’t see your page.' : both ? 'Both judges are done.' : 'Two judges, reading separately.'}</h1>
        <div className="run-grid">
          <JudgePanel numeral="I" title="Repository" verb="Reading the repository" slot={run.repo} onRetry={() => onRetry('repo')} />
          <JudgePanel numeral="II" title="Live interface" verb="Loading and critiquing the page" slot={run.ui} onRetry={() => onRetry('ui')} />
        </div>
        {both && (
          <section className="claim-step glass" aria-live="polite">
            <span className={`dot ${claimsFailed ? 'failed' : run.claims.status === 'done' ? 'done' : 'reviewing'}`} aria-hidden="true" />
            <span className="eyebrow">III · Claim check</span>
            <span className="t">
              {claimsFailed ? 'The claim check stopped.' : run.claims.status === 'done' ? 'Claims checked.' : 'Comparing your claims with what both judges found…'}
            </span>
            {claimsFailed && <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => onRetry('claims')}>Retry</button>}
          </section>
        )}
      </main>
    </div>
  );
}
