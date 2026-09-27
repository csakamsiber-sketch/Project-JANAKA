"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyDetectorService = void 0;
const common_1 = require("@nestjs/common");
const fileMap = {
    'package.json': { ecosystem: 'npm', kind: 'json' }, 'package-lock.json': { ecosystem: 'npm', kind: 'lock' }, 'yarn.lock': { ecosystem: 'npm', kind: 'plain' }, 'pnpm-lock.yaml': { ecosystem: 'npm', kind: 'yaml' }, 'bun.lock': { ecosystem: 'npm', kind: 'json' }, 'bun.lockb': { ecosystem: 'npm', kind: 'plain' },
    'deno.json': { ecosystem: 'deno', kind: 'json' }, 'deno.lock': { ecosystem: 'deno', kind: 'json' }, 'pyproject.toml': { ecosystem: 'poetry', kind: 'toml' }, 'poetry.lock': { ecosystem: 'poetry', kind: 'toml' }, 'uv.lock': { ecosystem: 'uv', kind: 'toml' }, 'Pipfile': { ecosystem: 'pip', kind: 'plain' }, 'Pipfile.lock': { ecosystem: 'pip', kind: 'json' },
    'Gemfile': { ecosystem: 'ruby', kind: 'plain' }, 'Gemfile.lock': { ecosystem: 'ruby', kind: 'plain' }, 'composer.json': { ecosystem: 'php', kind: 'json' }, 'composer.lock': { ecosystem: 'php', kind: 'json' }, 'Cargo.toml': { ecosystem: 'cargo', kind: 'toml' }, 'Cargo.lock': { ecosystem: 'cargo', kind: 'toml' }, 'go.mod': { ecosystem: 'go', kind: 'plain' }, 'go.sum': { ecosystem: 'go', kind: 'plain' },
    'Package.swift': { ecosystem: 'swift', kind: 'plain' }, 'Package.resolved': { ecosystem: 'swift', kind: 'json' }, 'Podfile': { ecosystem: 'cocoapods', kind: 'plain' }, 'Podfile.lock': { ecosystem: 'cocoapods', kind: 'yaml' }, 'pubspec.yaml': { ecosystem: 'dart', kind: 'yaml' }, 'pubspec.lock': { ecosystem: 'dart', kind: 'yaml' }, '*.csproj': { ecosystem: 'nuget', kind: 'plain' }, 'packages.lock.json': { ecosystem: 'nuget', kind: 'json' }, 'build.gradle': { ecosystem: 'gradle', kind: 'plain' }, 'build.gradle.kts': { ecosystem: 'gradle', kind: 'plain' }, 'gradle.lockfile': { ecosystem: 'gradle', kind: 'plain' }, 'mix.exs': { ecosystem: 'elixir', kind: 'plain' }, 'mix.lock': { ecosystem: 'elixir', kind: 'plain' }, 'Project.toml': { ecosystem: 'julia', kind: 'toml' }, 'Manifest.toml': { ecosystem: 'julia', kind: 'toml' }, 'cabal.project': { ecosystem: 'haskell', kind: 'plain' }, 'stack.yaml': { ecosystem: 'haskell', kind: 'yaml' }, 'cabal.project.freeze': { ecosystem: 'haskell', kind: 'plain' }, 'stack.yaml.lock': { ecosystem: 'haskell', kind: 'yaml' }, 'conanfile.txt': { ecosystem: 'conan', kind: 'plain' }, 'conanfile.py': { ecosystem: 'conan', kind: 'plain' }, 'conan.lock': { ecosystem: 'conan', kind: 'json' },
};
let DependencyDetectorService = class DependencyDetectorService {
    detect(files) {
        const detected = files.flatMap((file) => this.detectFile(file));
        return Array.from(new Map(detected.map((item) => [`${item.layer ?? 'backend'}:${item.ecosystem}:${item.name}@${item.version}`, item])).values());
    }
    detectFile(file) {
        const fileName = file.name.split(/[\\/]/).pop() ?? file.name;
        const contentBuffer = file.content.startsWith('data:')
            ? Buffer.from(file.content.slice(file.content.indexOf(',') + 1), 'base64')
            : Buffer.from(file.content, 'utf8');
        const content = fileName === 'bun.lockb' ? contentBuffer.toString('latin1') : contentBuffer.toString('utf8');
        const config = fileMap[fileName] ?? (/^package-lock(?:-.+)?\.json$/i.test(fileName) ? fileMap['package-lock.json'] : undefined) ?? (fileName.endsWith('.csproj') ? fileMap['*.csproj'] : undefined);
        if (!config)
            return [];
        const detected = config.kind === 'json' || config.kind === 'lock'
            ? this.detectJson(content, fileName, config.ecosystem)
            : config.kind === 'yaml'
                ? this.detectYaml(content, fileName, config.ecosystem)
                : config.kind === 'toml'
                    ? this.detectToml(content, fileName, config.ecosystem)
                    : this.detectPlain(content, fileName, config.ecosystem);
        return detected.map((item) => ({ ...item, ...(file.layer ? { layer: file.layer } : {}) }));
    }
    item(name, version, ecosystem, source) {
        const cleanName = name.trim().replace(/^['"]|['"]$/g, '');
        const cleanVersion = String(version ?? '').replace(/^[=~^><*\s]+/, '').trim();
        if (!cleanName || !cleanVersion || cleanName.startsWith('#') || cleanName === 'name' || cleanName === 'version')
            return undefined;
        return { name: cleanName, version: cleanVersion, ecosystem, source };
    }
    detectJson(content, source, ecosystem) {
        try {
            const parsed = JSON.parse(content);
            const results = [];
            const addMap = (value) => {
                if (!value || typeof value !== 'object' || Array.isArray(value))
                    return;
                for (const [name, version] of Object.entries(value)) {
                    const item = this.item(name, typeof version === 'string' ? version : version?.version, ecosystem, source);
                    if (item)
                        results.push(item);
                }
            };
            addMap(parsed.dependencies);
            addMap(parsed.devDependencies);
            addMap(parsed.peerDependencies);
            addMap(parsed.require);
            const packages = parsed.packages;
            if (packages)
                for (const [path, value] of Object.entries(packages)) {
                    if (path === '' || !value || typeof value !== 'object')
                        continue;
                    const packageValue = value;
                    const item = this.item(packageValue.name ?? path.split('node_modules/').pop() ?? path, packageValue.version, ecosystem, source);
                    if (item)
                        results.push(item);
                }
            const walk = (value) => {
                if (!value || typeof value !== 'object' || Array.isArray(value))
                    return;
                const record = value;
                if (typeof record.name === 'string' && (typeof record.version === 'string' || typeof record.resolved === 'string')) {
                    const item = this.item(record.name, record.version ?? record.resolved, ecosystem, source);
                    if (item)
                        results.push(item);
                }
                Object.values(record).forEach(walk);
            };
            walk(parsed);
            return results;
        }
        catch {
            return [];
        }
    }
    detectYaml(content, source, ecosystem) {
        const results = [];
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index] ?? '';
            const key = line.match(/^\s{2,}['"]?\/?((?:@[^@/]+\/)?[^@:'"\s]+)@([^:'"\s(]+)['"]?\s*:/) ?? line.match(/^\s{2,}['"]?((?:@[^@/]+\/)?[^@:'"\s]+)['"]?\s*:\s*$/);
            if (!key)
                continue;
            const nestedVersion = lines.slice(index + 1, index + 6).map((nested) => nested.match(/^\s+version:\s*["']?([^"'\s]+)["']?/)?.[1]).find(Boolean);
            const item = this.item(key[1] ?? '', key[2] ?? nestedVersion, ecosystem, source);
            if (item)
                results.push(item);
        }
        return results;
    }
    detectToml(content, source, ecosystem) {
        const results = [];
        const lines = content.split(/\r?\n/);
        let packageName = '';
        for (const line of lines) {
            const name = line.match(/^\s*name\s*=\s*["']([^"']+)["']/)?.[1];
            const version = line.match(/^\s*version\s*=\s*["']([^"']+)["']/)?.[1];
            const inline = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["']([~^<>=!]?\s*\d[^"']*)["']/);
            if (inline) {
                const item = this.item(inline[1] ?? '', inline[2], ecosystem, source);
                if (item)
                    results.push(item);
            }
            const arrayDependencies = [...line.matchAll(/['"]([A-Za-z0-9_.-]+)(?:[<>=~^!]+)([^,'"]+)['"]/g)];
            for (const dependency of arrayDependencies) {
                const item = this.item(dependency[1] ?? '', dependency[2], ecosystem, source);
                if (item)
                    results.push(item);
            }
            if (name)
                packageName = name;
            if (packageName && version) {
                const item = this.item(packageName, version, ecosystem, source);
                if (item)
                    results.push(item);
                packageName = '';
            }
        }
        return results;
    }
    detectPlain(content, source, ecosystem) {
        const results = [];
        for (const line of content.split(/\r?\n/)) {
            const match = line.match(/(?:^|["'(\s])((?:@[^@/]+\/)?[A-Za-z0-9_.-]+)@([0-9][^\s"')]+)/) ?? line.match(/^\s{2,}([A-Za-z0-9_.-]+)\s+\(([^)]+)\)/) ?? line.match(/(?:^|["'(\s])([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):([0-9][^\s:)"']*)/) ?? line.match(/implementation\s*["'(]([^:"']+):([^:"']+):([^:"')]+)["')]/) ?? line.match(/^\s*(\S+)\s+v([0-9][^\s]+)/);
            if (!match)
                continue;
            const item = match.length === 4
                ? this.item(`${match[1] ?? ''}:${match[2] ?? ''}`, match[3], ecosystem, source)
                : this.item(match[1] ?? '', match[2], ecosystem, source);
            if (item)
                results.push(item);
        }
        return results;
    }
};
exports.DependencyDetectorService = DependencyDetectorService;
exports.DependencyDetectorService = DependencyDetectorService = __decorate([
    (0, common_1.Injectable)()
], DependencyDetectorService);
//# sourceMappingURL=dependency-detector.service.js.map