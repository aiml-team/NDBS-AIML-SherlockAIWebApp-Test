import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import Hero from '../components/layout/Hero.jsx';
import Footer from '../components/layout/Footer.jsx';
import UserMenu from '../components/auth/UserMenu.jsx';
import ProspectRow from '../components/prospect/ProspectRow.jsx';
import ProspectCard from '../components/prospect/ProspectCard.jsx';
import ViewToggle from '../components/prospect/ViewToggle.jsx';
import IndustrySidebar, { INDUSTRIES } from '../components/prospect/IndustrySidebar.jsx';
import { STAGES } from '../components/prospect/stages.js';
import Skeleton from '../components/ui/Skeleton.jsx';
import useViewMode from '../hooks/useViewMode.js';
import { listProspects, deleteProspect, setProspectStage, setProspectIndustry } from '../lib/api.js';
import { useToast } from '../components/ui/Toast.jsx';
import { useConfirm } from '../components/ui/Confirm.jsx';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
const SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl K';

export default function Dashboard() {
  const [prospects, setProspects] = useState(null);
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState('all');
  const [stage, setStage] = useState('all');
  const [view, setView] = useViewMode();
  const toast = useToast();
  const confirm = useConfirm();
  const searchRef = useRef(null);

  async function load() {
    // Show stale data from last visit immediately so the page isn't blank
    try {
      const cached = localStorage.getItem('sherlock_prospects_v1');
      if (cached) setProspects((prev) => prev ?? JSON.parse(cached));
    } catch { /* ignore parse errors */ }

    try {
      const data = await listProspects();
      setProspects(data);
      try { localStorage.setItem('sherlock_prospects_v1', JSON.stringify(data)); } catch { /* ignore quota errors */ }
    } catch (e) {
      setProspects((prev) => prev ?? []);
      toast.error(e.message || 'Failed to load prospects');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    function onKey(e) {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (k === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const industryCounts = useMemo(() => {
    if (!prospects) return {};
    const counts = { _total: prospects.length };
    INDUSTRIES.forEach((ind) => { if (ind.key !== 'all') counts[ind.key] = 0; });
    prospects.forEach((p) => {
      const key = p.industry || 'other';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [prospects]);

  const filtered = useMemo(() => {
    if (!prospects) return [];
    const q = query.trim().toLowerCase();
    let list = prospects;
    if (industry !== 'all') list = list.filter((p) => (p.industry || 'other') === industry);
    if (stage !== 'all') list = list.filter((p) => (p.stage || null) === stage);
    if (!q) return list;
    return list.filter(
      (p) =>
        p.prospect_name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q),
    );
  }, [prospects, query, industry, stage]);

  const loading = prospects === null;
  const total = prospects?.length || 0;
  const showingCount = filtered.length;

  async function handleDelete(name) {
    const ok = await confirm({
      tone: 'danger',
      title: 'Delete prospect',
      message: `Permanently delete "${name}" and all its uploaded and generated files? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteProspect(name);
      toast.success(`Deleted "${name}"`);
      await load();
    } catch (e) {
      toast.error(e.message || 'Delete failed');
    }
  }

  async function handleIndustryChange(prospectName, newIndustry) {
    setProspects((prev) =>
      prev.map((p) => p.prospect_name === prospectName ? { ...p, industry: newIndustry } : p),
    );
    try {
      await setProspectIndustry(prospectName, newIndustry);
    } catch (e) {
      toast.error(e.message || 'Failed to update industry');
      load();
    }
  }

  async function handleStageChange(prospectName, newStage) {
    setProspects((prev) =>
      prev.map((p) => p.prospect_name === prospectName ? { ...p, stage: newStage || undefined } : p),
    );
    try {
      await setProspectStage(prospectName, newStage);
    } catch (e) {
      toast.error(e.message || 'Failed to update stage');
      load();
    }
  }

  const countChip = (
    <span
      className="inline-flex items-center gap-1.5 bg-bg3 border border-bd text-ink text-[11px] font-bold tracking-[0.06em] uppercase px-3 py-1 rounded-full font-mono"
      title={`${total} total prospects`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-green" />
      {loading ? '…' : `${total} prospect${total === 1 ? '' : 's'}`}
    </span>
  );

  return (
    <div className="h-screen flex flex-col">
      <Header rightSlot={<UserMenu />} />

      <Hero
        compact
        variant="blank"
        title="Prospects"
        sub="Select a prospect to upload transcripts and generate AI-produced documents."
        trailing={countChip}
      />

      <main className="flex-1 w-full px-4 sm:px-10 pt-4 pb-4 flex flex-col min-h-0 page-fade">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none">
              <svg viewBox="0 0 24 24" className="w-[15px] h-[15px] stroke-current fill-none block" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or description…"
              className="w-full pl-10 pr-16 py-2.5 border border-bd rounded-[10px] font-sans text-[13.5px] bg-white text-ink outline-none transition-all focus:border-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] placeholder:text-ink-soft"
            />
            <kbd
              className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center justify-center text-[10px] font-mono font-semibold text-ink-soft bg-bg3 border border-bd rounded-md px-1.5 py-0.5 pointer-events-none"
              title={`Press ${SHORTCUT_LABEL} from anywhere to focus search`}
            >
              {SHORTCUT_LABEL}
            </kbd>
          </div>
          <ViewToggle value={view} onChange={setView} />
          <Link
            to="/create-prospect"
            className="flex items-center gap-1.5 bg-btn-blue text-white border-none px-[18px] py-2.5 rounded-[10px] font-sans text-[13.5px] font-bold cursor-pointer whitespace-nowrap shadow-btnBlue transition-all hover:-translate-y-px hover:shadow-btnBlueLg no-underline"
          >
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-white">
              <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
            </svg>
            New Prospect
          </Link>
        </div>

        {/* Stage filter tabs */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <button
            type="button"
            onClick={() => setStage('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer ${
              stage === 'all'
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-ink-muted border-bd hover:bg-bg3 hover:text-ink'
            }`}
          >
            All stages
          </button>
          {STAGES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStage(s.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer ${
                stage === s.key
                  ? `${s.color} shadow-sm`
                  : 'bg-white text-ink-muted border-bd hover:bg-bg3 hover:text-ink'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
              {s.label}
            </button>
          ))}
        </div>

        {query && !loading && (
          <div className="text-[11.5px] text-ink-soft font-mono mb-2 px-1">
            Showing {showingCount} of {total}
          </div>
        )}

        <div className="flex flex-1 min-h-0 gap-4">
          <IndustrySidebar selected={industry} onChange={setIndustry} counts={industryCounts} />

          <div className="flex-1 flex flex-col min-h-0">
          {view === 'list' && (
            <div className="grid grid-cols-[1fr_116px_140px_40px] gap-3 bg-table-head px-[22px] py-3 rounded-[10px]">
              <span className="text-[10.5px] font-bold text-white/85 uppercase tracking-[0.1em] font-mono">Prospect</span>
              <span className="text-[10.5px] font-bold text-white/85 uppercase tracking-[0.1em] font-mono">Stage</span>
              <span className="text-[10.5px] font-bold text-white/85 uppercase tracking-[0.1em] font-mono">Last Activity</span>
              <span />
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
            {/* Loading state */}
            {loading && view === 'list' && (
              <div className="px-[22px] py-3.5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[1fr_116px_140px_40px] gap-3 items-center">
                    <div className="space-y-2">
                      <Skeleton className="h-3.5 w-[60%]" />
                      <Skeleton className="h-3 w-[40%]" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-7 rounded-lg" />
                  </div>
                ))}
              </div>
            )}

            {loading && view === 'grid' && (
              <div className="p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[110px] w-full rounded-[14px]" />
                ))}
              </div>
            )}

            {/* Empty-account state */}
            {!loading && filtered.length === 0 && !query && (
              <div className="py-14 px-6 text-center">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-blue-lt flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-blue fill-none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12h6m-3-3v6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-[15px] font-bold text-ink mb-1">No prospects yet</h3>
                <p className="text-[13px] text-ink-muted mb-5 max-w-[360px] mx-auto">
                  Start by creating a prospect, then upload meeting transcripts to generate a Discovery Profile.
                </p>
                <Link
                  to="/create-prospect"
                  className="inline-flex items-center gap-1.5 bg-btn-blue text-white border-none px-5 py-2.5 rounded-[10px] font-sans text-[13.5px] font-bold cursor-pointer no-underline shadow-btnBlue hover:shadow-btnBlueLg hover:-translate-y-px transition-all"
                >
                  Create your first prospect →
                </Link>
              </div>
            )}

            {/* No-search-results state */}
            {!loading && filtered.length === 0 && query && (
              <div className="py-14 text-center text-ink-soft text-[13.5px]">
                No prospects match <span className="font-semibold text-ink">"{query}"</span>.
              </div>
            )}

            {/* Populated — List */}
            {!loading && filtered.length > 0 && view === 'list' && filtered.map((p) => (
              <ProspectRow
                key={p.prospect_name}
                name={p.prospect_name}
                description={p.description}
                lastModified={p.last_modified}
                industry={p.industry || null}
                onIndustryChange={(ind) => handleIndustryChange(p.prospect_name, ind)}
                stage={p.stage || null}
                onStageChange={(s) => handleStageChange(p.prospect_name, s)}
                onDelete={() => handleDelete(p.prospect_name)}
              />
            ))}

            {/* Populated — Grid */}
            {!loading && filtered.length > 0 && view === 'grid' && (
              <div className="p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <ProspectCard
                    key={p.prospect_name}
                    name={p.prospect_name}
                    description={p.description}
                    lastModified={p.last_modified}
                    industry={p.industry || null}
                    onIndustryChange={(ind) => handleIndustryChange(p.prospect_name, ind)}
                    stage={p.stage || null}
                    onStageChange={(s) => handleStageChange(p.prospect_name, s)}
                    onDelete={() => handleDelete(p.prospect_name)}
                  />
                ))}
              </div>
            )}
          </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
