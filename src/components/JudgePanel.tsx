import { useEffect, useState } from 'react';
import type { Slot } from '../lib/runTypes';
import type { JudgeResult } from '../shared/types';
import { errorLabel } from '../lib/messages';

type Props = {
  numeral: string;
  title: string;
  verb: string; // shown while reviewing, e.g. "Reading the repository"
  slot: Slot<{ result: JudgeResult }>;
  onRetry: () => void;
};

function useElapsed(startedAt?: number, running?: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);
  if (!startedAt) return '';
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function JudgePanel({ numeral, title, verb, slot, onRetry }: Props) {
  const reviewing = slot.status === 'reviewing';
  const elapsed = useElapsed(slot.startedAt, reviewing);
  const result = slot.data?.result;
  const statusText = slot.status === 'waiting' ? 'Waiting to start' : reviewing ? `${verb}…` : slot.status === 'done' ? 'Done' : 'Stopped';
  return (
    <section className="panel glass rise" aria-live="polite" aria-label={`Judge ${numeral}, ${title}`}>
      <div className="eyebrow">Judge {numeral}</div>
      <h2>{title}</h2>
      <div className="status-row">
        <span className={`dot ${slot.status}`} aria-hidden="true" />
        <span>{statusText}</span>
        {(reviewing || (slot.status === 'done' && elapsed)) && <span className="elapsed">{elapsed}</span>}
      </div>
      <div className={`sweep ${reviewing ? 'on' : ''}`} aria-hidden="true" />
      {slot.status === 'done' && result && (
        <>
          <div className="panel-score">{result.score}<small>/ 100</small></div>
          <ul className="lines">{result.evidenceLines.slice(0, 3).map((l, i) => <li key={i}>{l}</li>)}</ul>
        </>
      )}
      {slot.status === 'failed' && (
        <>
          <p className="panel-fail">
            {errorLabel(slot.error)[0].toUpperCase() + errorLabel(slot.error).slice(1)}.
            {slot.error?.message && slot.error.message.toLowerCase().replace(/[.’']/g, '') !== errorLabel(slot.error).toLowerCase().replace(/[.’']/g, '') && <span>{slot.error.message}</span>}
          </p>
          <div className="actions"><button className="btn ghost" onClick={onRetry}>Retry</button></div>
        </>
      )}
    </section>
  );
}
