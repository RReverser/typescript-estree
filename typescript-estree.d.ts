/// <reference path='./node_modules/typescript/lib/typescript.d.ts' />
/// <reference path='./node_modules/typescript/lib/typescriptServices.d.ts' />

declare var typescriptEstree: typescriptEstree.typescriptEstree;

declare module typescriptEstree {
    export interface typescriptEstree {
        installBetterLog(options: {}): void;
        checkAndConvert(input: string, options?: ts.CompilerOptions): ESTree.Program;
        acornParse(src: string, options: {}): ESTree.Program;
        tsParse(src: string, options: ts.CompilerOptions): ESTree.Program;
    }
}

declare module "typescript-estree" {
    export = typescriptEstree;
}
