import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('registers guarded Think replay but keeps proposals explicitly default-off and host-only', async () => {
  const [entry, client, settings, metadata] = await Promise.all([
    readFile('src/index.ts', 'utf8'), readFile('src/client/index.tsx', 'utf8'),
    readFile('src/settings-contract.ts', 'utf8'), readFile('package.json', 'utf8'),
  ])
  expect(entry).toContain('registerThinkHostIntegration(ctx)')
  expect(entry).toContain('think.adapterReplay')
  expect(entry).toContain('enableReasoningUpdates: z.boolean().default(false)')
  expect(settings).toContain('enableReasoningUpdates: false')
  expect(client).not.toMatch(/registerThinkHostIntegration|reasoning-update-host/u)
  const pkg = JSON.parse(metadata)
  expect(pkg.dependencies['@deepseek-ai/dsh-user-questions']).toBeUndefined()
  expect(pkg.devDependencies['@deepseek-ai/dsh-user-questions']).toBe('0.1.2-rc.1')
  expect(JSON.stringify(pkg.exports)).not.toMatch(/reasoning-update-host/u)
  expect(pkg.devDependencies['@deepseek-ai/dsh-client-ui-user-questions']).toBe('0.1.2-rc.1')
  expect(pkg.devDependencies['@tsdown/css']).toBe('0.23.0')
  expect(pkg.dependencies['@deepseek-ai/dsh-client-ui-user-questions']).toBeUndefined()
  expect(pkg.dependencies['@tsdown/css']).toBeUndefined()
})

it('retains exact-head read-only CodeQL evidence for the stacked Think PR', async () => {
  const yaml = await readFile('.github/workflows/ci.yml', 'utf8')
  const section = yaml.split('  codeql-stacked:')[1]?.split('  validate:')[0]
  expect(section).toBeDefined()
  expect(section).toContain("github.event_name == 'pull_request' && github.base_ref != github.event.repository.default_branch")
  expect(section).toContain('ref: ${{ github.event.pull_request.head.sha }}')
  expect(section).toContain('persist-credentials: false')
  expect(section).toContain('upload: never')
  expect(section).toContain('node scripts/check-codeql-report.mjs codeql-results')
  expect(section).toContain('if-no-files-found: error')
  expect(section).not.toMatch(/security-events: write|continue-on-error: true/u)
})
