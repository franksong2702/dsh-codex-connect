import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Reproduce the pinned OAuth copy and its local patches without modifying host dependencies.
const root = fileURLToPath(new URL('../', import.meta.url))
const source = resolve(dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-ai'))), '..')
const metadata = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
if (metadata.version !== '0.84.4') throw new Error('Review the upstream OAuth diff before changing the vendor pin')
const files = ['auth/oauth/openai-codex.js', 'auth/oauth/device-code.js', 'auth/oauth/oauth-page.js', 'auth/oauth/pkce.js', 'utils/provider-env.js']
for (const file of files) {
  let body = await readFile(resolve(source, 'dist', file), 'utf8')
  body = body.replace(/^\/\/# sourceMappingURL=.*\n?/gm, '')
  if (file === files[0]) {
    const jwtDecode = '        const decoded = atob(payload);'
    if (body.split(jwtDecode).length !== 2) throw new Error('Unexpected upstream JWT decoder')
    body = body.replace(jwtDecode, `        if (!/^[A-Za-z0-9_-]+={0,2}$/.test(payload)) return null;
        const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);`)
    const original = 'close: () => server.close(),'
    if (body.split(original).length !== 2) throw new Error('Unexpected upstream server close implementation')
    body = body.replace(original, `close: () => new Promise((resolve) => {
                    server.close(() => resolve());
                    server.closeAllConnections();
                }),`)
    body = body.replace('        server.close();\n    }\n}', '        await server.close();\n    }\n}')
    const tokenReader = 'async function readTokenResponse(response, operation) {'
    if (body.split(tokenReader).length !== 2) throw new Error('Unexpected upstream token response reader')
    body = body.replace(tokenReader, `/** A structured refresh rejection, without response text or credential data. */
export class OpenAICodexRefreshRejectedError extends Error {
    constructor() {
        super("OpenAI Codex refresh authorization was rejected");
        this.name = "OpenAICodexRefreshRejectedError";
    }
}
${tokenReader}`)
    const errorBody = '        const text = await response.text().catch(() => "");'
    if (body.split(errorBody).length !== 2) throw new Error('Unexpected upstream token error body reader')
    body = body.replace(errorBody, `${errorBody}
        if (operation === "refresh" && (response.status === 400 || response.status === 401)) {
            let failure;
            try {
                failure = JSON.parse(text);
            } catch {
                // Non-JSON failures do not establish that this grant has been revoked.
            }
            if (failure !== null && typeof failure === "object" && failure.error === "invalid_grant") {
                throw new OpenAICodexRefreshRejectedError();
            }
        }`)
  }
  const target = resolve(root, 'vendor/pi-ai-oauth', file)
  if (!process.argv.includes('--write')) {
    if (await readFile(target, 'utf8') !== body) throw new Error(`Vendor drift: ${file}`)
  } else {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, body)
  }
}
console.log('Pinned OAuth source, JWT decoding, callback cleanup and refresh rejection patches verified')
