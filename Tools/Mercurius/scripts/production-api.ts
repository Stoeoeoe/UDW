import type { Plugin } from 'vite';
import { ProductionService } from './production-service';

export const productionApi = (): Plugin => {
  const service = new ProductionService();
  return {
    name: 'mercurius-productions',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/api/productions') return next();
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        try {
          if (
            request.headers.origin &&
            request.headers.origin !== `http://${request.headers.host}`
          )
            throw new Error('Cross-origin access is not allowed.');
          if (request.method === 'GET') {
            response.end(JSON.stringify(await service.list()));
            return;
          }
          if (
            request.method !== 'POST' ||
            request.headers['x-mercurius'] !== 'workbench'
          )
            throw new Error('Use the Mercurius workbench for this operation.');
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of request) {
            size += Buffer.byteLength(chunk);
            if (size > 1024 * 1024)
              throw new Error('Request is larger than 1 MB.');
            chunks.push(Buffer.from(chunk));
          }
          response.end(
            JSON.stringify(
              await service.save(
                JSON.parse(Buffer.concat(chunks).toString('utf8')),
              ),
            ),
          );
        } catch (error) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
    },
  };
};
