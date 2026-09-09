# Failed Buffer reconciliation

Goal: reconcile an explicitly selected failed Buffer post by its existing ID,
without creating, rescheduling or retrying any provider mutation. The user has
authorized autonomous recovery; live recovery remains separate from this code.

Evidence: six historical Facebook/YouTube posts have Buffer media-access errors.
All nine referenced media URLs currently return HEAD 200. The regular state
machine deliberately makes failed terminal, so even an independently recovered
provider post cannot currently be reflected locally.

## Selected design

Keep normal failed transitions terminal. Add a separate recovery reconciliation
function and explicit CLI action for failed records with a nonempty provider ID
and lastError category buffer_async_failure. Only Buffer-backed Instagram,
Facebook and YouTube are eligible. Do not automatically scan failed records or
change workflow scheduling. Existing provider adapter selection must enforce
Buffer ownership, including YouTube configuration.

Read the exact provider object through the existing reconciliation adapter.
Accept only an exact ID match and a valid scheduled, publishing or published
state. For scheduled recovery require a valid future dueAt; do not infer that
missing dates mean success. Missing, ambiguous, still-error, mismatched, malformed
or failed reads must leave the failed record and history unchanged. Never invoke
create or editPost. Successful recovery preserves all attempt IDs/counts,
provider ID and unrelated campaign fields, records a single auditable transition,
clears only the resolved lastError and persists once. Repeating against a now
active/nonfailed local record must not create another transition or mutation.

## Implementation sequence

- [x] Baseline npm test and typecheck in isolated worktree.
- [x] Add behavior-first tests for exact-ID recovery plus all denial cases.
      Observe a behavior RED before implementing.
- [x] Implement focused module under src/publishing and an explicit CLI option
      in reconcile.ts. Do not weaken transitionProvider's general failed rule.
- [x] Exercise CLI selection, provider ownership and state persistence boundary.
- [x] Run npm run check and npm run validate; independent reviews before commit.
- [ ] Integrate only after verification. No live provider mutation in this task.

Alternative rejected: resetting failed to retryable would permit duplicate
creation. Automatically treating historical failures as expired would hide an
unresolved publication. This design uses fresh provider evidence instead.

Verification: all 192 existing tests passed after supplying the canonical brand
root and installing the declared FFmpeg binary. The completed suite passes 236
tests, formatting and typecheck. Catalog/brand/render/media/state/workflow
validation passes for 20 tracked campaigns and three provider contracts.
Independent specification and security reviews approved the slice and each ran
all 44 new tests. Behavior RED was observed for recovery, explicit CLI selection,
unknown provider status and input mutation during asynchronous observation.

Operational command: `npm run reconcile -- --recover-failed --action CAMPAIGN:CHANNEL`.
This only observes provider state; it does not retry or reschedule the post.
