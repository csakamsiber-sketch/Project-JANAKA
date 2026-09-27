import { CtiService } from './cti.service';
export declare class CtiController {
    private readonly ctiService;
    constructor(ctiService: CtiService);
    listAlerts(): {
        id: string;
        title: string;
        source: string;
        severity: string;
        summary: string;
        affectedComponent: string;
        publishedAt: string;
    }[];
}
