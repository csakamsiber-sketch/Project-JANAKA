import { ConfigService } from '@nestjs/config';
import { createApplication } from './main';

async function bootstrap() {
  const app = await createApplication();
  const port = app.get(ConfigService).get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();