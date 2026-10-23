import { useEffect, useState } from 'react';
import { Landing } from './pages/Landing';
import { Running } from './pages/Running';
import { Review } from './pages/Review';
import { useReview } from './lib/runReview';
import type { Inputs } from './lib/runTypes';

export default function App() {
  const { run, start, retry, reset } = useReview();
  const [inputs, setInputs] = useState<Inputs>({ repoUrl: '', liveUrl: '', devpost: '' });

  useEffect(() => { if (run) setInputs(run.inputs); }, [run?.phase === 'blocked']); // eslint-disable-line react-hooks/exhaustive-deps

  const onLanding = !run || run.phase === 'checking' || run.phase === 'blocked';
  if (onLanding) {
    return <Landing inputs={inputs} onChange={setInputs} onBegin={() => start(inputs)} busy={run?.phase === 'checking'} error={run?.checkError} />;
  }
  if (run.phase === 'done' && run.repo.data && run.ui.data && run.claims.data) return <Review run={run} onReset={reset} />;
  return <Running run={run} onRetry={retry} onReset={reset} />;
}
