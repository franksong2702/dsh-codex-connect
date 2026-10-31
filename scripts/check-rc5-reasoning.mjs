/** Synthetic SSR of exact published reasoning components; no real browser or model. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

const hashes = ['a00e5176d1257d51604cefbe9a15d326d4283439df31f76ba20ff690c76e10a1', '181f766f2fe12ad27eed4f1c0cd4609e8d2211d397890355eb476b6a9ee311c2']
assert.equal(process.argv.length, 4, 'usage: check-rc5-reasoning <verified-rc4-client.js> <verified-rc5-client.js>')
let cases = 0
for (const [i, path] of process.argv.slice(2).entries()) {
  const source = await readFile(path, 'utf8')
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[i], 'exact upstream bundle required')
  const section = marker => {
    const start = source.indexOf(marker); assert(start >= 0)
    const end = source.indexOf('//#endregion', start); assert(end > start)
    return source.slice(start, end)
  }
  const prefix = i === 1 ? section('function reasoningText(text)') : ''
  const row = section('const THINK_ICON =')
  const primitive = ({ children }) => React.createElement('section', null, children)
  const Row = vm.runInNewContext(prefix + '\n' + row + '\nReasoningRow', {
    react: React, react_jsx_runtime: jsx,
    _deepseek_ai_dsh_client_ui_primitives: { IconThinkOutlineRegular: () => null, TextShimmer: primitive, DisclosureRow: primitive },
    ReasoningRow_module_css_default: {}, accessibility_module_css_default: {},
  })
  for (const [raw, displayed, hidden] of [
    ['ordinary **reasoning**', 'ordinary **reasoning**', false],
    ['推理\nsecond line', '推理\nsecond line', false],
    ['<other>unchanged</other>', '<other>unchanged</other>', false],
    ['<sig', '', true],
    ['<signature>synthetic opaque value', '', true],
    ['<signature>synthetic opaque value</signature>\r\n\nVisible reasoning', 'Visible reasoning', false],
  ]) for (const running of [false, true]) {
    const seen = []
    const html = renderToStaticMarkup(React.createElement(Row, {
      text: raw, running, useDisclosure: () => ({ expanded: true, toggle() {} }),
      usePresentation: selector => selector({ settledReasoningPreview: true }), t: key => key,
      renderSlot: (name, props) => { seen.push({ name, props }); return React.createElement('article', null, props.text) },
    }))
    assert.equal(seen.length, 1)
    assert.equal(seen[0].name, 'conversation.chat.reasoning.body')
    assert.equal(seen[0].props.text, i === 1 ? displayed : raw)
    assert.equal(seen[0].props.running, running)
    assert.equal(seen[0].props.rawText, i === 1 ? raw : undefined)
    if (i === 1 && hidden) assert.equal(html, '')
    else assert(html.includes('<article>'))
    if (i === 1) assert(!html.includes('synthetic opaque value'))
    cases++
  }
}
console.log(JSON.stringify({ cases, source: 'two exact published UI-chat bundles', rendering: 'real React SSR; primitive and slot adapters synthetic', realBrowser: false, modelRequests: 0, liveAcceptance: false }))
