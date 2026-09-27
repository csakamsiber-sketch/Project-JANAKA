import { DocumentBuilder } from '@nestjs/swagger';

export const openApiConfig = new DocumentBuilder()
  .setTitle('JAMUS KALIMASADA API')
  .setDescription('Security assurance, verification, and CTI platform API')
  .setVersion('1.0.0')
  .addBearerAuth()
  .build();
