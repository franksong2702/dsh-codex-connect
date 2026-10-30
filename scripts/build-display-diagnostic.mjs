import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../packages/dsh-codex-display-diagnostic/', import.meta.url);
const observer = (await readFile(new URL('observer.mjs', root), 'utf8')).replace('export function ', 'function ');
const client = (await readFile(new URL('client.mjs', root), 'utf8')).replace("import { observeDiagnostic } from './observer.mjs';", '').replace('export const ', 'const ').replace('export function ', 'function ');
const bundle = 'window.__ModuleLoader__.load({id:"dsh-codex-display-diagnostic",factory:()=>{\n' + observer + '\n' + client + '\nreturn {inject,apply};}});\n';
if (process.argv.includes('--check')) {
    if (await readFile(new URL('lib/client.js', root), 'utf8') !== bundle) throw new Error('Diagnostic client build is stale');
} else { await mkdir(new URL('lib/', root), { recursive: true }); await writeFile(new URL('lib/client.js', root), bundle); }
