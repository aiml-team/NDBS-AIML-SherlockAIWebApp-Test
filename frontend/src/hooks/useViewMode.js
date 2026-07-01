import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'sherlock.prospects.view';
const VALID = ['grid', 'list'];
const DEFAULT = 'grid';

function readInitial() {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (VALID.includes(raw)) return raw;
    // Missing or corrupt — self-heal.
    if (raw !== null) window.localStorage.setItem(STORAGE_KEY, DEFAULT);
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/**
 * View-mode preference for the prospect list.
 * Returns [view, setView]. `view` is always one of 'grid' | 'list'.
 * `setView(next)` silently ignores invalid values.
 * Persists to localStorage under 'sherlock.prospects.view'.
 */
export default function useViewMode() {
  const [view, setViewState] = useState(readInitial);
  const isFirst = useRef(true);

  function setView(next) {
    if (!VALID.includes(next)) return;
    setViewState(next);
  }

  useEffect(() => {
    // Skip the write on first mount — readInitial already synced storage if needed.
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, view);
    } catch {
      // Privacy-mode browser or quota exceeded — degrade silently to in-memory.
    }
  }, [view]);

  return [view, setView];
}
