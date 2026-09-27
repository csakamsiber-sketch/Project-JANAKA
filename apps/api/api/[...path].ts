import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from '../src/main';

let applicationPromise: Promise<NestFastifyApplication> | undefined;

function getApplication() {
  applicationPromise ??= createApplication().catch((error: unknown) => {
    applicationPromise = undefined;
    throw error;
  });
  return applicationPromise;
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const application = await getApplication();
  const chunks: Buffer[] = [];
  if (req.readable && !req.readableEnded) {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  }
  const payload = chunks.length
    ? Buffer.concat(chunks)
    : req.body === undefined ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const response = await application.getHttpAdapter().getInstance().inject({
    method: (req.method ?? 'GET') as any,
    url: req.url ?? '/',
    headers: req.headers,
    ...(payload !== undefined ? { payload } : {}),
  });

  res.writeHead(response.statusCode, response.headers);
  res.end(response.payload);
}