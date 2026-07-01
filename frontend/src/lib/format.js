export function formatSize(bytes) {
  if (bytes == null || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(iso)} · ${hh}:${mm}`;
}

export function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const m = Math.round(diff / 60);
    return `${m} min${m === 1 ? '' : 's'} ago`;
  }
  if (diff < 86400) {
    const h = Math.round(diff / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (diff < 86400 * 7) {
    const days = Math.round(diff / 86400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return formatDate(iso);
}

/**
 * Parses the Flask-baked timestamp out of an output filename:
 *   output_Amazon Inc_File1_20260525_130225.docx → "25 May 2026 · 13:02"
 * Returns null when the pattern is absent.
 */
export function parseOutputFilename(filename) {
  if (!filename) return null;
  const match = filename.match(/_(\d{8})_(\d{6})\.docx$/i);
  if (!match) return null;
  const [, datePart, timePart] = match;
  const year = +datePart.slice(0, 4);
  const month = +datePart.slice(4, 6) - 1;
  const day = +datePart.slice(6, 8);
  const hh = +timePart.slice(0, 2);
  const mm = +timePart.slice(2, 4);
  const d = new Date(year, month, day, hh, mm);
  if (isNaN(d)) return null;
  const hhStr = String(hh).padStart(2, '0');
  const mmStr = String(mm).padStart(2, '0');
  return `${day} ${MONTHS[month]} ${year} · ${hhStr}:${mmStr}`;
}
