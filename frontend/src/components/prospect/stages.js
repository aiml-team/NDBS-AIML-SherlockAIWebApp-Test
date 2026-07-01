// ── Stage definitions ────────────────────────────────────────────────────────
// Keys must also match VALID_STAGES in sherlock Web App/app.py.

export const STAGES = [
  {
    key: 'stage_1',
    label: 'In Progress',
    color: 'bg-amber-lt text-amber-dark border-amber-mid',
    dot: 'bg-amber-400',
  },
  {
    key: 'stage_2',
    label: 'Won',
    color: 'bg-green-lt text-green-dark border-green-mid',
    dot: 'bg-green',
  },
  {
    key: 'stage_3',
    label: 'Lost',
    color: 'bg-red-lt text-red border-red-mid',
    dot: 'bg-red',
  },
];

export const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));
