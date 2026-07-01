import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header.jsx';
import UserMenu from '../components/auth/UserMenu.jsx';
import Hero from '../components/layout/Hero.jsx';
import Footer from '../components/layout/Footer.jsx';
import Card, { CardHead, CardBody, CardTitle } from '../components/ui/Card.jsx';
import StepNum from '../components/ui/StepNum.jsx';
import AutocompleteInput from '../components/prospect/AutocompleteInput.jsx';
import ProspectBreadcrumb from '../components/prospect/ProspectBreadcrumb.jsx';
import DropZone from '../components/pipeline/DropZone.jsx';
import SelectedFilesList from '../components/pipeline/SelectedFilesList.jsx';
import WebSearchToggle from '../components/pipeline/WebSearchToggle.jsx';
import BulletPointsToggle from '../components/pipeline/BulletPointsToggle.jsx';
import ProcessingPanel from '../components/pipeline/ProcessingPanel.jsx';
import PreviewModal from '../components/pipeline/PreviewModal.jsx';
import Button from '../components/ui/Button.jsx';
import useJobPolling from '../hooks/useJobPolling.js';
import { listProspects, saveProspect, uploadFile, startGenerate, downloadUrl } from '../lib/api.js';
import { friendlyUploadError, validateFiles } from '../lib/errors.js';
import { useToast } from '../components/ui/Toast.jsx';
import { useConfirm } from '../components/ui/Confirm.jsx';

export default function CreateProspect() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [existing, setExisting] = useState([]);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  const [selected, setSelected] = useState([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [webSearch, setWebSearch] = useState(false);
  const [bulletPoints, setBulletPoints] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [outputFile, setOutputFile] = useState('');
  const [generationDone, setGenerationDone] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    listProspects().then(setExisting).catch(() => setExisting([]));
  }, []);

  // Navigate to ViewProspect once generation completes.
  // useEffect reads `name` fresh from state — avoids stale closure in onDone.
  useEffect(() => {
    if (generationDone && name) {
      navigate(`/view-prospect/${encodeURIComponent(name)}`);
    }
  }, [generationDone, name, navigate]);

  async function onConfirm() {
    if (saved) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Please enter a prospect name');
      return;
    }
    if (existing.some((p) => p.prospect_name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`"${trimmed}" already exists. Open it from the Dashboard instead.`);
      return;
    }
    try {
      const res = await saveProspect(trimmed);
      const finalName = res.prospect_name || trimmed;
      setName(finalName);
      setSaved(true);
      toast.success(`Prospect "${finalName}" created`);
    } catch (e) {
      toast.error(`Failed to save prospect: ${e.message}`);
    }
  }

  function onPickFiles(files) {
    const error = validateFiles(files);
    if (error) {
      toast.error(error);
      return;
    }
    setSelected(files);
  }

  async function onGenerate() {
    if (!selected.length) {
      toast.error('Add at least one transcript before generating');
      return;
    }
    setGenerating(true);
    setOutputFile('');
    try {
      for (const f of selected) {
        try {
          await uploadFile(name, f);
        } catch (e) {
          throw new Error(friendlyUploadError(f.name, e.serverError));
        }
      }
      const id = await startGenerate(name, webSearch, bulletPoints, selected.map(f => f.name));
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
      message: 'The pipeline will keep running on the server, but this tab will stop following it. You can refresh later to check on outputs.',
      confirmLabel: 'Stop tracking',
    });
    if (!ok) return;
    setJobId(null);
    setGenerating(false);
    toast.info('No longer following the running job');
  }

  const job = useJobPolling(jobId, {
    onDone: (j) => {
      setGenerating(false);
      setJobId(null);
      toast.success('Document generated', { title: 'Pipeline complete' });
      setGenerationDone(true);
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

  return (
    <div className="h-screen flex flex-col">
      <Header
        breadcrumb={[
          { label: 'Prospects', to: '/' },
          { label: saved ? name : 'New Prospect' },
        ]}
        rightSlot={<UserMenu />}
      />

      <Hero
        compact
        variant="blank"
        title="Create Prospect"
        sub={
          saved
            ? 'Upload one or more transcripts, then generate the Discovery Profile.'
            : 'Name your prospect, then upload transcripts to generate an AI Discovery Profile.'
        }
      />

      <main className="flex-1 w-full px-4 sm:px-10 pt-4 pb-3 flex flex-col min-h-0 page-fade">
        {!saved && (
          <div className="flex items-start gap-2.5 bg-amber-lt border border-amber-mid rounded-[10px] px-3.5 py-2.5 mb-3 text-[13px] text-amber-dark flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 mt-px stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              <strong>Pilot version.</strong> Always validate AI-generated content before sharing externally.
            </span>
          </div>
        )}

        {!saved && (
          <Card className="mb-3 flex-shrink-0">
            <CardHead>
              <StepNum>1</StepNum>
              <CardTitle>Name Your Prospect</CardTitle>
            </CardHead>
            <CardBody>
              <div className="flex gap-2.5 items-start">
                <AutocompleteInput
                  value={name}
                  onChange={setName}
                  onSubmit={onConfirm}
                  suggestions={existing}
                  onSelectExisting={(n) => {
                    setName(n);
                    toast.error(`"${n}" already exists`);
                  }}
                />
                <Button variant="primary" onClick={onConfirm}>
                  Continue →
                </Button>
              </div>
              <p className="text-[12px] text-ink-soft mt-3 leading-snug">
                Tip: use the customer's legal name. You can't rename a prospect after creation.
              </p>
            </CardBody>
          </Card>
        )}

        {saved && (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <ProspectBreadcrumb name={name} onChange={() => {
                setSaved(false);
                setSelected([]);
                setOutputFile('');
                toast.info('Editing prospect name');
              }} />
              <span
                title="Pilot version — always validate AI-generated content before sharing externally."
                className="inline-flex items-center gap-1.5 bg-amber-lt border border-amber-mid text-amber-dark text-[10.5px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full font-mono cursor-help"
              >
                <svg viewBox="0 0 24 24" className="w-3 h-3 stroke-current fill-none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Pilot
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1px_1fr] flex-1 min-h-0 overflow-hidden">
                  {/* Input Panel */}
                  <div className="px-5 py-4 flex flex-col overflow-y-auto overflow-x-hidden h-full scrollbar-thin">
                    <div className="text-[11.5px] font-bold text-ink-muted uppercase tracking-[0.09em] font-mono mb-3.5 flex items-center gap-2 flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-blue flex-shrink-0" />
                      Input
                    </div>

                    <DropZone onFiles={onPickFiles} />
                    <SelectedFilesList files={selected} startIndex={uploadedCount} />

                    {!generating && (
                      <div className="flex flex-col gap-2 mt-2">
                        <Button
                          variant="primary"
                          size="xl"
                          onClick={onGenerate}
                          disabled={!selected.length}
                          className={!selected.length ? 'opacity-50 cursor-not-allowed' : ''}
                        >
                          <svg viewBox="0 0 20 20" className="w-[15px] h-[15px] fill-current">
                            <path d="M4 4l12 6-12 6V4z" />
                          </svg>
                          Generate Document
                        </Button>
                        <WebSearchToggle checked={webSearch} onChange={setWebSearch} />
                        <BulletPointsToggle checked={bulletPoints} onChange={setBulletPoints} />
                      </div>
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

                  {/* Output Panel */}
                  <div className="px-5 py-4 flex flex-col overflow-y-auto overflow-x-hidden h-full scrollbar-thin border-t border-bd sm:border-t-0">
                    <div className="text-[11.5px] font-bold text-ink-muted uppercase tracking-[0.09em] font-mono mb-3.5 flex items-center gap-2 flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-green flex-shrink-0" />
                      Output
                    </div>

                    {!outputFile && !generating && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center px-3 py-8">
                        <div className="w-14 h-14 rounded-2xl bg-bg3 border border-bd flex items-center justify-center mb-3.5">
                          <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-ink-soft fill-none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h4 className="text-[13.5px] font-bold text-ink mb-1">Your document will appear here</h4>
                        <p className="text-[12px] text-ink-muted leading-relaxed max-w-[260px]">
                          Typical generation takes 2–5 minutes depending on transcript length.
                        </p>
                      </div>
                    )}

                    {!outputFile && generating && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center px-3 py-8">
                        <div className="w-14 h-14 rounded-2xl bg-blue-lt border border-blue-mid flex items-center justify-center mb-3.5 animate-pulse">
                          <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-blue fill-none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 6v6l4 2" />
                            <circle cx="12" cy="12" r="9" />
                          </svg>
                        </div>
                        <h4 className="text-[13.5px] font-bold text-ink mb-1">Working on it…</h4>
                        <p className="text-[12px] text-ink-muted leading-relaxed max-w-[260px]">
                          We'll surface the finished document right here when the pipeline completes.
                        </p>
                      </div>
                    )}

                    {outputFile && (
                      <div className="animate-pop-in">
                        <div className="group flex items-center gap-3 bg-gradient-to-br from-green-lt to-white border border-green-mid rounded-2xl px-3.5 py-3 shadow-card">
                          <div className="w-9 h-9 rounded-xl bg-green text-white flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
                              <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0h5L13 3.5v11A1.5 1.5 0 0 1 11.5 16h-7A1.5 1.5 0 0 1 3 14.5v-13ZM9 1H4.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4H9.5A.5.5 0 0 1 9 3.5V1Z" />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-semibold text-ink-muted uppercase tracking-[0.08em] font-mono">Generated</div>
                            <div className="text-[11px] text-ink-soft font-mono truncate mt-0.5" title={outputFile}>
                              {outputFile}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0 items-center">
                            <button
                              type="button"
                              aria-label="Preview"
                              title="Preview"
                              onClick={() => setPreviewOpen(true)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-bd text-blue hover:bg-blue hover:text-white hover:border-blue cursor-pointer transition-colors"
                            >
                              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                                <path d="M8 3C4 3 1.5 8 1.5 8S4 13 8 13s6.5-5 6.5-5S12 3 8 3Zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm0-4.5A1.5 1.5 0 1 0 8 9.5 1.5 1.5 0 0 0 8 6.5Z" />
                              </svg>
                            </button>
                            <a
                              href={downloadUrl(name, 'output', outputFile)}
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
                      </div>
                    )}
                  </div>
                </div>
          </>
        )}
      </main>

      <Footer />

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        prospect={name}
        folder="output"
        filename={outputFile}
      />
    </div>
  );
}
