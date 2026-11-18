// Publication contract: four stable entries and exactly one chunk per known family.
// Keep this explicit when tsdown.config.ts or its dependency graph changes: a new
// legitimate chunk requires a reviewed contract/fixture update, not a broad glob.
const stableEntries = [
  'lib/bin.js',
  'lib/client.js',
  'lib/index.js',
  'lib/index.d.ts',
]
const chunkFamilies = [
  { name: 'models', pattern: /^lib\/models-[A-Za-z0-9_-]+\.js$/u },
  { name: 'openai-codex-responses', pattern: /^lib\/openai-codex-responses-[A-Za-z0-9_-]+\.js$/u },
  { name: 'undici-runtime', pattern: /^lib\/undici-runtime-[A-Za-z0-9_-]+\.js$/u },
]

// Pure validation of npm pack's manifest paths; never import or execute artifacts.
// Hashes may change between builds. This checks inventory, not content freshness.
export function validateLibArtifactInventory(names) {
  const libFiles = names.filter(name => name === 'lib' || name.startsWith('lib/'))
  const problems = []
  for (const entry of stableEntries) {
    const count = libFiles.filter(name => name === entry).length
    if (count !== 1) problems.push(`expected exactly 1 ${entry}, found ${count}`)
  }
  for (const { name, pattern } of chunkFamilies) {
    const matches = libFiles.filter(path => pattern.test(path))
    if (matches.length !== 1) {
      problems.push(`expected exactly 1 lib/${name}-<hash>.js, found ${matches.length}${matches.length ? ` (${matches.join(', ')})` : ''}`)
    }
  }
  const unexpected = libFiles.filter(name => !stableEntries.includes(name)
    && !chunkFamilies.some(({ pattern }) => pattern.test(name)))
  if (unexpected.length > 0) problems.push(`unexpected lib artifacts: ${unexpected.join(', ')}`)
  if (problems.length > 0) {
    throw new Error(`packed lib artifact inventory mismatch:\n- ${problems.join('\n- ')}`)
  }
}
