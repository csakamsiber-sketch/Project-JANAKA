import { LibrariesService } from './libraries.service';
export declare class LibrariesController {
    private readonly librariesService;
    constructor(librariesService: LibrariesService);
    listVulnerabilities(): Promise<any[]>;
}
