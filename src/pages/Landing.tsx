import { InputPill } from '../components/InputPill';
import type { Inputs } from '../lib/runTypes';
import type { ApiError } from '../shared/types';

type Props = { inputs: Inputs; onChange: (v: Inputs) => void; onBegin: () => void; busy: boolean; error?: ApiError };

export function Landing({ inputs, onChange, onBegin, busy, error }: Props) {
  return (
    <div className="shell">
      <div className="backdrop hero" aria-hidden="true" />
      <main className="page landing">
        <header className="topbar"><span className="wordmark">Tertius</span></header>
        <section className="landing-main">
          <h1 className="rise">Know your score before the <em>judges</em> do.</h1>
          <p className="lede rise" style={{ animationDelay: '.12s' }}>
            Two independent reviewers read your repository and your live interface, then quote the evidence behind every fix.
          </p>
          <div className="rise" style={{ animationDelay: '.24s', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <InputPill value={inputs} onChange={onChange} onSubmit={onBegin} busy={busy} serverError={error} />
          </div>
        </section>
        <section className="pillars glass-light rise" style={{ animationDelay: '.36s' }} aria-label="How it works">
          <div><div className="eyebrow">I · Repository</div><p>Reads the files, docs and commit history. Flags what the code doesn’t back up.</p></div>
          <div><div className="eyebrow">II · Interface</div><p>Loads your live page, measures it, then critiques what a reviewer sees first.</p></div>
          <div><div className="eyebrow">III · Verdict</div><p>Checks what your description promises against what both judges found, then returns one ranked list of fixes.</p></div>
        </section>
      </main>
    </div>
  );
}
