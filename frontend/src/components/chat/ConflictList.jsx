import { useState } from 'react';

const BASE = import.meta.env.VITE_API_BASE || '';

function notifyFilesChanged(prospect) {
  window.dispatchEvent(new CustomEvent('sherlock:files-changed', { detail: { prospect } }));
}

async function resolveOne(prospect, conflictId, chosenValue) {
  const res = await fetch(`${BASE}/api/prospect/${encodeURIComponent(prospect)}/resolve-conflict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ conflict_id: conflictId, chosen_value: chosenValue }),
  });
  if (!res.ok) throw new Error('Resolve failed');
  return res.json();
}

async function resolveBatch(prospect, resolutions) {
  const res = await fetch(`${BASE}/api/prospect/${encodeURIComponent(prospect)}/resolve-conflicts-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ resolutions }),
  });
  if (!res.ok) throw new Error('Batch resolve failed');
  return res.json();
}

function downloadUrl(prospect, filename) {
  return `${BASE}/download/${encodeURIComponent(prospect)}/output/${encodeURIComponent(filename)}`;
}

// ─── Main ConflictList ────────────────────────────────────────────────────────

export default function ConflictList({ conflicts, prospect, onResolved }) {
  const [items, setItems] = useState(conflicts || []);
  // selections: { [conflictId]: chosen_value string ('' = selected but no value yet) }
  const [selections, setSelections] = useState({});
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  if (!items || items.length === 0) return null;

  const unresolved = items.filter((c) => c.status !== 'resolved');
  const selectedIds = Object.keys(selections);
  const readyCount = selectedIds.filter((id) => selections[id]?.trim()).length;

  function markResolved(id, value) {
    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'resolved', resolved_value: value } : c))
    );
  }

  function toggleSelect(id) {
    setSelections((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = '';
      return next;
    });
  }

  function setChosenValue(id, value) {
    setSelections((prev) => ({ ...prev, [id]: value }));
  }

  function selectAll() {
    const next = {};
    unresolved.forEach((c) => { next[c.id] = ''; });
    setSelections(next);
  }

  async function handleBatchResolve() {
    const resolutions = selectedIds
      .filter((id) => selections[id]?.trim())
      .map((id) => ({ conflict_id: id, chosen_value: selections[id].trim() }));
    if (!resolutions.length || !prospect) return;
    setBatchLoading(true);
    try {
      const result = await resolveBatch(prospect, resolutions);
      resolutions.forEach(({ conflict_id, chosen_value }) => markResolved(conflict_id, chosen_value));
      setSelections({});
      setBatchResult(result);
      notifyFilesChanged(prospect);
      onResolved?.();
    } catch {
      /* keep selections so user can retry */
    } finally {
      setBatchLoading(false);
    }
  }

  return (
    <div className="mt-3 pt-2 border-t border-amber-mid">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-semibold text-amber uppercase tracking-wider">
          Data Conflicts · {unresolved.length} unresolved
        </div>
        {unresolved.length > 0 && (
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                onClick={() => setSelections({})}
                className="text-[10px] text-ink/40 hover:text-ink/70"
              >
                Clear
              </button>
            )}
            <button
              onClick={selectAll}
              className="text-[10px] font-medium text-amber-dark hover:underline"
            >
              Select All
            </button>
          </div>
        )}
      </div>

      {/* Batch submit bar */}
      {selectedIds.length > 0 && (
        <div className="mb-2 flex items-center justify-between bg-amber/10 border border-amber-mid rounded-lg px-3 py-2 gap-2">
          <span className="text-[11px] text-amber-dark font-medium">
            {readyCount} / {selectedIds.length} ready
          </span>
          <button
            onClick={handleBatchResolve}
            disabled={batchLoading || readyCount === 0}
            className="text-[11px] font-semibold px-3 py-1 rounded-md bg-amber text-white
                       hover:bg-amber-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {batchLoading ? 'Resolving…' : `Resolve ${readyCount} → 1 file`}
          </button>
        </div>
      )}

      {/* Conflict items */}
      <ol className="space-y-2">
        {items.map((c, i) => (
          <ConflictItem
            key={c.id || i}
            conflict={c}
            index={i}
            prospect={prospect}
            isSelected={c.id in selections}
            selectedValue={selections[c.id] ?? ''}
            batchLoading={batchLoading}
            onToggleSelect={() => toggleSelect(c.id)}
            onSetValue={(v) => setChosenValue(c.id, v)}
            onIndividualResolved={(value) => markResolved(c.id, value)}
            onResolved={onResolved}
          />
        ))}
      </ol>

      {/* Diff panel after batch resolve */}
      {batchResult && (
        <DiffPanel result={batchResult} prospect={prospect} />
      )}
    </div>
  );
}

// ─── Single conflict item ─────────────────────────────────────────────────────

function ConflictItem({
  conflict, index, prospect,
  isSelected, selectedValue, batchLoading,
  onToggleSelect, onSetValue,
  onIndividualResolved, onResolved,
}) {
  const [indivLoading, setIndivLoading] = useState(null);
  const [indivNewFile, setIndivNewFile] = useState(null);
  const [customValue, setCustomValue] = useState('');

  const resolved = conflict.status === 'resolved';
  const resolvedVal = conflict.resolved_value || '';

  async function handleKeepNow(value, side) {
    if (!prospect || !conflict.id || !value.trim()) return;
    setIndivLoading(side);
    try {
      const result = await resolveOne(prospect, conflict.id, value.trim());
      if (result.new_output_file) setIndivNewFile(result.new_output_file);
      onIndividualResolved(value.trim());
      notifyFilesChanged(prospect);
      onResolved?.();
    } catch {
      /* ignore */
    } finally {
      setIndivLoading(null);
    }
  }

  return (
    <li className={`rounded-lg border text-[12px] ${
      resolved
        ? 'bg-green-50 border-green-200'
        : isSelected
        ? 'bg-blue-50 border-blue-300'
        : 'bg-amber-lt border-amber-mid'
    }`}>
      <div className="px-3 py-2">
        <div className="flex items-start gap-2">
          {/* Checkbox (only for unresolved) */}
          {!resolved && prospect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              disabled={batchLoading}
              className="mt-[2px] flex-shrink-0 accent-amber cursor-pointer"
            />
          )}

          <div className="min-w-0 w-full">
            {/* Title */}
            <div className={`font-semibold mb-0.5 ${resolved ? 'text-green-700' : 'text-ink/80'}`}>
              <span className="mr-1">{index + 1}.</span>
              {conflict.section} › {conflict.field}
            </div>
            <div className="text-ink/50 text-[11px] mb-1.5 italic">{conflict.description}</div>

            {resolved ? (
              /* ── Resolved state ── */
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-green-700 font-medium">
                  <span>✓</span>
                  <span>Resolved: {resolvedVal}</span>
                </div>
                {indivNewFile && (
                  <a
                    href={downloadUrl(prospect, indivNewFile)}
                    download
                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 underline break-all"
                  >
                    <span>↓</span> {indivNewFile}
                  </a>
                )}
              </div>
            ) : isSelected ? (
              /* ── Batch selection mode: radio A/B + custom ── */
              <div className="space-y-1.5">
                <RadioChoice
                  label="A"
                  value={conflict.value_a}
                  checked={selectedValue === conflict.value_a}
                  onChange={() => onSetValue(conflict.value_a)}
                />
                <RadioChoice
                  label="B"
                  value={conflict.value_b}
                  checked={selectedValue === conflict.value_b}
                  onChange={() => onSetValue(conflict.value_b)}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`custom-radio-${conflict.id}`}
                    checked={selectedValue !== '' && selectedValue !== conflict.value_a && selectedValue !== conflict.value_b}
                    onChange={() => onSetValue(customValue)}
                    className="flex-shrink-0 accent-blue-500"
                  />
                  <input
                    type="text"
                    value={customValue}
                    onChange={(e) => {
                      setCustomValue(e.target.value);
                      onSetValue(e.target.value);
                    }}
                    placeholder="Custom value…"
                    className="flex-1 text-[11px] px-2 py-0.5 rounded border border-blue-300
                               bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
            ) : (
              /* ── Normal mode: immediate keep buttons ── */
              <div className="space-y-1.5">
                <ValueRow
                  label="A" value={conflict.value_a}
                  loading={indivLoading === 'a'} disabled={!!indivLoading}
                  onKeep={() => handleKeepNow(conflict.value_a, 'a')}
                  showButton={!!prospect}
                />
                <ValueRow
                  label="B" value={conflict.value_b}
                  loading={indivLoading === 'b'} disabled={!!indivLoading}
                  onKeep={() => handleKeepNow(conflict.value_b, 'b')}
                  showButton={!!prospect}
                />
                {prospect && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customValue.trim())
                          handleKeepNow(customValue, 'custom');
                      }}
                      disabled={!!indivLoading}
                      placeholder="Enter correct value…"
                      className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded-md border border-amber-mid
                                 bg-white placeholder-ink/30 focus:outline-none focus:ring-1 focus:ring-amber
                                 disabled:opacity-40"
                    />
                    <button
                      type="button"
                      onClick={() => handleKeepNow(customValue, 'custom')}
                      disabled={!!indivLoading || !customValue.trim()}
                      className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-md border
                                 bg-white border-amber-mid text-amber-dark
                                 hover:bg-amber hover:text-white hover:border-amber
                                 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {indivLoading === 'custom' ? '…' : 'Keep Custom'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// ─── Radio choice row (used in batch mode) ────────────────────────────────────

function RadioChoice({ label, value, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="flex-shrink-0 accent-blue-500"
      />
      <span className="bg-white border border-blue-200 rounded px-2 py-0.5 text-blue-800 font-mono text-[11px] flex-1 break-words">
        <span className="font-bold">{label}:</span> {value}
      </span>
    </label>
  );
}

// ─── Immediate keep row (used in normal mode) ────────────────────────────────

function ValueRow({ label, value, loading, disabled, onKeep, showButton }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="bg-white border border-amber-mid rounded px-2 py-0.5 text-amber-dark font-mono text-[11px] flex-1 min-w-0 break-words">
        <span className="font-bold">{label}:</span> {value}
      </span>
      {showButton && (
        <button
          type="button"
          onClick={onKeep}
          disabled={disabled}
          className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-md border
                     bg-white border-amber-mid text-amber-dark
                     hover:bg-amber hover:text-white hover:border-amber
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '…' : `Keep ${label}`}
        </button>
      )}
    </div>
  );
}

// ─── Diff panel shown after batch resolve ─────────────────────────────────────

function DiffPanel({ result, prospect }) {
  const [expanded, setExpanded] = useState(false);
  const changesCount = result.changes?.length ?? 0;

  return (
    <div className="mt-3 rounded-lg border border-green-200 bg-green-50 overflow-hidden">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <div className="text-[11px] font-semibold text-green-700">
          ✓ {result.resolved_count} conflict{result.resolved_count !== 1 ? 's' : ''} resolved
          {changesCount > 0 && ` · ${changesCount} field${changesCount !== 1 ? 's' : ''} changed`}
        </div>
        <div className="flex items-center gap-3">
          {result.new_output_file && (
            <a
              href={downloadUrl(prospect, result.new_output_file)}
              download
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline"
            >
              ↓ Download updated file
            </a>
          )}
          {changesCount > 0 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[11px] text-green-700 hover:underline font-medium"
            >
              {expanded ? 'Hide diff ▲' : 'Show diff ▼'}
            </button>
          )}
        </div>
      </div>

      {/* Diff entries */}
      {expanded && changesCount > 0 && (
        <div className="border-t border-green-200 divide-y divide-green-100">
          {result.changes.map((change, i) => (
            <DiffEntry key={i} change={change} />
          ))}
        </div>
      )}
    </div>
  );
}

function DiffEntry({ change }) {
  const [open, setOpen] = useState(false);

  const beforeLines = (change.before || '').split('\n').filter((l) => l.trim());
  const afterSet = new Set((change.after || '').split('\n').map((l) => l.trim()));
  const removedCount = beforeLines.filter((l) => !afterSet.has(l.trim())).length;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-green-100 transition-colors"
      >
        <span className="text-[11px] font-mono text-ink/60 truncate">
          {change.section} › {change.field}
        </span>
        <span className="text-[10px] font-medium text-red-500 flex-shrink-0 ml-2">
          −{removedCount} line{removedCount !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div className="text-[11px] font-mono border-t border-green-100">
          {beforeLines.map((line, i) => {
            const removed = !afterSet.has(line.trim());
            return (
              <div
                key={i}
                className={`px-3 py-0.5 ${
                  removed
                    ? 'bg-red-50 text-red-600 line-through opacity-80'
                    : 'bg-white text-green-800'
                }`}
              >
                <span className="select-none mr-1 text-ink/30">{removed ? '−' : ' '}</span>
                {line}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
