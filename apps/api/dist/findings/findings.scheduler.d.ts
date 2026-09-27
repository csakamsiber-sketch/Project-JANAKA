import { OnApplicationBootstrap } from '@nestjs/common';
import { LibrariesService } from '../libraries/libraries.service';
import { FindingsService } from './findings.service';
export declare class FindingsScheduler implements OnApplicationBootstrap {
    private readonly findingsService;
    private readonly librariesService;
    private readonly logger;
    private timer?;
    constructor(findingsService: FindingsService, librariesService: LibrariesService);
    onApplicationBootstrap(): Promise<void>;
    private scheduleNextRun;
    private getNextRunTime;
    private runFindingsScan;
}
