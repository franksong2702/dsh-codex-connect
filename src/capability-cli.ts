/** Opt-in standalone capability diagnostics; ordinary doctor output stays unchanged. */

import { CodexCapabilityDiagnostics } from './capability-diagnostics.ts'
import type { CapabilityRequest } from './capability-diagnostics.ts'
import { normalizeOpenAICodexProxyUrl } from './settings-contract.ts'

/**
 * Run the separate capability command without booting Harness or changing settings.
 * @param args - flags after capabilities; unknown or unsafe flags are not echoed.
 * @returns 0 for supported primary checks, 1 for rejection, or 2 for unknown/invalid input.
 */
export async function runCapabilityCommand(args: readonly string[]): Promise<number> {
  const request: CapabilityRequest = { model: undefined, probe: false, proxyUrl: undefined, timeoutMs: 30_000 }
  let json = false
  const seen = new Set<string>()
  const invalid = (): number => {
    process.stderr.write('Usage: dsh-codex-connect capabilities [--model <catalog-id>] [--probe] [--proxy <http(s)-origin>] [--timeout-ms <1..60000>] [--json]\n')
    return 2
  }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!
    if (seen.has(flag)) return invalid()
    seen.add(flag)
    if (flag === '--json') json = true
    else if (flag === '--probe') request.probe = true
    else if (flag === '--model' || flag === '--proxy' || flag === '--timeout-ms') {
      const value = args[++index]
      if (value === undefined || value.startsWith('--')) return invalid()
      if (flag === '--model') request.model = value
      if (flag === '--proxy') {
        request.proxyUrl = normalizeOpenAICodexProxyUrl(value)
        if (request.proxyUrl === undefined) return invalid()
      }
      if (flag === '--timeout-ms') {
        if (!/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > 60_000) return invalid()
        request.timeoutMs = Number(value)
      }
    } else return invalid()
  }
  if (request.probe && request.model === undefined) return invalid()
  try {
    const report = await new CodexCapabilityDiagnostics(60_000).inspect(request)
    process.stdout.write(json ? `${JSON.stringify(report)}\n` : [
      `Codex Connect ${report.version}: standalone route diagnostics`,
      'Scope: local host versions and the selected standalone route; not the active Harness profile.',
      `Model: ${report.model ?? 'not selected from catalog'}; network: ${report.network}; probe: ${report.probe.state}`,
      ...Object.entries(report.checks).map(([id, check]) => `${id}: ${check.status} (${check.reason})\n  ${check.action}`),
      '',
    ].join('\n'))
    const primary = [report.checks.runtime, report.checks.oauth, report.checks.responses, report.checks.transport, report.checks.model]
    return primary.some(check => check.status === 'rejected') ? 1 : primary.some(check => check.status === 'unknown') ? 2 : 0
  } catch {
    // Metadata/credential errors can contain private paths; never print the raw exception.
    process.stderr.write('Codex Connect diagnostics could not inspect this installation. Check local package and credential-file access.\n')
    return 2
  }
}
