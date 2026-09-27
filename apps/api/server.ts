import { createApplication } from './src/main';

async function startServer() {
  const application = await createApplication();
  const port = Number(process.env.PORT ?? 3000);
  await application.listen(port, '0.0.0.0');
}

void startServer();