/** Build a standalone file without opening a browser, starting a server or loading a driver. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Compose fixed repository sources; no HTML parsing, filtering or caller-supplied markup. */
export async function fixtureDocument() {
  const state = (await readFile(new URL('./fixture-state.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '');
  const behavior = await readFile(new URL('./page-behavior.mjs', import.meta.url), 'utf8');
  const template = await readFile(new URL('./page.template.html', import.meta.url), 'utf8');
  const program = `${state}\n${behavior}`;
  return { program, html: template.replace('/* FIXTURE_PROGRAM */', () => program) };
}

export async function buildFixture(output = new URL('./artifacts/fixture.html', import.meta.url)) {
  const { html } = await fixtureDocument();
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, html);
  return output;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(fileURLToPath(await buildFixture()));
}
