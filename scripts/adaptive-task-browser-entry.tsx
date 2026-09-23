/** Isolated fixture carrier for the actual product control, not a new shipping entry. */
import { createRoot } from 'react-dom/client'
import { PublishedAdaptiveTaskControl } from '../src/client/PublishedAdaptiveTaskControl.tsx'
const controls = document.getElementById('task-controls')!
createRoot(controls).render(<PublishedAdaptiveTaskControl language="zh" sessionId={controls.dataset.sessionId ?? 'authenticated-task-fixture'} />)
const form = document.getElementById('task-form') as HTMLFormElement
form.onsubmit = async event => {
  event.preventDefault()
  const text = (document.getElementById('task-text') as HTMLTextAreaElement).value
  const result = await fetch('/fixture/task', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
  document.getElementById('task-result')!.textContent = result.ok ? 'Fixture task finished' : 'Fixture task failed'
}
