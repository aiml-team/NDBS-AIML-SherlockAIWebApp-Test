import { useEffect, useRef, useState } from 'react';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function humanSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Single-image drop zone with click-to-browse and paste-from-clipboard.
 * Props:
 *   value:    File | null
 *   onChange: (file | null) => void
 *   active:   boolean — only listen for paste when modal is actually open
 */
export default function ScreenshotDropzone({ value, onChange, active = true }) {
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  // Generate / clean up object URL for preview
  useEffect(() => {
    if (!value) { setPreview(''); return undefined; }
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  // Clipboard paste — only while active
  useEffect(() => {
    if (!active) return undefined;
    function onPaste(e) {
      // Don't steal paste while user types in the message textarea
      const tag = e.target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            accept(f);
            return;
          }
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [active]);

  function accept(file) {
    setError('');
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError('Please choose a PNG, JPEG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${humanSize(file.size)} — limit is 5 MB.`);
      return;
    }
    onChange?.(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) accept(f);
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (f) accept(f);
    // Reset input so re-selecting the same file fires onChange again
    e.target.value = '';
  }

  function clear() {
    setError('');
    onChange?.(null);
  }

  if (value && preview) {
    return (
      <div className="flex items-start gap-3 border border-bd rounded-lg p-2.5 bg-bg">
        <img
          src={preview}
          alt="Screenshot preview"
          className="w-20 h-20 object-cover rounded-md border border-bd flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-ink truncate">{value.name}</div>
          <div className="text-[11px] text-ink-soft font-mono mt-0.5">
            {humanSize(value.size)} · {value.type.replace('image/', '').toUpperCase()}
          </div>
          <button
            type="button"
            onClick={clear}
            className="mt-2 text-[11.5px] font-semibold text-red hover:underline bg-transparent border-none p-0 cursor-pointer"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`w-full border-2 border-dashed rounded-lg px-4 py-5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors bg-white ${
          dragOver
            ? 'border-blue bg-blue-lt'
            : 'border-bd hover:border-blue-mid hover:bg-blue-lt/40'
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-ink-soft mb-0.5" aria-hidden="true">
          <path d="M19 7v10c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2h2.17L10 4h4l.83 1H17c1.1 0 2 .9 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
        </svg>
        <div className="text-[13px] font-semibold text-ink-muted">
          Drop a screenshot, click to browse, or paste
        </div>
        <div className="text-[11px] text-ink-soft font-mono">
          PNG / JPEG / WebP / GIF · max 5 MB
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(',')}
        onChange={onFile}
        className="hidden"
      />
      {error && (
        <div className="text-[11.5px] text-red mt-1.5">{error}</div>
      )}
    </div>
  );
}
