import { Controller, Get } from '@nestjs/common';
import { CtiService } from './cti.service';

@Controller('cti')
export class CtiController {
  constructor(private readonly ctiService: CtiService) {}

  @Get('alerts')
  listAlerts() {
    return [
      {
        id: 'ADV-201',
        title: 'Upstream package advisory',
        source: 'NVD',
        severity: 'HIGH',
        summary: 'Critical vulnerability in a common parser library affecting authentication handling.',
        affectedComponent: 'Auth Gateway',
        publishedAt: '2026-09-10',
      },
      {
        id: 'ADV-202',
        title: 'OAuth session hardening patch',
        source: 'GHSA',
        severity: 'MEDIUM',
        summary: 'Weak session invalidation controls were reported in the OAuth integration.',
        affectedComponent: 'Identity Platform',
        publishedAt: '2026-09-08',
      },
    ].filter(Boolean);
  }
}
