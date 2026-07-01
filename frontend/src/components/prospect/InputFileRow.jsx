import { downloadUrl } from '../../lib/api.js';
import { formatSize, formatRelative, formatDateTime } from '../../lib/format.js';

function FileTypeIcon({ name }) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.vtt')) {
    return (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
        <path d="M8 1a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-5 0v-4A2.5 2.5 0 0 1 8 1Zm-3.5 6a.5.5 0 0 0-1 0 4.5 4.5 0 0 0 9 0 .5.5 0 0 0-1 0A3.5 3.5 0 0 1 8 10.5 3.5 3.5 0 0 1 4.5 7ZM7.5 12.5v1.5h-2a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-2v-1.5a4.5 4.5 0 0 0 1-.18.5.5 0 0 0-.4-.92A3.49 3.49 0 0 1 8 11.5a3.49 3.49 0 0 1-.6-.1.5.5 0 0 0-.4.92 4.5 4.5 0 0 0 .5.18Z" />
      </svg>
    );
  }
  if (lower.endsWith('.txt')) {
    return (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
        <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0h5L13 3.5v11A1.5 1.5 0 0 1 11.5 16h-7A1.5 1.5 0 0 1 3 14.5v-13ZM9 1H4.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4H9.5A.5.5 0 0 1 9 3.5V1ZM5 6.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm0 2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5A.5.5 0 0 1 5 9Zm0 2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
      <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0h5L13 3.5v11A1.5 1.5 0 0 1 11.5 16h-7A1.5 1.5 0 0 1 3 14.5v-13ZM9 1H4.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4H9.5A.5.5 0 0 1 9 3.5V1Z" />
    </svg>
  );
}

export default function InputFileRow({ index, prospect, file, onPreview, onDelete }) {
  const { filename, size, last_modified } = file;
  return (
    <div className="group flex items-center justify-between gap-2 bg-white border border-bd px-3 py-2.5 rounded-xl transition-colors hover:border-blue-mid hover:bg-blue-lt/40">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span
          className="w-7 h-7 rounded-lg bg-bg3 text-blue flex items-center justify-center flex-shrink-0"
          aria-hidden="true"
        >
          <FileTypeIcon name={filename} />
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] text-ink font-medium truncate" title={filename}>
            <span className="text-ink-soft mr-1.5">{index}.</span>
            {filename}
          </div>
          <div
            className="text-[10.5px] text-ink-soft font-mono mt-0.5 flex items-center gap-1.5"
            title={last_modified ? formatDateTime(last_modified) : ''}
          >
            {size != null && <span>{formatSize(size)}</span>}
            {size != null && last_modified && <span>·</span>}
            {last_modified && <span>{formatRelative(last_modified)}</span>}
          </div>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0 items-center opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label="Preview"
          title="Preview"
          onClick={onPreview}
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-bd text-blue hover:bg-blue hover:text-white hover:border-blue cursor-pointer transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
            <path d="M8 3C4 3 1.5 8 1.5 8S4 13 8 13s6.5-5 6.5-5S12 3 8 3Zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm0-4.5A1.5 1.5 0 1 0 8 9.5 1.5 1.5 0 0 0 8 6.5Z" />
          </svg>
        </button>
        <a
          href={downloadUrl(prospect, 'input', filename)}
          aria-label="Download"
          title="Download"
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-bd text-green hover:bg-green hover:text-white hover:border-green cursor-pointer transition-colors no-underline"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
            <path d="M8 1a.75.75 0 0 1 .75.75v7.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V1.75A.75.75 0 0 1 8 1Zm-6 11.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" />
          </svg>
        </a>
        <button
          type="button"
          aria-label="Delete"
          title="Delete"
          onClick={onDelete}
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-bd text-ink-soft hover:bg-red hover:text-white hover:border-red cursor-pointer transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
            <path d="M6 1.75A.75.75 0 0 1 6.75 1h2.5a.75.75 0 0 1 .75.75V3h3.25a.75.75 0 0 1 0 1.5h-.563l-.6 8.4A2 2 0 0 1 10.092 15H5.908a2 2 0 0 1-1.995-2.1l-.6-8.4H2.75a.75.75 0 0 1 0-1.5H6V1.75ZM4.819 4.5l.588 8.232a.5.5 0 0 0 .499.518h4.188a.5.5 0 0 0 .499-.518L11.181 4.5H4.819Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

