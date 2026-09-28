import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApiApplication } from '../../api/dist/app.factory';

type VercelRequest = IncomingMessage & { body?: unknown };
type InjectResponse = { statusCode: number; headers: Record<string, string | string[] | undefined>; rawPayload: Buffer };
type InjectOptions = { method: string; url: string; headers: Record<string, string | string[] | undefined>; payload?: string | Buffer };

let applicationPromise: Promise<NestFastifyApplication> | undefined;

function normalizeApiPath(requestUrl: string): string {
  const url = new URL(requestUrl, 'https://vercel.invalid');
  if (url.pathname === '/api') {
    url.pathname = '/api/v1';
  } else if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/v1/') && !url.pathname.startsWith('/api/docs')) {
    url.pathname = `/api/v1/${url.pathname.slice('/api/'.length)}`;
  }
  return `${url.pathname}${url.search}`;
}

async function getApplication(): Promise<NestFastifyApplication> {
  applicationPromise ??= (async () => {
    const application = await createApiApplication();
    await application.init();
    return application;
  })();

  try {
    return await applicationPromise;
  } catch (error) {
    applicationPromise = undefined;
    throw error;
  }
}

export default async function handler(request: VercelRequest, response: ServerResponse) {
  try {
    const application = await getApplication();
    const body = request.body;
    const payload = body === undefined
      ? undefined
      : Buffer.isBuffer(body) || typeof body === 'string'
        ? body
        : JSON.stringify(body);
    const headers = { ...request.headers } as Record<string, string | string[] | undefined>;
    delete headers['content-length'];
    delete headers['transfer-encoding'];
    const fastify = application.getHttpAdapter().getInstance() as FastifyInstance;
    const inject = fastify.inject.bind(fastify) as unknown as (options: InjectOptions) => Promise<InjectResponse>;
    const result = await inject({
      method: request.method ?? 'GET',
      url: normalizeApiPath(request.url ?? '/api/v1'),
      headers,
      ...(payload !== undefined ? { payload } : {}),
    });

    response.statusCode = result.statusCode;
    for (const [name, value] of Object.entries(result.headers)) {
      if (value !== undefined) response.setHeader(name, value);
    }
    response.end(result.rawPayload);
  } catch (error) {
    console.error('Vercel API function failed to initialize or process a request.', error);
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'The server could not complete the request.' } }));
  }
}