import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'jamus-kalimasada-api',
      timestamp: new Date().toISOString(),
    };
  }
}
