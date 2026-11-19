import { parentPort } from 'node:worker_threads';
import { renderOffline, type RenderRequest } from './renderer.js';

// Entry point of a render worker thread: one request in, one reply out.
parentPort!.on('message', async (request: RenderRequest) => {
  try {
    await renderOffline(request);
    parentPort!.postMessage({});
  } catch (error) {
    parentPort!.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
