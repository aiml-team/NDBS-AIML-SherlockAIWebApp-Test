import { useState } from 'react';

export default function DropZone({
  onFiles,
  accept = '.docx,.vtt,.txt',
  multiple = true,
  label = 'Drop files or click to browse',
  compact = false,
}) {
  const [drag, setDrag] = useState(false);

  function fromList(list) {
    const files = Array.from(list || []);
    if (files.length) onFiles(files);
  }

  if (compact) {
    return (
      <div
        onDrop={(e) => { e.preventDefault(); setDrag(false); fromList(e.dataTransfer.files); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        className={`relative border border-dashed rounded-xl px-3.5 py-3 cursor-pointer transition-all flex items-center gap-3 mb-3 ${
          drag ? 'border-blue bg-blue-lt' : 'border-bd2 bg-bg hover:border-blue hover:bg-blue-lt'
        }`}
      >
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => fromList(e.target.files)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
        <div className="w-9 h-9 rounded-xl bg-white border border-bd shadow-card flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-blue">
            <path d="M12 3L8 8h3v8h2V8h3L12 3zM5 18v2h14v-2H5z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-bold text-ink truncate">{label}</div>
          <div className="text-[10.5px] text-ink-soft mt-0.5 font-mono">
            DOCX · VTT · TXT — multiple files allowed
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={(e) => { e.preventDefault(); setDrag(false); fromList(e.dataTransfer.files); }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      className={`relative border-2 border-dashed rounded-xl px-5 py-6 text-center cursor-pointer transition-all mb-3 ${
        drag ? 'border-blue bg-blue-lt' : 'border-bd2 bg-bg hover:border-blue hover:bg-blue-lt'
      }`}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => fromList(e.target.files)}
        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
      />
      <div className="w-12 h-12 rounded-2xl bg-white border border-bd shadow-card mx-auto mb-3 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] fill-blue">
          <path d="M12 3L8 8h3v8h2V8h3L12 3zM5 18v2h14v-2H5z" />
        </svg>
      </div>
      <div className="text-sm font-bold text-ink mb-1">{label}</div>
      <div className="text-[12px] text-ink-muted mb-3">
        DOCX transcripts or VTT Teams recordings — multiple files allowed
      </div>
      <div className="flex gap-1.5 justify-center">
        {['DOCX', 'VTT', 'TXT'].map((t) => (
          <span
            key={t}
            className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-md border border-bd text-ink-muted bg-white tracking-[0.05em]"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
