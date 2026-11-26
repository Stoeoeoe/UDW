import { useEffect, useRef, useState } from 'react';
import { Writer, download } from '../writer/Writer';
import {
  draftSchema,
  makeDraft,
  narrationText,
  plannedSeconds,
  timecode,
} from '../writer/script';
import type { ProductionRecord } from '../../../scripts/production-service';
import type { Revision } from '../../../scripts/clip-service';
import {
  emptyShot,
  handoffMarkdown,
  newProduction,
  productionId,
  productionIssues,
  productionSchema,
  reviews,
  withDraft,
  type Production,
  type Shot,
} from './model';
import '../writer/writer.css';
import './production.css';
import { useUnsavedNavigation } from '../useUnsavedNavigation';

const request = async (data?: unknown): Promise<ProductionRecord[]> => {
  const response = await fetch(
    '/api/productions',
    data
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Mercurius': 'workbench',
          },
          body: JSON.stringify(data),
        }
      : undefined,
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return data ? [result] : result;
};

export const ProductionDesk = ({ writerId }: { writerId?: string }) => {
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState('');
  const [value, setValue] = useState<Production | null>(null);
  const [id, setId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void fetch('/api/clips/state')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setRevisions(result.revisions);
      })
      .catch((error: Error) =>
        setError(`Could not load clip revisions: ${error.message}`),
      );
    void request()
      .then((items) => {
        setRecords(items);
        setReady(true);
      })
      .catch((error: Error) => setError(error.message));
  }, []);
  const record = records.find((item) => item.value.id === selected);
  const dirty =
    value !== null && JSON.stringify(value) !== JSON.stringify(record?.value);
  useUnsavedNavigation(dirty);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (next: Production, revision: string | null) => {
    const [saved] = await request({
      value: productionSchema.parse(next),
      revision,
    });
    setRecords((items) =>
      [...items.filter((item) => item.value.id !== next.id), saved].sort(
        (a, b) => a.value.id.localeCompare(b.value.id),
      ),
    );
    setValue(saved.value);
    setSelected(saved.value.id);
    setNotice('Saved to productions/' + saved.value.id + '.json');
  };
  const leave = () =>
    !dirty ||
    window.confirm(
      'Leave with unsaved production changes? Download or save first to keep them.',
    );
  if (writerId && ready) {
    const editing = records.find((item) => item.value.id === writerId);
    return editing ? (
      <Writer
        key={writerId}
        initialDraft={editing.value.draft}
        onSave={async (draft) => {
          await save(withDraft(editing.value, draft), editing.revision);
        }}
      />
    ) : (
      <div className="sw-shell sw-page">
        <a href="#production">Back to productions</a>
        <p role="alert">Episode not found: {writerId}</p>
      </div>
    );
  }
  const issues = value ? productionIssues(value) : [];
  let elapsed = 0;
  return (
    <div className="sw-shell">
      <header className="sw-header">
        <a className="sw-brand" href="#production">
          MERCURIUS <span>/ Production desk</span>
        </a>
        <nav>
          <a href="#writer">Scratch writer</a> ·{' '}
          <a href="#clips">Clips & FilmCraft</a> ·{' '}
          <a href="#study=intro">Design studies</a>
        </nav>
      </header>
      <main className="sw-page">
        <div className="sw-title-row">
          <div>
            <span className="sw-eyebrow">Plan · write · capture · review</span>
            <h1>The next devlog.</h1>
          </div>
          <span role="status">
            {busy
              ? 'Saving…'
              : dirty
                ? 'Unsaved changes'
                : notice || 'Local episode library'}
          </span>
        </div>
        {error ? (
          <div className="sw-error" role="alert">
            {error}
          </div>
        ) : null}
        {!ready ? (
          <p>
            Loading episode library… Run npm run playground for local production
            storage.
          </p>
        ) : (
          <div className="pd-layout">
            <aside className="pd-library">
              <h2>
                Episodes <small>{records.length} saved on disk</small>
              </h2>
              <label>
                Find an episode
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Title or ID"
                />
              </label>
              <div className="pd-episodes">
                {records
                  .filter((item) =>
                    `${item.value.id} ${item.value.draft.title}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((item) => (
                    <button
                      key={item.value.id}
                      aria-pressed={selected === item.value.id}
                      onClick={() => {
                        if (leave()) {
                          setSelected(item.value.id);
                          setValue(item.value);
                          setError('');
                          setNotice('');
                        }
                      }}
                    >
                      <strong>{item.value.draft.title || item.value.id}</strong>
                      <small>
                        {item.value.id} · {plannedSeconds(item.value.draft)}s ·{' '}
                        {
                          Object.values(item.value.review).filter(Boolean)
                            .length
                        }
                        /6 reviewed
                      </small>
                    </button>
                  ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!leave()) return;
                  void run(async () => {
                    await save(
                      newProduction(
                        productionId.parse(id),
                        makeDraft('devlog'),
                      ),
                      null,
                    );
                    setId('');
                  });
                }}
              >
                <label>
                  New episode ID
                  <input
                    required
                    pattern={'[a-z][a-z0-9\\-]{0,63}'}
                    maxLength={64}
                    value={id}
                    onChange={(event) => setId(event.target.value)}
                    placeholder="inventory-contract"
                  />
                </label>
                <button disabled={busy}>Create episode</button>
              </form>
              <button
                disabled={busy}
                onClick={() => importInput.current!.click()}
              >
                Import episode / script draft
              </button>
              <input
                ref={importInput}
                type="file"
                accept=".json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file || !leave()) return;
                  void run(async () => {
                    const input: unknown = JSON.parse(await file.text());
                    const production = productionSchema.safeParse(input);
                    const imported = production.success
                      ? production.data
                      : newProduction(
                          productionId.parse(id),
                          draftSchema.parse(input),
                        );
                    await save(imported, null);
                  });
                }}
              />
              <small>
                For a script draft, enter a new episode ID first. Existing IDs
                are never replaced by import. Files live in
                Tools/Mercurius/productions/.
              </small>
            </aside>
            {!value ? (
              <section className="pd-empty">
                <h2>Give the story a home.</h2>
                <p>
                  Create an episode or import a saved script. Keep its writing,
                  capture references, and final review together.
                </p>
                <p>
                  Use Clips & FilmCraft to author and render the visuals. Record
                  their exact clip and revision IDs on the production board.
                </p>
              </section>
            ) : (
              <fieldset className="pd-detail" disabled={busy}>
                <div className="sw-section-heading">
                  <h2>{value.draft.title || value.id}</h2>
                  <span>{value.id}</span>
                </div>
                <div className="sw-toolbar">
                  <button
                    disabled={busy || !dirty}
                    onClick={() => {
                      void run(() => save(value, record!.revision));
                    }}
                  >
                    Save production
                  </button>
                  <button
                    disabled={dirty || busy}
                    onClick={() => {
                      window.location.hash = `episode/${value.id}`;
                    }}
                  >
                    Write script
                  </button>
                  <button
                    onClick={() =>
                      download(
                        `${value.id}.production.json`,
                        JSON.stringify(value, null, 2),
                        'application/json',
                      )
                    }
                  >
                    Download episode
                  </button>
                  <button
                    onClick={() =>
                      download(
                        `${value.id}-handoff.md`,
                        handoffMarkdown(value),
                        'text/markdown',
                      )
                    }
                  >
                    Production handoff .md
                  </button>
                  <button
                    onClick={() =>
                      download(
                        `${value.id}-narration.txt`,
                        narrationText(value.draft),
                        'text/plain',
                      )
                    }
                  >
                    Narration .txt
                  </button>
                </div>
                <p className="pd-summary">
                  {value.draft.question ||
                    'Open the writer to define the story.'}{' '}
                  <small>
                    {plannedSeconds(value.draft)}s planned ·{' '}
                    {value.draft.beats.length} beats. Save production changes
                    before opening the writer.
                  </small>
                </p>
                <h2>Capture & edit board</h2>
                {value.draft.beats.map((beat, index) => {
                  const start = elapsed;
                  elapsed += beat.seconds;
                  const shot = value.shots[beat.id] ?? emptyShot();
                  const rendered = revisions.find(
                    (revision) =>
                      shot.media === `${revision.clipId} / ${revision.id}`,
                  );
                  const edit = (patch: Partial<Shot>) =>
                    setValue({
                      ...value,
                      shots: {
                        ...value.shots,
                        [beat.id]: { ...shot, ...patch },
                      },
                      review: {
                        ...value.review,
                        picture: false,
                        delivery: false,
                      },
                    });
                  return (
                    <article className="sw-beat" key={beat.id}>
                      <header>
                        <span className="sw-beat-number">{index + 1}</span>
                        <h3>{beat.title}</h3>
                        <span className="sw-time">
                          {timecode(start)}–{timecode(elapsed)}
                        </span>
                      </header>
                      <p className="pd-narration">
                        {beat.narration || 'No narration yet.'}
                      </p>
                      <p>{beat.visual || 'No visual directions yet.'}</p>
                      <small>
                        Evidence: {beat.evidence || 'Still to verify'}
                      </small>
                      <div className="pd-shot">
                        <label>
                          Production status
                          <select
                            value={shot.status}
                            onChange={(event) =>
                              edit({
                                status: event.target.value as Shot['status'],
                              })
                            }
                          >
                            <option value="needed">Needed</option>
                            <option value="captured">
                              Captured / rendered
                            </option>
                            <option value="edited">Edited into sequence</option>
                          </select>
                        </label>
                        <label>
                          Media path / clip + revision
                          <input
                            value={shot.media}
                            onChange={(event) =>
                              edit({ media: event.target.value })
                            }
                            placeholder="public/episodes/… or curtain-intro / r…"
                          />
                        </label>
                      </div>
                      <label>
                        Use a rendered Mercurius clip
                        <select
                          value={rendered ? shot.media : ''}
                          onChange={(event) => {
                            if (event.target.value)
                              edit({
                                media: event.target.value,
                                status: 'captured',
                              });
                          }}
                        >
                          <option value="">
                            Choose a revision or enter a media path above
                          </option>
                          {revisions.map((revision) => (
                            <option
                              key={`${revision.clipId}/${revision.id}`}
                              value={`${revision.clipId} / ${revision.id}`}
                            >
                              {revision.clipId} / {revision.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      {rendered ? (
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`/api/clips/media/${rendered.clipId}/${rendered.id}.mp4`}
                        >
                          Review rendered clip ↗
                        </a>
                      ) : null}
                      <label>
                        Capture / edit notes
                        <textarea
                          rows={2}
                          value={shot.notes}
                          onChange={(event) =>
                            edit({ notes: event.target.value })
                          }
                          placeholder="What to record, source in/out, retakes, sound cues…"
                        />
                      </label>
                    </article>
                  );
                })}
                <section className="pd-review">
                  <h2>Before delivery</h2>
                  <details>
                    <summary>
                      {issues.length
                        ? `${issues.length} production notes to resolve`
                        : 'Writing and media references filled in'}
                    </summary>
                    <ul>
                      {issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </details>
                  <p>
                    These checks track your review. They do not verify claims or
                    approve publication.
                  </p>
                  {Object.entries(reviews).map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={value.review[key as keyof typeof reviews]}
                        onChange={(event) =>
                          setValue({
                            ...value,
                            review: {
                              ...value.review,
                              [key]: event.target.checked,
                            },
                          })
                        }
                      />{' '}
                      {label}
                    </label>
                  ))}
                </section>
                <label>
                  Publishing description & credits
                  <textarea
                    rows={5}
                    value={value.description}
                    onChange={(event) =>
                      setValue({ ...value, description: event.target.value })
                    }
                  />
                </label>
                <label>
                  Published video URL
                  <input
                    type="url"
                    value={value.publishedUrl}
                    onChange={(event) =>
                      setValue({ ...value, publishedUrl: event.target.value })
                    }
                    placeholder="https://…"
                  />
                </label>
              </fieldset>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
