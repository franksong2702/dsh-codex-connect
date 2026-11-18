import { vi } from 'vitest'
import manifest from '../package.json' with { type: 'json' }

// Source integration fixtures still exercise the compilation SDK. Installed
// Host matrices and admission unit tests use the packaged policy unmodified.
vi.mock(import('../src/dsh-admission.mjs'), async importOriginal => {
  const admission = await importOriginal()
  return {
    ...admission,
    dshAdmission: admission.createDshAdmission(
      [manifest.devDependencies['@deepseek-ai/dsh-agent'], ...admission.dshAdmission.verifiedVersions],
      admission.dshPluginApi.admission,
    ),
  }
})
