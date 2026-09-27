import { Controller, Get } from '@nestjs/common';
import { LibrariesService } from './libraries.service';

@Controller('libraries')
export class LibrariesController {
  constructor(private readonly librariesService: LibrariesService) {}

  @Get('vulnerabilities')
  async listVulnerabilities() {
    return this.librariesService.listVulnerabilities();
  }
}
