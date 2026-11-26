import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  draftSchema,
  makeDraft,
  narrationText,
  plannedSeconds,
  scriptMarkdown,
  storageKey,
  templates,
  timecode,
  wordCount,
  type Beat,
  type Draft,
  type Template,
} from './script';
import './writer.css';
import { useUnsavedNavigation } from '../useUnsavedNavigation';

export const download = (name: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const loadDraft = () => {
  try {
    const saved = localStorage.getItem(storageKey);
    return {
      draft: saved ? draftSchema.parse(JSON.parse(saved)) : makeDraft('devlog'),
      error: '',
    };
  } catch {
    return {
      draft: makeDraft('devlog'),
      error:
        'The browser draft could not be opened. It has not been overwritten. Open a saved draft or download your browser copy below.',
    };
  }
};

export const Writer = ({
  initialDraft,
  onSave,
}: {
  initialDraft?: Draft;
  onSave?: (draft: Draft) => Promise<void>;
}) => {
  const [initial] = useState(() =>
    initialDraft ? { draft: initialDraft, error: '' } : loadDraft(),
  );
  const [draft, setDraft] = useState(initial.draft);
  const [error, setError] = useState(initial.error);
  const [canSave, setCanSave] = useState(!initial.error);
  const [saved, setSaved] = useState(false);
  const [template, setTemplate] = useState<Template>('devlog');
  const [read, setRead] = useState(false);
  const [saving, setSaving] = useState(false);
  const [diskDraft, setDiskDraft] = useState(initialDraft);
  const dirty =
    onSave !== undefined && JSON.stringify(draft) !== JSON.stringify(diskDraft);
  useUnsavedNavigation(dirty);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!canSave || onSave) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setSaved(true);
    } catch {
      setSaved(false);
      setError(
        'Browser saving is unavailable. Save a draft file to keep your writing.',
      );
    }
  }, [draft, canSave, onSave]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const editBeat = (id: string, patch: Partial<Beat>) =>
    change(
      'beats',
      draft.beats.map((beat) =>
        beat.id === id ? { ...beat, ...patch } : beat,
      ),
    );
  const move = (index: number, offset: number) => {
    const beats = [...draft.beats];
    [beats[index], beats[index + offset]] = [
      beats[index + offset],
      beats[index],
    ];
    change('beats', beats);
  };
  const importDraft = async (file: File) => {
    try {
      const imported = draftSchema.parse(JSON.parse(await file.text()));
      if (
        !window.confirm(
          'Replace the current draft with this file? Save a draft file first if you need to keep it.',
        )
      )
        return;
      setDraft(imported);
      setCanSave(true);
      setError('');
    } catch {
      setError(
        'This file is not a valid Mercurius script draft. Your current writing is unchanged.',
      );
    }
  };
  const name =
    draft.title
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'untitled-video';
  const words = wordCount(narrationText(draft));
  const planned = plannedSeconds(draft);
  let elapsed = 0;
  return (
    <div className="sw-shell">
      <header className="sw-header">
        <a href="#production">Productions</a>
        <a className="sw-brand" href="#writer">
          MERCURIUS <span>/ Script writer</span>
        </a>
        <a href="#clips">Clips ↗</a>
        <a href="#study=intro&direction=parchment&ornament=meander">
          Design studies ↗
        </a>
      </header>
      <main className="sw-page">
        <div className="sw-title-row">
          <div>
            <span className="sw-eyebrow">Writing desk</span>
            <h1>Your next short.</h1>
          </div>
          <span role="status">
            {onSave
              ? dirty
                ? 'Unsaved episode changes'
                : 'Saved to episode'
              : saved
                ? 'Saved in this browser'
                : 'Not saved in browser'}
          </span>
        </div>
        <div className="sw-toolbar">
          {onSave ? (
            <button
              disabled={saving || !dirty}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave(draftSchema.parse(draft));
                  setDiskDraft(draft);
                  setError('');
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? 'Saving…' : 'Save to episode'}
            </button>
          ) : null}
          <button onClick={() => fileInput.current!.click()}>
            <Upload size={15} />
            Open draft
          </button>
          <button
            onClick={() =>
              download(
                `${name}.mercurius.json`,
                JSON.stringify(draft, null, 2),
                'application/json',
              )
            }
          >
            <Download size={15} />
            Save draft
          </button>
          <button
            onClick={() =>
              download(`${name}.md`, scriptMarkdown(draft), 'text/markdown')
            }
          >
            Export script .md
          </button>
          <button
            onClick={() =>
              download(
                `${name}-narration.txt`,
                narrationText(draft),
                'text/plain',
              )
            }
          >
            Narration .txt
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importDraft(file);
              event.target.value = '';
            }}
          />
        </div>
        {error ? (
          <div className="sw-error" role="alert">
            {error}
            {!canSave ? (
              <button
                onClick={() =>
                  download(
                    'browser-draft-recovery.txt',
                    localStorage.getItem(storageKey) ?? '',
                    'text/plain',
                  )
                }
              >
                Download browser copy
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="sw-layout">
          <section className="sw-manuscript" aria-label="Script draft">
            <input
              className="sw-video-title"
              aria-label="Video title"
              placeholder="Give this video a working title…"
              value={draft.title}
              onChange={(event) => change('title', event.target.value)}
            />
            <div className="sw-brief">
              {(
                [
                  [
                    'audience',
                    'Who is watching?',
                    'What do they already know?',
                  ],
                  [
                    'question',
                    'What is this video about?',
                    'One situation or question.',
                  ],
                  [
                    'takeaway',
                    'What should they leave with?',
                    'A result or an idea they can explain.',
                  ],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key}>
                  {label}
                  <textarea
                    rows={2}
                    value={draft[key]}
                    placeholder={placeholder}
                    onChange={(event) => change(key, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="sw-section-heading">
              <h2>{read ? 'Read-through' : 'The script'}</h2>
              <button aria-pressed={read} onClick={() => setRead(!read)}>
                {read ? 'Edit script' : 'Read narration'}
              </button>
            </div>
            {read ? (
              <div className="sw-read">
                {narrationText(draft) ||
                  'Your narration will appear here as you write.'}
              </div>
            ) : (
              draft.beats.map((beat, index) => {
                const start = elapsed;
                elapsed += beat.seconds;
                const prompt = [
                  ...templates.devlog,
                  ...templates.explainer,
                ].find(([title]) => title === beat.title);
                const estimated =
                  (wordCount(beat.narration) / draft.wordsPerMinute) * 60;
                return (
                  <article className="sw-beat" key={beat.id}>
                    <header>
                      <span className="sw-beat-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <input
                        aria-label={`Beat ${index + 1} title`}
                        value={beat.title}
                        onChange={(event) =>
                          editBeat(beat.id, { title: event.target.value })
                        }
                      />
                      <span className="sw-time">
                        {timecode(start)}–{timecode(elapsed)}
                      </span>
                      <label className="sw-duration">
                        <input
                          aria-label={`Beat ${index + 1} seconds`}
                          type="number"
                          min="0.1"
                          max="600"
                          step="0.1"
                          value={beat.seconds}
                          onChange={(event) => {
                            const value = event.target.valueAsNumber;
                            if (value > 0 && value <= 600)
                              editBeat(beat.id, { seconds: value });
                          }}
                        />
                        s
                      </label>
                    </header>
                    <div className="sw-beat-columns">
                      <label>
                        Narration
                        <textarea
                          rows={5}
                          placeholder={prompt?.[2] ?? 'What do you say?'}
                          value={beat.narration}
                          onChange={(event) =>
                            editBeat(beat.id, { narration: event.target.value })
                          }
                        />
                        <small
                          className={estimated > beat.seconds ? 'sw-over' : ''}
                        >
                          {wordCount(beat.narration)} words · ~
                          {Math.ceil(estimated)}s spoken
                          {estimated > beat.seconds
                            ? ' · exceeds this beat'
                            : ''}
                        </small>
                      </label>
                      <label>
                        Visual / sound
                        <textarea
                          rows={5}
                          placeholder={
                            prompt?.[3] ??
                            'What do we see or hear? Include footage, diagram, text, pauses, and sound cues.'
                          }
                          value={beat.visual}
                          onChange={(event) =>
                            editBeat(beat.id, { visual: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    <details className="sw-evidence">
                      <summary>
                        Evidence / to verify
                        {beat.evidence ? ' · notes added' : ''}
                      </summary>
                      <textarea
                        aria-label={`Beat ${index + 1} evidence`}
                        rows={2}
                        placeholder="Source path + revision, capture to record, or a claim still to check."
                        value={beat.evidence}
                        onChange={(event) =>
                          editBeat(beat.id, { evidence: event.target.value })
                        }
                      />
                    </details>
                    <footer>
                      <button
                        aria-label={`Move beat ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        aria-label={`Move beat ${index + 1} down`}
                        disabled={index === draft.beats.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        aria-label={`Delete beat ${index + 1}`}
                        disabled={draft.beats.length === 1}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete “${beat.title}” and its writing?`,
                            )
                          )
                            change(
                              'beats',
                              draft.beats.filter((item) => item.id !== beat.id),
                            );
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </footer>
                  </article>
                );
              })
            )}
            {!read ? (
              <button
                className="sw-add"
                disabled={draft.beats.length >= 100}
                onClick={() =>
                  change('beats', [
                    ...draft.beats,
                    {
                      id: crypto.randomUUID(),
                      title: 'New beat',
                      seconds: 5,
                      narration: '',
                      visual: '',
                      evidence: '',
                    },
                  ])
                }
              >
                <Plus size={16} />
                Add a beat
              </button>
            ) : null}
            <label className="sw-scratch">
              Scratchpad
              <textarea
                rows={4}
                placeholder="Loose ideas, alternate openings, recording notes…"
                value={draft.notes}
                onChange={(event) => change('notes', event.target.value)}
              />
            </label>
          </section>
          <aside className="sw-side">
            <section>
              <h2>Timing</h2>
              <div className="sw-total">
                {planned.toFixed(1)}
                <span>seconds planned</span>
              </div>
              <label>
                Target length
                <input
                  type="number"
                  min="1"
                  max="600"
                  value={draft.targetSeconds}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (value > 0 && value <= 600)
                      change('targetSeconds', value);
                  }}
                />
              </label>
              <p className={planned > draft.targetSeconds ? 'sw-over' : ''}>
                {planned > draft.targetSeconds
                  ? `${(planned - draft.targetSeconds).toFixed(1)}s over target`
                  : `${(draft.targetSeconds - planned).toFixed(1)}s available`}
              </p>
              <hr />
              <p>
                {words} narration words · ~
                {Math.ceil((words / draft.wordsPerMinute) * 60)}s spoken
              </p>
              <label>
                Reading pace · words/min
                <input
                  type="number"
                  min="60"
                  max="300"
                  value={draft.wordsPerMinute}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (value >= 60 && value <= 300)
                      change('wordsPerMinute', value);
                  }}
                />
              </label>
              <small>
                Estimate only. Read aloud and allow time for demonstrations and
                pauses. The curtain fits inside the first beat.
              </small>
            </section>
            <section>
              <h2>Starting structure</h2>
              <select
                aria-label="Starting template"
                value={template}
                onChange={(event) =>
                  setTemplate(event.target.value as Template)
                }
              >
                <option value="devlog">Devlog / a change in Roemer</option>
                <option value="explainer">Technical explainer</option>
              </select>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      'Start a new draft? Save the current draft file first if you want to keep it.',
                    )
                  ) {
                    setDraft(makeDraft(template));
                    setCanSave(true);
                    setError('');
                  }
                }}
              >
                Start new draft
              </button>
              <small>
                Five editable beats, 45 seconds as a starting point. Change the
                order or length to suit the story.
              </small>
            </section>
            <details className="sw-guide">
              <summary>Writing notes & sources</summary>
              <p>
                Make the first image and line carry the question or change. Try
                narration over the curtain rather than waiting for it to finish.
              </p>
              <p>
                Give each beat a visual job. Show a relationship or a result
                while explaining why it matters. Read the draft aloud; rewrite
                anything you would not say.
              </p>
              <p>
                Finish the thought you opened. A request to follow or comment is
                optional.
              </p>
              <a
                href="https://blog.youtube/creator-and-artist-stories/youtube-shorts-deep-dive/"
                target="_blank"
                rel="noreferrer"
              >
                YouTube · Shorts creator interview
              </a>
              <a
                href="https://ads.tiktok.com/business/en/blog/creative-best-practices-top-performing-ads"
                target="_blank"
                rel="noreferrer"
              >
                TikTok · Creative Codes (advertising)
              </a>
              <a
                href="https://tools.cdc.gov/medialibrary/docs/AudioScriptWritingGuide.pdf"
                target="_blank"
                rel="noreferrer"
              >
                CDC · Writing for the ear
              </a>
              <a
                href="https://downloads.bbc.co.uk/academy/youngreporter/Lesson%20Plans%20-%20Lesson%20Five%20-%20Transcript%20English.pdf"
                target="_blank"
                rel="noreferrer"
              >
                BBC · Writing for different platforms
              </a>
              <a
                href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5132380/"
                target="_blank"
                rel="noreferrer"
              >
                Brame · Educational video review
              </a>
              <small>
                Creator advice, ad research, and educational research have
                different scopes. The beat structure and timings here are
                editorial choices, not platform requirements.
              </small>
            </details>
          </aside>
        </div>
      </main>
    </div>
  );
};
