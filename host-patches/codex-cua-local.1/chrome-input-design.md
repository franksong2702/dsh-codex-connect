# Local.7 Chrome task input

This unpublished candidate extends the already reviewed local.6 ordinary-chat flow. A normal parent conversation calls `codex_computer_use({goal})`; Host-private discovery resolves the related running application and window, with ambiguity answered only by the human in the genuine root conversation. No settings-page preselection or pre-opened destination is required. Parent model selection is unchanged; the owned worker requests `openai-codex / gpt-6.1-terra / high`.

## Authority and resource contract

Only a retained native `com.google.Chrome` target can advertise `inputScope: chrome-instance`. The Host's live `cuaTaskApproval` v3 capability binds that selection to the immutable admitted human input, goal, expiry, genuine live root and owned child. The model cannot manufacture the scope by passing a session identifier or by calling operator RPCs. Claim rejects a different scope before transferring the retained target.

Before the first Terra request, the actual Native pipeline asks the root's human **允许本次操作这个 Chrome？**, with the application instance, observation window, task, deadline and residual window-switch risk. Only **允许这一次** arms input. No stored root permission is copied and no persistent grant is written. Prior feature-development approval is not an answer to this card. Rejection, dismissal, new human input, Stop, expiry or revocation invalidates the task; the same input cannot automatically prompt again.

The v3 capability's private `check` accepts only its exact receipt object. Native `authorizeTaskInput` and `checkTaskInput` are Host-only continuations, absent from the model schema. The Host injects the task ID into native input calls; the child cannot choose it. Revocation generation is reread under the existing application lock. Existing non-Chrome/window-only tasks and older recognized candidates retain their previous behavior.

## Input and observation

The only new model operation is `taskInput`, requiring the approved app handle and observation window ID:

- `text`: 1–256 Unicode scalars; unsupported control characters rejected.
- `key`: one chord. Plain movement/editing keys, Shift variants, Option movement, Command A/F/R/Z, Command Shift Z and Control A/B/D/E/F/H/K are admitted. Clipboard, app/window creation, switching, system shortcuts, arbitrary sequences and holds are rejected. Raw `pressKey`/`typeText` remain denied.
- `navigate`: bounded HTTP/HTTPS URL without credentials. The native transaction sends Command L, the address and Return, checking each event. `javascript:`, `file:` and external-app schemes are rejected before input. A dispatched result is not navigation success; fresh observation is required.

The URL rule applies to this dedicated navigation entry. Generic typing and application UI effects are not a comprehensive browser sandbox. New application launch, new windows and cross-application workflows are outside this resource contract. Navigation can replace the chosen tab's content as requested; the task does not authorize unrelated browser data or accounts.

Single-window AX observation, screenshots, indexed elements, form values and pointer actions retain their strict native window contract. Input invalidates completion evidence until another successful observation. No DOM, CDP, shell, file or general-purpose code executor is added.

## Focus, lifetime and cleanup

After consent, the Host may activate the already selected running instance and raise its retained window once. The hardware-counter baseline starts before this preparation. Input never automatically refocuses or rearms after a detected takeover. The native task retains process-start identity, the AX window object and read-only executable descriptors. Every event verifies process/file identity, foreground PID, focused retained window, deadline, cancellation and hardware-event counters. File or process replacement fails closed. No key content, pointer coordinates, page content or event tap is collected by the counter check.

The Host checks the receipt before subsequent model steps and finishing, and every 200 ms while an approved task is active. The task's native channel serializes these checks with model operations; ordinary clients preserve their original busy behavior. Each monitor has at most one pending check. Closure stops the interval, aborts the task, invalidates clients and joins native/model work before releasing the desktop lease. An uncertain drain keeps recovery closed.

The balanced emitter checks before each key/modifier event. Cancellation releases only keys/modifiers this call pressed, and release-only cleanup verifies the original process identity. A replacement process receives no release. This exact pure emitter is shared with the offline fault fixture.

**Keyboard delivery is application-instance scoped, not atomic single-window isolation.** Between a focus check and PID-targeted posting, an in-flight event or cleanup release can reach another window of that same Chrome instance. Sampled checks may miss transient changes between samples. The human explicitly accepted this residual risk for development, and each actual task card repeats it. It is not permission for future tasks, other applications or persistent control.

## Evidence and remaining acceptance

[Build evidence](build-evidence-local.7.json) identifies the verified official package closure, final 33-file native compilation and binary. Host composition uses the actual Agent registry, root-question service, Native executor and tool pipeline with scripted providers/native channels. It covers consent, invalid routes/chords, private-method rejection, identity mismatch, takeover during a model stream, concurrent monitoring, in-flight Stop, expiry, revocation and cleanup. Pure Swift fixtures exercise shared admission rules, lifetime latches, executable metadata and the production balanced emitter without OS input.

The native driver has not been run, and no real model request or actual approval card has been issued for this source candidate. Real Chrome focus/input/navigation, HID counter separation from synthetic events, OS permission availability and physical key cleanup remain unverified. These need a separately authorized bounded acceptance run after independent review and exact-head CI. No native/custom performance equivalence is claimed. This checkpoint does not update the daily 3081 service.
