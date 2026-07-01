import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import UserMenu from '../components/auth/UserMenu.jsx';
import Hero from '../components/layout/Hero.jsx';
import Footer from '../components/layout/Footer.jsx';
import DropZone from '../components/pipeline/DropZone.jsx';
import SelectedFilesList from '../components/pipeline/SelectedFilesList.jsx';
import WebSearchToggle from '../components/pipeline/WebSearchToggle.jsx';
import BulletPointsToggle from '../components/pipeline/BulletPointsToggle.jsx';
import ProcessingPanel from '../components/pipeline/ProcessingPanel.jsx';
import PreviewModal from '../components/pipeline/PreviewModal.jsx';
import InputFileRow from '../components/prospect/InputFileRow.jsx';
import OutputFileRow from '../components/prospect/OutputFileRow.jsx';
import Button from '../components/ui/Button.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import useJobPolling from '../hooks/useJobPolling.js';
import {
  listProspectFiles,
  uploadFile,
  startGenerate,
  deleteFile,
} from '../lib/api.js';
import { friendlyUploadError, validateFiles } from '../lib/errors.js';
import { formatRelative, parseOutputFilename } from '../lib/format.js';
import { useToast } from '../components/ui/Toast.jsx';
import { useConfirm } from '../components/ui/Confirm.jsx';

export default function ViewProspect() {
  const { name } = useParams();
  const prospectName = decodeURIComponent(name);
  const toast = useToast();
  const confirm = useConfirm();

  const [inputFiles, setInputFiles] = useState(null);
  const [outputFiles, setOutputFiles] = useState(null);

  const [selected, setSelected] = useState([]);
  const [webSearch, setWebSearch] = useState(false);
  const [bulletPoints, setBulletPoints] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [newOutputFile, setNewOutputFile] = useState('');

  const [previewState, setPreviewState] = useState({ open: false, folder: '', filename: '' });

  const loadFiles = useCallback(async () => {
    const [inp, out] = await Promise.all([
      listProspectFiles(prospectName, 'input', { detailed: true }),
      listProspectFiles(prospectName, 'output', { detailed: true }),
    ]);
    setInputFiles(inp);
    setOutputFiles(out);
  }, [prospectName]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const lastActivity = useMemo(() => {
    if (!inputFiles && !outputFiles) return null;
    const all = [...(inputFiles || []), ...(outputFiles || [])];
    const mostRecent = all
      .map((f) => f.last_modified)
      .filter(Boolean)
      .sort()
      .pop();
    return mostRecent || null;
  }, [inputFiles, outputFiles]);

  function onPickFiles(files) {
    const error = validateFiles(files);
    if (error) {
      toast.error(error);
      return;
    }
    setSelected(files);
  }

  async function onGenerate() {
    if (!selected.length) return;
    setGenerating(true);
    setNewOutputFile('');
    try {
      for (const f of selected) {
        try {
          await uploadFile(prospectName, f);
        } catch (e) {
          throw new Error(friendlyUploadError(f.name, e.serverError));
        }
      }
      const id = await startGenerate(prospectName, webSearch, bulletPoints, selected.map(f => f.name));
      setJobId(id);
    } catch (e) {
      toast.error(e.message);
      setGenerating(false);
    }
  }

  async function onCancel() {
    const ok = await confirm({
      tone: 'danger',
      title: 'Stop tracking this job?',
      message: 'The pipeline will keep running on the server. You can refresh this page later to see the result.',
      confirmLabel: 'Stop tracking',
    });
    if (!ok) return;
    setJobId(null);
    setGenerating(false);
    toast.info('No longer following the running job');
  }

  const job = useJobPolling(jobId, {
    onDone: async (j) => {
      setNewOutputFile(j.output_file || '');
      setSelected([]);
      setGenerating(false);
      setJobId(null);
      await loadFiles();
      toast.success('Document generated', { title: 'Pipeline complete' });
    },
    onError: (e) => {
      toast.error(e.message);
      setGenerating(false);
      setJobId(null);
    },
  });

  const step = job?.step || 0;
  const status = job?.status || (generating ? 'starting' : '');
  const statusMsg = job?.message || '';

  async function onDeleteInput(filename) {
    const ok = await confirm({
      tone: 'danger',
      title: 'Delete file',
      message: `Permanently delete "${filename}"? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteFile(prospectName, 'input', filename);
      setInputFiles((prev) => prev.filter((f) => f.filename !== filename));
      toast.success(`Deleted "${filename}"`);
    } catch (e) {
      toast.error(e.message || 'Delete failed');
    }
  }

  function openPreview(folder, filename) {
    setPreviewState({ open: true, folder, filename });
  }

  const inputCount = inputFiles?.length ?? 0;
  const outputCount = outputFiles?.length ?? 0;
  const loading = inputFiles === null || outputFiles === null;

  return (
    <div className="h-screen flex flex-col">
      <Header
        breadcrumb={[
          { label: 'Prospects', to: '/' },
          { label: prospectName },
        ]}
        rightSlot={<UserMenu />}
      />

      <Hero
        compact
        variant="blank"
        title={prospectName}
        sub={
          <span className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" />
              {inputCount} input file{inputCount === 1 ? '' : 's'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" />
              {outputCount} generated document{outputCount === 1 ? '' : 's'}
            </span>
            {lastActivity && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" />
                Last activity {formatRelative(lastActivity)}
              </span>
            )}
          </span>
        }
      />

      <main className="flex-1 w-full px-4 sm:px-10 py-4 flex flex-col min-h-0 page-fade">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1px_1fr] flex-1 min-h-0 overflow-hidden">

            {/* ── Input Panel ── */}
            <div className="px-5 py-5 flex flex-col overflow-y-auto overflow-x-hidden h-full scrollbar-thin">
              <div className="flex items-center justify-between pb-3 border-b border-bd mb-3 flex-shrink-0">
                <div className="text-[11.5px] font-bold text-ink-muted uppercase tracking-[0.09em] font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue flex-shrink-0" />
                  Input Files
                </div>
                <span className="text-[10.5px] font-mono text-ink-soft">
                  {inputCount} file{inputCount === 1 ? '' : 's'}
                </span>
              </div>

              {/* Existing files FIRST */}
              {loading && (
                <div className="space-y-2 mb-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
              )}

              {!loading && inputCount > 0 && (
                <div className="flex flex-col gap-1.5 mb-4">
                  {inputFiles.map((f, i) => (
                    <InputFileRow
                      key={f.filename}
                      index={i + 1}
                      prospect={prospectName}
                      file={f}
                      onPreview={() => openPreview('input', f.filename)}
                      onDelete={() => onDeleteInput(f.filename)}
                    />
                  ))}
                </div>
              )}

              {!loading && inputCount === 0 && !generating && (
                <div className="text-[12.5px] text-ink-soft mb-4 px-1">
                  No transcripts uploaded yet. Add files below to get started.
                </div>
              )}

              {/* Add more / first upload */}
              {!generating && (
                <>
                  <DropZone
                    onFiles={onPickFiles}
                    compact={inputCount > 0}
                    label={inputCount > 0 ? 'Add more transcripts' : 'Drop transcripts or click to browse'}
                  />
                  <SelectedFilesList files={selected} startIndex={inputCount} />

                  {selected.length > 0 && (
                    <div className="flex flex-col gap-2 mt-1">
                      <Button variant="primary" size="xl" onClick={onGenerate}>
                        <svg viewBox="0 0 20 20" className="w-[15px] h-[15px] fill-current">
                          <path d="M4 4l12 6-12 6V4z" />
                        </svg>
                        Generate Document
                      </Button>
                      <WebSearchToggle checked={webSearch} onChange={setWebSearch} />
                      <BulletPointsToggle checked={bulletPoints} onChange={setBulletPoints} />
                    </div>
                  )}
                </>
              )}

              {generating && (
                <>
                  <ProcessingPanel step={step} status={status} message={statusMsg} />
                  <button
                    type="button"
                    onClick={onCancel}
                    className="mt-2 text-[12px] text-ink-soft hover:text-red cursor-pointer bg-transparent border-none py-2 transition-colors"
                  >
                    Stop following this job
                  </button>
                </>
              )}
            </div>

            <div className="hidden sm:block bg-bd" />

            {/* ── Output Panel ── */}
            <div className="px-5 py-5 flex flex-col overflow-y-auto overflow-x-hidden h-full scrollbar-thin border-t border-bd sm:border-t-0">
              <div className="flex items-center justify-between pb-3 border-b border-bd mb-3 flex-shrink-0">
                <div className="text-[11.5px] font-bold text-ink-muted uppercase tracking-[0.09em] font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green flex-shrink-0" />
                  Generated Documents
                </div>
                <span className="text-[10.5px] font-mono text-ink-soft">
                  {outputCount} file{outputCount === 1 ? '' : 's'}
                </span>
              </div>

              {loading && (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                  ))}
                </div>
              )}

              {!loading && outputCount === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-3 py-8">
                  <div className="w-14 h-14 rounded-2xl bg-bg3 border border-bd flex items-center justify-center mb-3.5">
                    <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-ink-soft fill-none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h4 className="text-[13.5px] font-bold text-ink mb-1">No documents yet</h4>
                  <p className="text-[12px] text-ink-muted leading-relaxed max-w-[260px]">
                    Generated Discovery Profiles will appear here once you run the pipeline.
                  </p>
                </div>
              )}

              {!loading && outputCount > 0 && (
                <div className="flex flex-col gap-2">
                  {outputFiles
                    .slice()
                    .sort((a, b) => (b.last_modified || '').localeCompare(a.last_modified || ''))
                    .map((f) => (
                      <OutputFileRow
                        key={f.filename}
                        prospect={prospectName}
                        file={f}
                        highlight={f.filename === newOutputFile}
                        onPreview={() => openPreview('output', f.filename)}
                      />
                    ))}
                </div>
              )}
            </div>
        </div>
      </main>

      <Footer />

      <PreviewModal
        open={previewState.open}
        onClose={() => setPreviewState((s) => ({ ...s, open: false }))}
        prospect={prospectName}
        folder={previewState.folder}
        filename={previewState.filename}
      />
    </div>
  );
}
