/** Trusted Host preparation only. Candidate metadata never becomes a tool result or model message. */
import { randomUUID } from 'node:crypto'

const aliases = new Map([
  ['com.google.Chrome', ['Chrome', 'Google Chrome', '谷歌浏览器']],
  ['com.apple.Safari', ['Safari']],
  ['org.mozilla.firefox', ['Firefox', '火狐浏览器']],
  ['com.microsoft.edgemac', ['Microsoft Edge', 'Edge']],
])
const normalized = value => value.normalize('NFKC').toLocaleLowerCase('en-US')
function mentions(text, name) {
  if (typeof name !== 'string' || !name.trim()) return false
  const needle = normalized(name.trim())
  const haystack = normalized(text)
  let position = -1
  while ((position = haystack.indexOf(needle, position + 1)) !== -1) {
    if (!/[a-z0-9]/u.test(needle) || !/[a-z0-9_]/u.test(haystack[position - 1] ?? '')
      && !/[a-z0-9_]/u.test(haystack[position + needle.length] ?? '')) return true
  }
  return false
}

/** Only real admitted human input supplies discovery authority; model goal text supplies none. */
export function isTaskUserInput(message) {
  return message?.role === 'user' && ['user', 'user-rpc'].includes(message.source?.kind)
    && typeof message.id === 'string' && message.id.length > 0
}
export function latestTaskRequest(parent) {
  const message = parent?.session?.deriveMessages().filter(isTaskUserInput).at(-1)
  if (!message || typeof message.id !== 'string' || !message.id || !Array.isArray(message.content)) return undefined
  const text = message.content.filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text).join('\n').trim()
  return text ? Object.freeze({ id: message.id, text: text.slice(0, 16000) }) : undefined
}

/** Pending human input invalidates the old task before the loop admits it. */
export function taskInputIsCurrent(parent, userInput) {
  if ((latestTaskRequest(parent)?.id ?? parent.id) !== userInput) return false
  return ![...(parent.inbox?.nextTurn ?? []), ...(parent.inbox?.nextStep ?? [])]
    .some(message => isTaskUserInput(message) && message.id !== userInput)
}

/** Exact root/session filtering; returned disposer transfers with the task lifetime. */
export function watchTaskInput(ctx, parent, userInput, changed) {
  const different = message => isTaskUserInput(message) && message.id !== userInput
  const stop = [ctx.on('session/event', (session, event) => {
    if (session === parent.session && event.type === 'user/message' && different(event.data)) changed()
  }), ctx.on('agent/inbox/inserted', ({ agent, message }) => {
    if (agent === parent && different(message)) changed()
  })]
  let released = false
  return () => { if (!released) { released = true; for (const dispose of stop) dispose() } }
}

/** Called by the Host capability, never by an owner RPC or a caller-supplied session identifier. */
export async function prepareTaskTarget(targets, access, input) {
  const fail = code => { throw targets.error(code) }
  if (!input || Object.keys(input).some(key => !['parent', 'goal', 'signal', 'expiresAt'].includes(key))
    || typeof input.goal !== 'string' || !input.goal.trim() || input.goal.length > 8000
    || !(input.signal instanceof AbortSignal) || !Number.isSafeInteger(input.expiresAt)
    || input.expiresAt <= Date.now() || input.expiresAt > Date.now() + 180000) fail('CUA_TARGET_INVALID_TASK')
  const { parent, signal, expiresAt } = input
  const live = () => parent && targets.ctx.agents.get(parent.id) === parent
    && targets.ctx.agents.roots().includes(parent) && targets.root(parent.id) === parent
  if (!live()) fail('CUA_TARGET_LIVE_ROOT_REQUIRED')
  const request = latestTaskRequest(parent)
  if (!request) fail('CUA_TARGET_USER_REQUEST_REQUIRED')
  if (access.taskRefusals.get(parent) === request.id) fail('CUA_TARGET_RETRY_REQUIRES_USER_INPUT')
  const questions = targets.ctx.get('userQuestions')
  if (!questions || typeof questions.ask !== 'function') fail('CUA_TARGET_HUMAN_INTERFACE_UNAVAILABLE')
  let row, inputChanged = false
  const preparation = new AbortController()
  const refuse = () => access.taskRefusals.set(parent, request.id)
  const current = () => {
    signal.throwIfAborted()
    if (inputChanged || !live() || !taskInputIsCurrent(parent, request.id)) fail('CUA_TARGET_REQUEST_CHANGED')
    if (Date.now() >= expiresAt) fail('CUA_TARGET_EXPIRED')
    if (row) targets.assert(row)
  }
  current()
  const stopInputWatch = watchTaskInput(targets.ctx, parent, request.id, () => {
    inputChanged = true; refuse(); preparation.abort()
    if (row) void targets.close(row).catch(() => {})
  })
  return targets.inOrder(parent, async () => {
    try {
      current()
      row = await targets.start(parent)
      row.flow = Object.freeze({ id: randomUUID(), userInput: request.id, goal: input.goal, expiresAt })
      row.stopInputWatch = stopInputWatch
      row.expiresAt = expiresAt
      clearTimeout(row.timer)
      const abort = () => { refuse(); void targets.close(row).catch(() => {}) }
      signal.addEventListener('abort', abort, { once: true })
      const release = row.release
      row.release = () => { stopInputWatch(); signal.removeEventListener('abort', abort); return release?.() }
      row.timer = setTimeout(abort, Math.max(1, expiresAt - Date.now()))
      const taskSignal = AbortSignal.any([signal, preparation.signal, row.controller.signal])
      current()
      const ask = async question => {
        current()
        // Blocking service requests do not create ask_user_question tool events or late-answer user messages.
        const reply = await questions.ask({ agent: parent, signal: taskSignal, questions: [question] })
        current()
        const answers = reply?.answers
        if (!Array.isArray(answers) || answers.length !== 1 || answers[0]?.id !== question.id) fail('CUA_TARGET_SELECTION_DENIED')
        return answers[0]
      }
      const catalog = await row.client.request('listApps', {}, taskSignal)
      current()
      if (!Array.isArray(catalog) || catalog.length > 1000) fail('CUA_TARGET_METADATA_INVALID')
      const related = text => catalog.filter(app => mentions(text, app?.name)
        || (aliases.get(app?.bundleId) ?? []).some(name => mentions(text, name)))
      let applications = related(request.text)
      if (applications.length === 0) {
        const answer = await ask({ id: 'cua-task-application', question: 'Which already-open application should this task use?' })
        if (!Array.isArray(answer.selected) || answer.selected.length !== 0 || typeof answer.custom !== 'string'
          || !answer.custom.trim() || answer.custom.length > 1024) fail('CUA_TARGET_SELECTION_DENIED')
        applications = related(answer.custom)
      }
      if (!applications.length) fail('CUA_TARGET_NO_RUNNING_APPLICATION')
      if (applications.length > 16 || new Set(applications.map(app => app.pid)).size !== applications.length) fail('CUA_TARGET_METADATA_INVALID')
      const candidates = []
      for (const app of applications) {
        current()
        if (!Number.isSafeInteger(app.pid) || app.pid <= 0 || typeof app.name !== 'string' || !app.name || app.name.length > 1024) fail('CUA_TARGET_METADATA_INVALID')
        row.app = targets.prepared(await row.client.request('getApp', { selector: String(app.pid) }, taskSignal), app.pid, app.bundleId)
        current()
        await targets.windows(row)
        current()
        for (const target of row.candidates) candidates.push({ target, app: row.app })
        if (candidates.length > 32) fail('CUA_TARGET_TOO_MANY_WINDOWS')
      }
      if (!candidates.length) fail('CUA_TARGET_NO_WINDOW')
      let selected = candidates[0]
      if (candidates.length > 1) {
        const labels = candidates.map(({ target }, i) => `${i + 1}. ${target.application} — ${target.title.slice(0, 160) || 'Untitled window'}`)
        const cancel = 'Cancel this task'
        const answer = await ask({ id: 'cua-task-window', question: 'Which window should this task use?',
          detail: 'Selection only prepares this target. You will separately approve observation and control for this task.',
          options: [...labels, cancel].map(label => ({ label })) })
        if (answer.custom !== undefined && answer.custom !== '' || !Array.isArray(answer.selected) || answer.selected.length !== 1) fail('CUA_TARGET_SELECTION_DENIED')
        const index = labels.indexOf(answer.selected[0])
        if (index < 0) fail('CUA_TARGET_SELECTION_DENIED')
        selected = candidates[index]
      }
      current()
      row.app = selected.app
      row.candidates = [selected.target]
      await row.client.request('bindTaskWindow', { appHandle: row.app.appHandle,
        windowId: selected.target.windowId, targetKey: selected.target.targetKey }, taskSignal)
      current()
      row.selected = selected.target
      // Only the chosen opaque binding is returned inside the trusted Host; never the directory or labels.
      return targets.target(parent)
    } catch (error) {
      refuse()
      if (row) {
        try { await targets.close(row) } catch { fail('CUA_TARGET_CLEANUP_UNCERTAIN') }
      } else stopInputWatch()
      // Native errors may contain private app paths/titles; neither raw errors nor causes cross this boundary.
      const code = inputChanged ? 'CUA_TARGET_REQUEST_CHANGED' : typeof error?.code === 'string' && /^CUA_TARGET_[A-Z_]+$/u.test(error.code)
        ? error.code : signal.aborted ? 'CUA_TARGET_CANCELLED' : 'CUA_TARGET_METADATA_UNAVAILABLE'
      fail(code)
    }
  })
}
