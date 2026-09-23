/**
 * Compact numbered list of sources for an assistant message.
 *
 * Only the file name is shown to the user. The raw parent_id (a base64-
 * encoded blob URL) is not visually useful, so it is hidden — kept in the
 * DOM `title` attribute for hover-inspection during debugging.
 */
export default function SourceList({ sources }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 pt-2 border-t border-bd/70">
      <div className="text-[10px] font-semibold text-mute uppercase tracking-wider mb-1.5">
        Sources
      </div>
      <ol className="space-y-1">
        {sources.map((s, i) => (
          <li
            key={`${i}-${s.parent_id || s.title}`}
            title={s.parent_id || undefined}
            className="text-[12px] text-ink/85 flex items-start gap-2"
          >
            <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] rounded bg-blue-lt text-blue font-semibold text-[10.5px] mt-[1px] flex-shrink-0">
              {i + 1}
            </span>
            <span className="break-words">{cleanTitle(s.title)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Strip Sherlock filename noise so the list reads like a document name. */
function cleanTitle(raw) {
  if (!raw) return 'Untitled';
  // "output_<prospect>_<file>_<ts>.docx" → "<prospect> — <file>"
  const m = raw.match(/^output_(.+?)_(File[s\d\-]+)_\d{8}_\d{6}\.docx$/);
  if (m) return `${m[1]} — ${m[2]}`;
  return raw;
}
