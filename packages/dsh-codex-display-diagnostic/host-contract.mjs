const versions = new Set(['0.2.2-alpha.2.codex-cua-local.9', '0.2.2-alpha.2.codex-cua-local.10']);
const peers = ['dsh-agent', 'dsh-user-questions', 'dsh-api-gateway', 'dsh-client-connection'];

/** Require one coherent, exact local Host; never admit stock or mixed peers. */
export function verifyDiagnosticHost(require) {
    const installed = peers.map(name => require('@deepseek-ai/' + name + '/package.json').version);
    if (!versions.has(installed[0]) || installed.some(version => version !== installed[0])) {
        throw new Error('DISPLAY_DIAGNOSTIC_HOST_UNVERIFIED');
    }
    return installed[0];
}
