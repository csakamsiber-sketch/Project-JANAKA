export type DependencyEcosystem = 'npm' | 'deno' | 'pip' | 'poetry' | 'uv' | 'ruby' | 'php' | 'cargo' | 'go' | 'swift' | 'cocoapods' | 'dart' | 'nuget' | 'maven' | 'gradle' | 'elixir' | 'julia' | 'haskell' | 'conan';
export type DetectedLibrary = {
    name: string;
    version: string;
    ecosystem: DependencyEcosystem;
    source: string;
    layer?: 'frontend' | 'backend';
};
type DependencyFile = {
    name: string;
    content: string;
    layer?: 'frontend' | 'backend';
};
export declare class DependencyDetectorService {
    detect(files: DependencyFile[]): DetectedLibrary[];
    private detectFile;
    private item;
    private detectJson;
    private detectYaml;
    private detectToml;
    private detectPlain;
}
export {};
