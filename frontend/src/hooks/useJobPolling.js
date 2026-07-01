import { useEffect, useRef, useState } from 'react';
import { getJobStatus } from '../lib/api.js';

const POLL_MS = 3000;
const MAX_NET_ERRORS = 5;
const DONE_DELAY_MS = 800;

export default function useJobPolling(jobId, { onDone, onError } = {}) {
  const [job, setJob] = useState(null);
  const errCount = useRef(0);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      errCount.current = 0;
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    async function tick() {
      try {
        const status = await getJobStatus(jobId);
        if (cancelled) return;

        if (status?.status === 'not_found') {
          onErrorRef.current?.({
            kind: 'not_found',
            message: 'The job is no longer being tracked. The server may have restarted — please retry.',
          });
          return;
        }

        errCount.current = 0;
        setJob(status);

        if (status?.status === 'done') {
          setTimeout(() => {
            if (!cancelled) onDoneRef.current?.(status);
          }, DONE_DELAY_MS);
          return;
        }
        if (status?.status === 'error') {
          onErrorRef.current?.({
            kind: 'pipeline',
            message: 'Generation failed: ' + (status.message || 'unknown error'),
          });
          return;
        }
      } catch {
        errCount.current += 1;
        if (errCount.current >= MAX_NET_ERRORS) {
          onErrorRef.current?.({
            kind: 'network',
            message: 'Lost connection while polling job status. Please check the server and retry.',
          });
          return;
        }
      }
      timer = setTimeout(tick, POLL_MS);
    }

    timer = setTimeout(tick, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return job;
}
