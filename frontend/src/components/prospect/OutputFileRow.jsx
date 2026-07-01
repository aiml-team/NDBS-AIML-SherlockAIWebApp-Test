import { downloadUrl } from '../../lib/api.js';
import { formatSize, parseOutputFilename } from '../../lib/format.js';

export default function OutputFileRow({ prospect, file, onPreview, highlight = false }) {
  const { filename, size } = file;
  const generated = parseOutputFilename(filename);
  const primary = generated ? `Discovery Profile · ${generated}` : filename;
  const secondary = [generated ? filename : '', size != null ? formatSize(size) : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={`group flex items-center gap-3 border px-3.5 py-3 rounded-2xl transition-all ${
        highlight
          ? 'bg-gradient-to-br from-green-lt to-white border-green-mid shadow-card'
          : 'bg-white border-bd hover:border-green-mid hover:bg-green-lt/40'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          highlight ? 'bg-green text-white' : 'bg-green-lt text-green-dark'
        }`}
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
          <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0h5L13 3.5v11A1.5 1.5 0 0 1 11.5 16h-7A1.5 1.5 0 0 1 3 14.5v-13ZM9 1H4.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4H9.5A.5.5 0 0 1 9 3.5V1Z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[12.5px] text-ink font-semibold truncate" title={filename}>
            {primary}
          </div>
          {highlight && (
            <span
              title="Just generated"
              className="inline-flex items-center bg-green text-white text-[9.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded font-mono flex-shrink-0 animate-pop-in"
            >
              New
            </span>
          )}
        </div>
        {secondary && (
          <div className="text-[10.5px] text-ink-soft font-mono mt-0.5 truncate" title={secondary}>
            {secondary}
          </div>
        )}
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
          href={downloadUrl(prospect, 'output', filename)}
          aria-label="Download"
          title="Download"
          className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-bd text-green hover:bg-green hover:text-white hover:border-green cursor-pointer transition-colors no-underline"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
            <path d="M8 1a.75.75 0 0 1 .75.75v7.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V1.75A.75.75 0 0 1 8 1Zm-6 11.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
