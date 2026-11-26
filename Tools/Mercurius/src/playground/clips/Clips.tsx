import { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { ClipScene } from '../../clips/ClipScene';
import {
  clipSchema,
  newClip,
  type ClipSpec,
  type SceneKind,
} from '../../clips/schema';
import type {
  Connection,
  Handoff,
  RenderJob,
  Revision,
} from '../../../scripts/clip-service';
import './clips.css';

type State = {
  clips: ClipSpec[];
  revisions: Revision[];
  job: RenderJob | null;
  mediaRoot: string;
};
export const api = async <T,>(path: string, data?: unknown): Promise<T> => {
  const response = await fetch(
    `/api/clips/${path}`,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Mercurius': 'workbench',
          },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
};

export const Clips = () => {
  const [state, setState] = useState<State>({
    clips: [],
    revisions: [],
    job: null,
    mediaRoot: '',
  });
  const [draft, setDraft] = useState<ClipSpec | null>(null);
  const [saved, setSaved] = useState('');
  const [emphasisText, setEmphasisText] = useState('');
  const [newScene, setNewScene] = useState<SceneKind>('curtain');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [projectPath, setProjectPath] = useState('');
  const [sequenceName, setSequenceName] = useState('Roemer short');
  const [revisionId, setRevisionId] = useState('');
  const [mode, setMode] = useState<Handoff['mode']>('import');
  const [track, setTrack] = useState(0);
  const [frame, setFrame] = useState(0);
  const [target, setTarget] = useState(0);
  const [previewRevision, setPreviewRevision] = useState(false);
  const player = useRef<PlayerRef>(null);
  const refresh = async () => {
    const result = await api<State>('state');
    setState(result);
    return result;
  };
  useEffect(() => {
    void refresh()
      .then((result) => {
        if (result.clips[0]) {
          setDraft(result.clips[0]);
          setEmphasisText(
            result.clips[0].scene === 'code'
              ? result.clips[0].emphasis.join(',')
              : '',
          );
          setSaved(JSON.stringify(result.clips[0]));
        }
      })
      .catch((error: Error) => setError(error.message));
    const timer = setInterval(() => {
      void refresh().catch((error: Error) => setError(error.message));
    }, 2000);
    return () => clearInterval(timer);
  }, []);
  const dirty = draft !== null && JSON.stringify(draft) !== saved;
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
  const select = (clip: ClipSpec) => {
    if (dirty && !window.confirm('Discard unsaved changes to this clip?'))
      return;
    setDraft(clip);
    setEmphasisText(clip.scene === 'code' ? clip.emphasis.join(',') : '');
    setSaved(JSON.stringify(clip));
    setRevisionId('');
    setPreviewRevision(false);
    setError('');
    setNotice('');
  };
  const update = (patch: Record<string, unknown>) => {
    setDraft((clip) => (clip ? ({ ...clip, ...patch } as ClipSpec) : null));
    setPreviewRevision(false);
  };
  const parsed = draft ? clipSchema.safeParse(draft) : null;
  const valid = parsed?.success === true;
  const revisions = state.revisions.filter(
    (revision) => revision.clipId === draft?.id,
  );
  const revision =
    revisions.find((revision) => revision.id === revisionId) ?? revisions[0];
  const save = async () => {
    const result = await api<ClipSpec>('save', draft);
    setDraft(result);
    setSaved(JSON.stringify(result));
    await refresh();
  };
  const inspect = async () => {
    const result = await api<Connection>('filmcraft');
    setConnection(result);
    setTarget(0);
    setTrack(0);
    return result;
  };
  const sequence = connection?.connected ? connection.sequence : null;
  const timelineClips = sequence?.video.flatMap((track) => track.items) ?? [];
  const selectedClip = timelineClips.find((clip) => clip.clip === target);
  const affectedUses = connection?.connected
    ? connection.sequences.flatMap((sequence) =>
        [...sequence.video, ...sequence.audio].flatMap((track) =>
          track.items
            .filter((clip) => clip.item === selectedClip?.item)
            .map((clip) => ({
              sequence: sequence.name,
              track: track.name,
              clip,
            })),
        ),
      )
    : [];
  const activeRender = state.job?.status === 'rendering';
  const number = (key: string, label: string, value: number, minimum = 0) => (
    <label key={key}>
      {label}
      <input
        type="number"
        min={minimum}
        step="1"
        value={Number.isNaN(value) ? '' : value}
        onChange={(event) => update({ [key]: event.target.valueAsNumber })}
      />
    </label>
  );
  const text = (
    key: string,
    label: string,
    value: string,
    multiline = false,
  ) => (
    <label key={key}>
      {label}
      {multiline ? (
        <textarea
          rows={key === 'code' ? 9 : 2}
          value={value}
          onChange={(event) => update({ [key]: event.target.value })}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => update({ [key]: event.target.value })}
        />
      )}
    </label>
  );
  return (
    <div className="cw-shell">
      <header className="cw-header">
        <a className="cw-brand" href="#clips">
          MERCURIUS <span>/ Clips</span>
        </a>
        <nav>
          <a
            href="#production"
            onClick={(event) => {
              if (dirty && !window.confirm('Discard unsaved clip changes?'))
                event.preventDefault();
            }}
          >
            Productions
          </a>
          <a
            href="#writer"
            onClick={(event) => {
              if (dirty && !window.confirm('Discard unsaved clip changes?'))
                event.preventDefault();
            }}
          >
            Writer
          </a>
          <a
            href="#study=intro&direction=parchment&ornament=meander"
            onClick={(event) => {
              if (dirty && !window.confirm('Discard unsaved clip changes?'))
                event.preventDefault();
            }}
          >
            Studies
          </a>
        </nav>
      </header>
      <div className="cw-workspace">
        <aside className="cw-library">
          <h1>Clips</h1>
          {state.clips.map((clip) => (
            <button
              className={clip.id === draft?.id ? 'is-selected' : ''}
              key={clip.id}
              onClick={() => select(clip)}
            >
              {clip.name}
              <small>
                {clip.scene} · {(clip.durationFrames / 30).toFixed(1)}s
              </small>
            </button>
          ))}
          <div className="cw-new">
            <label>
              New clip
              <select
                value={newScene}
                onChange={(event) =>
                  setNewScene(event.target.value as SceneKind)
                }
              >
                <option value="curtain">Curtain intro</option>
                <option value="code">Code walkthrough</option>
                <option value="dependency">Dependency diagram</option>
              </select>
            </label>
            <button
              onClick={() => {
                if (dirty && !window.confirm('Discard unsaved changes?'))
                  return;
                setDraft(
                  newClip(
                    newScene,
                    `${newScene}-${crypto.randomUUID().slice(0, 8)}`,
                  ),
                );
                setSaved('');
                setEmphasisText('');
                setRevisionId('');
                setPreviewRevision(false);
              }}
            >
              Create clip
            </button>
          </div>
        </aside>
        <main className="cw-centre">
          <div className="cw-heading">
            <div>
              <h2>{draft?.name ?? 'Choose a clip'}</h2>
              <small>
                {dirty ? 'Unsaved changes' : 'Saved clip'} · 1080 × 1920 / 30
                FPS
              </small>
            </div>
            <div>
              <button
                disabled={!valid || busy}
                onClick={() =>
                  void run(async () => {
                    await save();
                    setNotice('Clip saved.');
                  })
                }
              >
                Save
              </button>
              <button
                className="cw-primary"
                disabled={!valid || busy || activeRender}
                onClick={() =>
                  void run(async () => {
                    await save();
                    await api('render', { id: draft!.id });
                    await refresh();
                    setNotice(
                      'Rendering saved inputs. FilmCraft is unchanged.',
                    );
                  })
                }
              >
                Save & render
              </button>
            </div>
          </div>
          {error ? (
            <div className="cw-error" role="alert">
              {error}
            </div>
          ) : null}
          {notice ? (
            <p className="cw-notice" role="status">
              {notice}
            </p>
          ) : null}
          <div className="cw-preview-tabs">
            <button
              aria-pressed={!previewRevision}
              onClick={() => setPreviewRevision(false)}
            >
              Live preview
            </button>
            <button
              disabled={!revision}
              aria-pressed={previewRevision}
              onClick={() => setPreviewRevision(true)}
            >
              Rendered revision
            </button>
          </div>
          <div className="cw-preview">
            {previewRevision && revision ? (
              // Native playback reviews an already encoded file outside a Remotion composition.
              // eslint-disable-next-line @remotion/warn-native-media-tag
              <video
                key={revision.id}
                controls
                src={`/api/clips/media/${revision.clipId}/${revision.id}.mp4`}
              />
            ) : valid ? (
              <Player
                ref={player}
                component={ClipScene}
                inputProps={{ clip: parsed.data }}
                durationInFrames={parsed.data.durationFrames}
                compositionWidth={1080}
                compositionHeight={1920}
                fps={30}
                controls
                loop
                style={{ width: '100%', aspectRatio: '9/16' }}
              />
            ) : (
              <div className="cw-invalid">
                {parsed && !parsed.success
                  ? parsed.error.issues.map((issue) => issue.message).join('\n')
                  : 'Create or select a clip to preview it.'}
              </div>
            )}
          </div>
          {!previewRevision && valid ? (
            <div className="cw-seek">
              {[
                0,
                Math.floor(draft!.durationFrames / 2),
                draft!.durationFrames - 1,
              ].map((at) => (
                <button
                  key={at}
                  onClick={() => {
                    player.current!.pause();
                    player.current!.seekTo(at);
                  }}
                >
                  {at}f
                </button>
              ))}
            </div>
          ) : null}
          {state.job && state.job.clipId === draft?.id ? (
            <div className="cw-job" role="status">
              <span>
                {state.job.status === 'rendering'
                  ? `Rendering · ${Math.round(state.job.progress * 100)}%`
                  : `Render ${state.job.status}`}
              </span>
              {activeRender ? (
                <button
                  onClick={() =>
                    void run(async () => {
                      await api('cancel', { id: state.job!.id });
                      await refresh();
                    })
                  }
                >
                  Cancel render
                </button>
              ) : null}
              {state.job.error ? <pre>{state.job.error}</pre> : null}
            </div>
          ) : null}
          <section className="cw-delivery">
            <h2>FilmCraft</h2>
            <div className="cw-connection">
              <span>
                {connection?.connected
                  ? `${connection.project.name} / ${sequence?.name ?? 'No open sequence'}`
                  : 'Not connected'}
              </span>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await inspect();
                  })
                }
              >
                Refresh connection & targets
              </button>
            </div>
            {connection?.connected ? (
              <small>
                Actions affect this FilmCraft project:{' '}
                {connection.project.path ?? 'Unsaved project'}
              </small>
            ) : null}
            {connection?.connected && !sequence ? (
              <div className="cw-launch">
                <p>
                  FilmCraft is connected, but this project has no open timeline.
                  Create a portrait sequence to place clips.
                </p>
                <label>
                  Sequence name
                  <input
                    value={sequenceName}
                    onChange={(event) => setSequenceName(event.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !sequenceName.trim()}
                  onClick={() =>
                    void run(async () => {
                      const result = await api<Connection>('sequence', {
                        name: sequenceName,
                        stamp: connection.stamp,
                      });
                      setConnection(result);
                      if (!result.connected || !result.sequence)
                        throw new Error(
                          'Sequence creation was submitted, but its timeline could not be inspected. Refresh the connection before retrying.',
                        );
                      setMode('place');
                      setTrack(result.sequence.video[0].id);
                      setFrame(0);
                      setNotice(
                        'Portrait timeline created. Click Place revision to add the selected render at the beginning.',
                      );
                    })
                  }
                >
                  Create portrait sequence · 1080 × 1920 / 30 FPS
                </button>
              </div>
            ) : null}
            {!connection?.connected ? (
              <div className="cw-launch">
                <p>
                  Launch a separate FilmCraft session with control enabled. Your
                  other editor windows stay open.
                </p>
                <label>
                  Project to open (optional absolute .fcproj path)
                  <input
                    placeholder="Leave empty for a new project"
                    value={projectPath}
                    onChange={(event) => setProjectPath(event.target.value)}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api('launch', projectPath ? { projectPath } : {});
                      await inspect();
                      setNotice(
                        'FilmCraft connected. Create or open a portrait sequence there, then refresh targets.',
                      );
                    })
                  }
                >
                  Launch connected FilmCraft
                </button>
                {connection && !connection.connected ? (
                  <small>{connection.error}</small>
                ) : null}
              </div>
            ) : null}
            <label>
              Completed revision
              <select
                disabled={!revision}
                value={revision?.id ?? ''}
                onChange={(event) => setRevisionId(event.target.value)}
              >
                {!revisions.length ? (
                  <option>No completed render yet</option>
                ) : (
                  revisions.map((revision) => (
                    <option key={revision.id} value={revision.id}>
                      {new Date(revision.created).toLocaleString()} ·{' '}
                      {(revision.clip.durationFrames / 30).toFixed(1)}s ·{' '}
                      {revision.id}
                    </option>
                  ))
                )}
              </select>
            </label>
            {revision ? (
              <p>
                <a
                  download
                  href={`/api/clips/media/${revision.clipId}/${revision.id}.mp4`}
                >
                  Download MP4
                </a>
                {draft &&
                JSON.stringify(revision.clip) !== JSON.stringify(draft)
                  ? ' · This render differs from the current inputs.'
                  : ''}
              </p>
            ) : null}
            <label>
              Action
              <select
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value as Handoff['mode']);
                  setTarget(0);
                }}
              >
                <option value="import">Add to bin only</option>
                <option value="place">Place on timeline</option>
                <option value="occurrence">Replace one occurrence</option>
                <option value="all">Update all uses of a media item</option>
              </select>
            </label>
            {mode === 'import' ? (
              <p>
                Adds the file to the bin only. To put it on the timeline, choose
                “Place on timeline”, then a video track and start frame.
              </p>
            ) : mode === 'place' ? (
              <p>
                Choose a video track and start frame. At 30 FPS, frame 0 is the
                beginning and frame 30 is one second. Occupied ranges are not
                overwritten.
              </p>
            ) : null}
            {mode === 'place' ? (
              <div className="cw-row">
                <label>
                  Video track
                  <select
                    value={track}
                    onChange={(event) => setTrack(Number(event.target.value))}
                  >
                    <option value={0}>Choose track</option>
                    {sequence?.video.map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.name}
                        {track.locked ? ' (locked)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start frame
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={Number.isNaN(frame) ? '' : frame}
                    onChange={(event) => setFrame(event.target.valueAsNumber)}
                  />
                </label>
              </div>
            ) : null}
            {mode === 'place' && (!sequence || !track) ? (
              <p role="status">
                {!sequence
                  ? 'Create or open a sequence before placing a clip.'
                  : 'Choose a video track to enable Place revision.'}
              </p>
            ) : null}
            {mode === 'occurrence' || mode === 'all' ? (
              <label>
                {mode === 'all'
                  ? 'Media item used by this timeline clip'
                  : 'Timeline occurrence'}
                <select
                  value={target}
                  onChange={(event) => setTarget(Number(event.target.value))}
                >
                  <option value={0}>Choose clip</option>
                  {timelineClips.map((clip) => (
                    <option value={clip.clip} key={clip.clip}>
                      #{clip.clip} · {clip.name} ·{' '}
                      {(clip.start / 254016000000).toFixed(2)}s
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {mode === 'all' ? (
              <div>
                <p>
                  This updates every use of the selected media item, including
                  other sequences. Each source range is checked before
                  replacement.
                </p>
                {selectedClip ? (
                  <ul>
                    {affectedUses.map((use) => (
                      <li key={`${use.sequence}:${use.clip.clip}`}>
                        {use.sequence} / {use.track} / #{use.clip.clip} at{' '}
                        {(use.clip.start / 254016000000).toFixed(2)}s
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <button
              disabled={
                busy ||
                !revision ||
                !connection?.connected ||
                (mode !== 'import' && !sequence) ||
                (mode === 'place' &&
                  (!track || !Number.isInteger(frame) || frame < 0)) ||
                ((mode === 'all' || mode === 'occurrence') && !selectedClip)
              }
              onClick={() =>
                void run(async () => {
                  await api('handoff', {
                    mode,
                    clipId: revision!.clipId,
                    revisionId: revision!.id,
                    stamp: connection!.connected ? connection!.stamp : '',
                    ...(mode === 'place' ? { track, frame } : {}),
                    ...(mode === 'occurrence' ? { targetClip: target } : {}),
                    ...(mode === 'all'
                      ? { targetItem: selectedClip!.item }
                      : {}),
                  });
                  await inspect();
                  setNotice(
                    mode === 'import'
                      ? `Added “${revision!.clip.name}” to the Mercurius bin.`
                      : mode === 'place'
                        ? `Placed “${revision!.clip.name}” at frame ${frame}.`
                        : mode === 'all'
                          ? `Updated all uses of “${selectedClip!.name}”.`
                          : `Updated the selected occurrence of “${selectedClip!.name}”.`,
                  );
                })
              }
            >
              {mode === 'import'
                ? 'Add revision to Mercurius bin'
                : mode === 'place'
                  ? 'Place revision'
                  : mode === 'all'
                    ? 'Update all uses'
                    : 'Replace this occurrence'}
            </button>
          </section>
        </main>
        <aside className="cw-inspector">
          <h2>Clip inputs</h2>
          {draft ? (
            <>
              {text('name', 'Name', draft.name)}
              <label>
                Scene
                <input disabled value={draft.scene} />
              </label>
              <div className="cw-row">
                <label>
                  Palette
                  <select
                    value={draft.direction}
                    onChange={(event) =>
                      update({ direction: event.target.value })
                    }
                  >
                    <option value="parchment">Paper & Ink</option>
                    <option value="terracotta">Terracotta</option>
                  </select>
                </label>
                <label>
                  Border
                  <select
                    value={draft.ornament}
                    onChange={(event) =>
                      update({ ornament: event.target.value })
                    }
                  >
                    {['meander', 'laurel', 'wave', 'none'].map((id) => (
                      <option key={id}>{id}</option>
                    ))}
                  </select>
                </label>
              </div>
              {number(
                'durationFrames',
                'Duration · frames (30 = 1s)',
                draft.durationFrames,
                5,
              )}
              {draft.scene === 'curtain' ? (
                <>
                  {text('wordmark', 'Wordmark', draft.wordmark)}
                  {text('accent', 'Trim colour · hex', draft.accent)}
                  {number(
                    'holdFrames',
                    'Closed hold · frames',
                    draft.holdFrames,
                  )}
                  {number(
                    'openingFrames',
                    'Opening · frames',
                    draft.openingFrames,
                    5,
                  )}
                </>
              ) : (
                <>
                  {text('heading', 'Heading (optional)', draft.heading, true)}
                  {number('revealAt', 'Reveal at · frame', draft.revealAt)}
                  {number('focusAt', 'Focus at · frame', draft.focusAt)}
                  {draft.scene === 'code' ? (
                    <>
                      {text('filename', 'Filename', draft.filename)}
                      <label>
                        Language
                        <select
                          value={draft.language}
                          onChange={(event) =>
                            update({ language: event.target.value })
                          }
                        >
                          {[
                            'csharp',
                            'typescript',
                            'json',
                            'lua',
                            'shellscript',
                          ].map((id) => (
                            <option key={id}>{id}</option>
                          ))}
                        </select>
                      </label>
                      {text('code', 'Code', draft.code, true)}
                      <label>
                        Highlight lines · comma separated
                        <input
                          value={emphasisText}
                          onChange={(event) => {
                            setEmphasisText(event.target.value);
                            update({
                              emphasis: event.target.value.trim()
                                ? event.target.value.split(',').map(Number)
                                : [],
                            });
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      {text('from', 'First node', draft.from)}
                      {text('to', 'Second node', draft.to)}
                      {text('connection', 'Connection label', draft.connection)}
                    </>
                  )}
                </>
              )}
              <details>
                <summary>Files & agent commands</summary>
                <p>Recipe: clips/{draft.id}.json</p>
                <p>
                  Completed renders: {state.mediaRoot}/{draft.id}
                </p>
                <code>npm run clips -- render {draft.id}</code>
                <p>
                  Start the playground server first. Agent and manual actions
                  use this same service.
                </p>
              </details>
            </>
          ) : (
            <p>Choose a clip from the library.</p>
          )}
        </aside>
      </div>
    </div>
  );
};
