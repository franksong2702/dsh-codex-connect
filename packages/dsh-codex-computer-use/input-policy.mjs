/** Chrome task input policy. This is application-instance input, not an atomic window sandbox. */
const plain = new Set(['enter','return','tab','escape','space','backspace','delete','left','right','up','down','home','end','pageup','pagedown'])
const movement = new Set(['left','right','up','down','home','end','pageup','pagedown','backspace','delete'])
export function navigationURL(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 512) return undefined
    return url.href
  } catch { return undefined }
}
export function chromeInputDenial(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return 'CUA_CHROME_INPUT_INVALID'
  const fields = params.kind === 'text' ? ['appHandle','windowId','kind','text']
    : params.kind === 'key' ? ['appHandle','windowId','kind','key','modifiers']
      : params.kind === 'navigate' ? ['appHandle','windowId','kind','url'] : []
  if (!fields.length || Object.keys(params).some(key => !fields.includes(key))
    || typeof params.appHandle !== 'string' || !params.appHandle || !Number.isSafeInteger(params.windowId) || params.windowId <= 0) return 'CUA_CHROME_INPUT_INVALID'
  if (params.kind === 'navigate') return navigationURL(params.url) ? undefined : 'CUA_CHROME_NAVIGATION_DENIED'
  if (params.kind === 'text') return typeof params.text === 'string' && Array.from(params.text).length > 0 && Array.from(params.text).length <= 256
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(params.text) ? undefined : 'CUA_CHROME_TEXT_DENIED'
  const key = typeof params.key === 'string' ? params.key.toLowerCase() : ''
  const modifiers = params.modifiers ?? []
  if (!Array.isArray(modifiers) || modifiers.length > 2 || new Set(modifiers).size !== modifiers.length
    || modifiers.some(modifier => !['command','control','option','shift'].includes(modifier))) return 'CUA_CHROME_KEY_DENIED'
  const sorted = [...modifiers].sort().join(',')
  if (!sorted && plain.has(key) || sorted === 'shift' && (plain.has(key) || /^[a-z]$/u.test(key))
    || ['option','option,shift'].includes(sorted) && movement.has(key)
    || sorted === 'command' && ['a','f','r','z'].includes(key)
    || sorted === 'command,shift' && key === 'z'
    || sorted === 'control' && ['a','b','d','e','f','h','k'].includes(key)) return undefined
  return 'CUA_CHROME_KEY_DENIED'
}
