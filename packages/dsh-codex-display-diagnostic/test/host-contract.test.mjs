import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyDiagnosticHost } from '../host-contract.mjs';

const peers = ['dsh-agent', 'dsh-user-questions', 'dsh-api-gateway', 'dsh-client-connection'];
const versions = ['0.2.2-alpha.2.codex-cua-local.9', '0.2.2-alpha.2.codex-cua-local.10'];
const reader = values => path => {
    const name = peers.find(name => path === '@deepseek-ai/' + name + '/package.json');
    assert(name, 'only exact diagnostic peers may be read');
    if (!Object.hasOwn(values, name)) throw new Error('missing peer');
    return { version: values[name] };
};
const coherent = version => Object.fromEntries(peers.map(name => [name, version]));

for (const version of versions) test('accepts coherent exact ' + version, () => {
    assert.equal(verifyDiagnosticHost(reader(coherent(version))), version);
});
for (const version of ['0.2.2-alpha.2', '0.2.2-alpha.2.codex-cua-local.8', '0.2.2-alpha.2.codex-cua-local.11', undefined]) {
    test('rejects unknown coherent version ' + version, () => {
        assert.throws(() => verifyDiagnosticHost(reader(coherent(version))), /HOST_UNVERIFIED/);
    });
}
for (const peer of peers) test('rejects mixed, foreign and missing ' + peer, () => {
    for (const version of [versions[0], '0.2.2-alpha.2']) {
        assert.throws(() => verifyDiagnosticHost(reader({ ...coherent(versions[1]), [peer]: version })), /HOST_UNVERIFIED/);
    }
    const missing = coherent(versions[1]); delete missing[peer];
    assert.throws(() => verifyDiagnosticHost(reader(missing)), /missing peer/);
});
test('package includes the production guard and declares exactly the admitted versions', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
    assert(manifest.files.includes('host-contract.mjs'));
    for (const peer of peers) assert.deepEqual(manifest.peerDependencies['@deepseek-ai/' + peer].split(' || '), versions);
});
