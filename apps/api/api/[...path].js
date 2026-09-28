let applicationPromise;

function getApplication() {
  applicationPromise ??= import('../dist/vercel/main.mjs')
    .then(({ createApplication }) => createApplication())
    .catch((error) => {
      applicationPromise = undefined;
      throw error;
    });
  return applicationPromise;
}

module.exports = async function handler(request, response) {
  try {
    const application = await getApplication();
    const result = await application.getHttpAdapter().getInstance().inject({
      method: request.method || 'GET',
      url: request.url || '/',
      headers: request.headers,
      ...(request.body !== undefined ? { payload: request.body } : {}),
    });

    response.writeHead(result.statusCode, result.headers);
    response.end(result.payload);
  } catch (error) {
    console.error('API function invocation failed.', error);
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'The API could not handle this request.' } }));
  }
};