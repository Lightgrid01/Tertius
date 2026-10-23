import { useEffect, useMemo, useRef } from 'react';
import { classifyDevpost, normalizeLiveUrl, parseRepoUrl } from '../lib/url';
import type { Inputs } from '../lib/runTypes';
import { errorLabel } from '../lib/messages';
import type { ApiError } from '../shared/types';

type Props = {
  value: Inputs;
  onChange: (v: Inputs) => void;
  onSubmit: () => void;
  busy: boolean;
  serverError?: ApiError;
};

export function validateInputs(v: Inputs) {
  const repoOk = parseRepoUrl(v.repoUrl) !== null;
  const liveOk = normalizeLiveUrl(v.liveUrl) !== null;
  const dev = classifyDevpost(v.devpost);
  return { repoOk, liveOk, dev, ok: repoOk && liveOk && dev.kind !== 'invalid' };
}

export function InputPill({ value, onChange, onSubmit, busy, serverError }: Props) {
  const v = useMemo(() => validateInputs(value), [value]);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
    el.style.overflowY = el.scrollHeight > 168 ? 'auto' : 'hidden';
  }, [value.devpost]);

  const repoTouched = value.repoUrl.trim().length > 0;
  const liveTouched = value.liveUrl.trim().length > 0;
  const repoMsg = serverError?.error === 'repo_not_found'
    ? errorLabel(serverError)
    : repoTouched && !v.repoOk ? 'Use a link like github.com/owner/repo' : '';
  const liveMsg = liveTouched && !v.liveOk ? 'Enter the public address of your live page' : '';
  const devMsg = v.dev.kind === 'invalid' ? v.dev.reason
    : serverError?.error === 'devpost_unreadable' ? `${errorLabel(serverError)}. Paste the description text instead.` : '';
  const devHint = v.dev.kind === 'url' ? 'Devpost link: Tertius will read the page.' : v.dev.kind === 'text' ? 'Pasted text will be checked as claims.' : '';

  const generic = serverError && serverError.error !== 'repo_not_found' && serverError.error !== 'devpost_unreadable' ? `${errorLabel(serverError)[0].toUpperCase()}${errorLabel(serverError).slice(1)}. ${serverError.message}` : '';
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (v.ok && !busy) onSubmit(); };
  const set = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <form className="pill glass-light" onSubmit={submit} noValidate aria-busy={busy}>
      <div className="pill-row">
        <div className={`field ${repoMsg ? 'invalid' : ''}`}>
          <label className="sr" htmlFor="repo">Repository URL</label>
          <input id="repo" type="text" inputMode="url" autoComplete="off" spellCheck={false} placeholder="Repository URL"
            value={value.repoUrl} onChange={set('repoUrl')} aria-invalid={!!repoMsg} aria-describedby={repoMsg ? 'repo-msg' : undefined} />
          {repoMsg && <div className="field-msg" id="repo-msg" role="alert">{repoMsg}</div>}
        </div>
        <div className={`field ${liveMsg ? 'invalid' : ''}`}>
          <label className="sr" htmlFor="live">Live interface URL</label>
          <input id="live" type="text" inputMode="url" autoComplete="off" spellCheck={false} placeholder="Live interface URL"
            value={value.liveUrl} onChange={set('liveUrl')} aria-invalid={!!liveMsg} aria-describedby={liveMsg ? 'live-msg' : undefined} />
          {liveMsg && <div className="field-msg" id="live-msg" role="alert">{liveMsg}</div>}
        </div>
      </div>
      <div className="pill-row">
        <div className={`field ${devMsg ? 'invalid' : ''}`} style={{ flexBasis: 320 }}>
          <label className="sr" htmlFor="devpost">Devpost description, optional</label>
          <textarea id="devpost" ref={area} rows={1} placeholder="Devpost description: link or pasted text (optional)"
            value={value.devpost} onChange={set('devpost')} spellCheck={false} aria-describedby="dev-msg" />
          <div id="dev-msg" className={`field-msg ${devMsg ? '' : 'hint'}`} role={devMsg ? 'alert' : undefined} style={{ display: devMsg || devHint ? 'block' : 'none' }}>
            {devMsg || devHint}
          </div>
        </div>
        <button className="btn" type="submit" disabled={!v.ok || busy}>{busy ? 'Checking…' : 'Begin review'}</button>
      </div>
      {generic && <div className="field-msg" role="alert" style={{ padding: '6px 22px 14px' }}>{generic}</div>}
    </form>
  );
}
