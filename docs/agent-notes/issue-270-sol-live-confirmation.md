# Issue #270 — final GPT-6 Sol image-selection confirmation

Status: **PASSED for the bounded selection scenario**. This closes the remaining final-adapter live-selection gate for the user-requested `gpt-6-sol` route. It is not a release, full UI acceptance, a claim of perfect selection reliability, or a post-fix GPT-5.6 Sol benchmark.

## Exact identity and authorization

- Repository: `franksong2702/dsh-codex-connect`.
- Branch: `franksong2702/issue-270-image-edit`.
- Tested commit: `ff1192393df5fb45a536539f07faee7bf532883a`.
- Tested `lib/index.js` SHA-256: `0ace9ac73f9697614a888b176c7fb83bfa7f1ef6b4420f547118c2986c999e50`.
- Acceptance script SHA-256: `b406b0e4773f3a07279c9cf22749207951f0dcd8a4b2413d7a24ae966fa13cf5`.
- Node: `v22.22.3`; installed host baseline remains DSH `0.1.7-rc.1`.
- Live run: 2026-09-25 14:23:49–14:23:59 UTC (22:23:49–22:23:59 UTC+8).

The user explicitly authorized WebCodex, specified `gpt-6-sol`, and authorized at most two ordinary model requests with zero real image requests. This was a new bounded authorization, not reuse of the previously exhausted 3-image/8-model budget. The existing selected account in the identified DSH Test RC1 3081 profile was accessed only through the plugin's credential-store API. No account rotation, alternate API-key route, credential copying, saved capability changes, or daily-service restart was used.

## What was actually exercised

The acceptance script used the compiled candidate, real AgentLoop, production image-tool schema and implementation, and a real temporary attachment store. Two non-sensitive synthetic PNGs had distinct content-addressed IDs and neutral filenames. The ordinary user prompt supplied no attachment IDs:

> Edit the FIRST attached image. Change only its background color using the SECOND attached image as a color-palette reference. Keep the red square and green circle unchanged. Use the image editing tool. Do not generate a new unrelated image.

The only eligible tool was `codex_connect_image_generate`. The actual provider payload named `gpt-6-sol` and contained the final adapter's numbered stable handles. The returned tool call selected the first attachment as target and the second as the sole reference. The production resolver read the correct two images, and hashes of the ordered image bytes at the edit transport boundary matched those admitted attachments.

At that boundary the harness saved its observations, blocked the image request **before any network dispatch**, and cancelled the isolated agent. Thus this run proves real model selection and production input resolution, not a newly rendered image or a normal post-edit completion message.

## Results

| Check | Observed result |
| --- | --- |
| Offline dry-run with the same script and compiled runtime | Passed; one simulated model response, zero real requests |
| Requested model / actual request payload | `gpt-6-sol` / `gpt-6-sol` |
| Real ordinary model requests | **1 of maximum 2**; HTTP 200 |
| Image-tool calls | **1** |
| Operation | `edit` |
| Target | Correct first attachment |
| References | Exactly one; correct second attachment; nonempty purpose |
| Resolved image data and order | Exact expected hashes at the edit boundary |
| Real image requests | **0** |
| Locally blocked edit attempts | **1**, intentional |
| Generation fallback / other endpoint attempts / over-budget attempts | **0 / 0 / 0** |
| Report persistence and isolated resource cleanup | Passed |
| Process result | Exit 0 |

No second real model request was needed. The runner writes quota reservations and selection evidence before cancellation/cleanup, and refuses to replay an existing live run. Before live execution it verifies a passed offline report with identical script and runtime fingerprints. The failed import during preliminary offline route discovery consumed no model/image request and changed no product files.

## Retained evidence

- [Offline report](../experiments/evidence/issue-270-sol-selection/offline.json), SHA-256 `111cd185f5fcb4ae4e31cf975357b5cf682a7432e1b423e725ed4ddb8e98325a`.
- [Live report](../experiments/evidence/issue-270-sol-selection/live.json), SHA-256 `74d5a63b42749a8a02688e222ffea9b4ae5fad393948bd889cfd8aaa92e02cda`.
- `scripts/check-issue-270-selection.mjs`: opt-in one-off harness, fenced to the reviewed commit/runtime. It is not part of automatic tests, does not enable live testing by default, and must not be rerun under this spent operation authorization. Another acceptance requires its own explicit authorization and source identity.

The reports contain only synthetic fixture selectors, boolean checks, request counts, HTTP status and source identities. They contain no tokens, account IDs, credential paths, raw request bodies, or image data.

## Remaining scope and next delivery step

Together with the previous three real edits and the recorded 1,405-test / 70-browser-test regression evidence, the final selection check supports moving this candidate to PR/CI review. Previous tests are historical evidence for their exact runtime, not newly rerun in this documentation/harness-only continuation. No production source or bundle was changed in this round.

Only GPT-6 Sol was tested here. This does not claim that GPT-5.6 Sol or every model will always choose correctly, nor does it certify arbitrary reference interpretation, full installed-session UI, physical Windows/mobile, crash recovery, or pixel-perfect editing. No additional image result was generated. No push, PR, merge, publication, deployment, or 3080/3081 service modification occurred.
