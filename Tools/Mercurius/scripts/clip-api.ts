import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { z } from 'zod';
import { ClipService } from './clip-service';

const body = async (request: IncomingMessage) => {
  let content = '';
  for await (const chunk of request) {
    content += chunk;
    if (content.length > 1024 * 1024)
      throw new Error('Request is larger than 1 MB.');
  }
  return JSON.parse(content);
};
const send = (response: ServerResponse, value: unknown, status = 200) => {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
};

export const clipApi = (): Plugin => {
  const service = new ClipService();
  return {
    name: 'mercurius-clips',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url!, 'http://127.0.0.1:3109');
        if (!url.pathname.startsWith('/api/clips/')) return next();
        try {
          if (
            request.headers.origin &&
            request.headers.origin !== `http://${request.headers.host}`
          )
            throw new Error('Cross-origin access is not allowed.');
          if (request.method === 'GET') {
            const media =
              /^\/api\/clips\/media\/([a-z][a-z0-9-]{0,63})\/(r\d+-[a-f0-9]{6})\.mp4$/.exec(
                url.pathname,
              );
            if (media) {
              const path = service.mediaFile(media[1], media[2]);
              await service.revision(media[1], media[2]);
              const info = await stat(path);
              const range = /^bytes=(\d+)-(\d*)$/.exec(
                request.headers.range ?? '',
              );
              const start = range ? Number(range[1]) : 0;
              const end = range?.[2] ? Number(range[2]) : info.size - 1;
              if (start > end || end >= info.size) {
                response.writeHead(416, {
                  'Content-Range': `bytes */${info.size}`,
                });
                response.end();
                return;
              }
              response.writeHead(range ? 206 : 200, {
                'Content-Type': 'video/mp4',
                'Accept-Ranges': 'bytes',
                'Content-Length': end - start + 1,
                ...(range
                  ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` }
                  : {}),
              });
              createReadStream(path, { start, end }).pipe(response);
              return;
            }
            if (url.pathname === '/api/clips/state')
              return send(response, {
                clips: await service.clips(),
                revisions: await service.revisions(),
                job: service.job,
                mediaRoot: service.media,
              });
            if (url.pathname === '/api/clips/filmcraft')
              return send(response, await service.connection());
          }
          if (
            request.method !== 'POST' ||
            request.headers['x-mercurius'] !== 'workbench'
          )
            throw new Error(
              'Use the Mercurius workbench or CLI for this operation.',
            );
          const value = await body(request);
          switch (url.pathname) {
            case '/api/clips/save':
              return send(response, await service.save(value));
            case '/api/clips/render':
              return send(
                response,
                await service.render(
                  z.object({ id: z.string() }).strict().parse(value).id,
                ),
              );
            case '/api/clips/cancel':
              return send(
                response,
                service.cancel(
                  z.object({ id: z.string() }).strict().parse(value).id,
                ),
              );
            case '/api/clips/launch':
              return send(
                response,
                await service.startFilmcraft(
                  z
                    .object({ projectPath: z.string().optional() })
                    .strict()
                    .parse(value).projectPath,
                ),
              );
            case '/api/clips/handoff':
              return send(response, await service.handoff(value));
            case '/api/clips/sequence':
              return send(response, await service.createSequence(value));
            default:
              return send(response, { error: 'Unknown clip operation.' }, 404);
          }
        } catch (error) {
          send(response, { error: (error as Error).message }, 400);
        }
      });
    },
  };
};
