# Issue #215 installation triage — 2026-09-19

## Evidence and limits

The maintainer supplied the report excerpt directly after the earlier detailed issue-body read was blocked. This triage uses that supplied text, repository manifests, official documentation and a separate offline pnpm control. It does not recover or retry the denied issue-body read. The reporter's full hub.log, profile manifests, exact pnpm version and exact Git-install commit remain unavailable.

Reported environment: Windows x64, Node 24.16.0, DSH 0.1.6-alpha.2, Plugin Hub 1.4.2. The summary names a Git-based plugin add, whereas its attempted-channels section lists removal. The complete command/rollback order cannot be inferred from this summary.

## Findings

The first concrete blocking error in the supplied excerpt is ENOENT while opening the local archive `dsh-computer-use-0.2.0-win1.tgz`. The package manager calls this a direct dependency of the web profile, not a Codex Connect dependency. A referenced path component or file was unavailable. How the reference entered that profile and whether the archive was moved/deleted or its path supplied incorrectly remain unconfirmed. Private absolute paths are intentionally omitted here.

Neither current HEAD `525e01b6e1c2b7d23ba70e29510ef1fd31fb0168`, the local 4.37 candidate, nor published 4.36 source `eae9430f16f1707d8cefb76dec6e8344871d7684` declares `dsh-computer-use`, `dsh-plugin` or `dsh-skill-manager` in dependency sections. The current lockfile and plugin patch contain no `dsh-computer-use` reference. Runtime dependencies are unchanged. This is not verification of the reporter's unrecorded exact Git revision.

UND_ERR_DESTROYED means an operation used an already destroyed Undici client; it does not identify who destroyed it or why. The registry warnings could be cleanup/cancellation consequences or a separate transport problem. The excerpt and the control below do not prove that causal link. Sharing an Undici dependency does not attribute this failure to Codex Connect. The auto-generated labels `plugin-side install failure` and `Key error: ERR_DESTROYED` are not established root-cause findings.

Stock DSH 0.1.6-alpha.2 remains undeclared and tracked separately by #211. The missing archive is not established as a duplicate of #211's plugin-exec peer-resolution problem. Repairing an archive reference does not certify alpha.2 compatibility.

## Offline control

Executed on M15 / macOS / Node 22.22.3 / pnpm 10.30.3 at 2026-09-19T10:25:14Z. Only two metadata-only synthetic tarballs were used; no Codex Connect, DSH or Hub runtime was loaded. Every add used `--offline --ignore-scripts --ignore-workspace`, an isolated temporary home/store and empty npm configuration.

| Scenario | Exit | Result |
| --- | --- | --- |
| Add the new fixture to a clean project | 0 | Success. |
| Add the same fixture while another direct dependency references a missing local archive | 254 | ENOENT names the missing existing archive; direct-dependency diagnostic present. |
| Restore only that archive and repeat the same add in the same project | 0 | Success. |

None of these runs emitted UND_ERR_DESTROYED. This reproduces a package-manager mechanism, not the reporter's Windows/Hub stack or full warning sequence. No live model requests or reporter configuration changes occurred. Temporary files were removed. A sanitized receipt is in ignored `node_modules/.cache/issue215-local-tarball-repro.json`.

## Maintainer response and release disposition

Keep #215 open pending reporter confirmation. Ask the reporter to check the archive using PowerShell `Test-Path -LiteralPath`, inspect the relevant dsh-computer-use entry in the profile package.json/pnpm-lock.yaml, and preserve backups before restoring the trusted archive or intentionally correcting/removing its stale reference through the supported plugin-manager workflow. Do not delete the whole .dsh home, blindly remove lockfiles or use an arbitrary substitute archive.

If installation still fails, request the exact package-manager version and the command-boundary/error section of hub.log, with credentials, auth URLs and unnecessary private paths redacted. Clarify add versus remove. Persistent registry warnings should be investigated separately after the local source blocker is addressed.

For 4.37 on the unchanged declared-supported host set, this is **not currently a confirmed release-blocking plugin regression**. Preparation may proceed with this evidence-backed disposition. Keep the issue open and reassess if a clean supported-host reproduction identifies a plugin defect. Do not claim that 4.37 fixes the archive, the network warnings or alpha.2 compatibility. Candidate review, artifact/compatibility records, remote CI, merge and publication authorization remain separate gates.

## Primary references

- Node.js ENOENT definition: https://nodejs.org/api/errors.html#common-system-errors
- pnpm 10 install / removed file-dependency targets: https://pnpm.io/10.x/cli/install
- Undici ClientDestroyedError: https://undici.nodejs.org/api/Errors#clientdestroyederror
