# Provider Media Retention Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development and test-driven-development. Work only on the existing isolated branch; no dispatch, provider retry, main merge or deployment.

**Goal:** Keep media for in-flight scheduled publications and reject oversized candidate sites locally.

**Architecture:** Extend existing campaign selection so unresolved scheduling,
scheduled and publishing states retain their immutable media irrespective of
calendar age. Before rebuilding the temporary Pages output, measure the actual
selected files plus generated JSON and reject a candidate above 500,000,000
bytes. Existing remote Pages and receipts stay untouched.

**Tech Stack:** TypeScript, Node test runner, existing filesystem and Zod contracts.

## Verified execution

Implemented and pushed as `79f74b3` on the isolated
`cloudflare-publishing-cutover` branch. Two retention and seven budget
regressions failed before implementation. The final full check passed 192
tests; validation passed with the canonical brand root (19 tracked files,
three provider contracts). Independent specification and quality reviews
passed. Explicit standalone retained-URL/hash and deterministic source-growth
race tests remain optional coverage improvements, not claims made by this
verification. No main merge, provider retry or deployment was performed.

## Evidence and boundary

The current remote main rule excludes a 3-day-old campaign still marked
`scheduled`, even with a provider ID. A local reproduction returned false.
Five old Buffer errors independently report inaccessible media; their current
asset HEAD checks now return 200. The rule is unsafe for delayed consumers,
but those observations do not prove this rule caused every historical error.

GitHub documents a 1 GB published Pages limit. The 500 MB local cap is a
conservative project policy, not another paid quota or a guarantee about
bandwidth/Actions artifact storage. See
[GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Task 1: Retain in-flight consumers

Modify `src/media/pages.ts` and `tests/pages-media.test.ts`.

- [ ] Add tests using `campaignStateFixture` with all other channels terminal. Assert `retainedCampaignIds` retains each of `scheduling`, `scheduled`, `publishing` after both the original date and any rescheduled date plus two days, with and without a provider ID.
- [ ] Run `node --import tsx --test tests/pages-media.test.ts` and verify those assertions fail before changing implementation.
- [ ] Extend the existing predicate with the in-flight check below; preserve the existing rescheduled-date grace for other states and the invalid-clock rejection.

```ts
if (["scheduling", "scheduled", "publishing"].includes(record.stage)) {
  return true;
}
```

- [ ] Update the old test that expected a still-scheduled post to lose media after two days: it must retain until the provider stage becomes terminal. Then assert no indefinite retention for old all-published, failed or explicitly skipped campaigns.
- [ ] Verify original URLs and hashes remain unchanged for retained campaigns through the existing payload test. Do not automatically retry failed posts or change durable state.

## Task 2: Bound the static candidate before replacement

Modify `src/media/pages.ts`; add `tests/pages-budget.test.ts` if keeping tests separate improves readability.

- [ ] Add a regression creating sparse local source files (each under 50 MB) with aggregate size above 500 MB and an existing output sentinel. Assert `createPagesPayload` throws a fixed budget error, leaves the sentinel intact and never copies the large files. Use `truncate` only inside a newly created test temp directory, not a project directory.
- [ ] Preflight the selected parsed campaign records before removing `pagesRoot`. Use existing `requireSafeSource`, then `lstat` to require regular, positive-size files no larger than 50 MB. Compute actual file sizes, not optional manifest byte claims. Build the exact completed manifest records with those sizes and account for the serialized manifest/index JSON (the same two-space formatting and newline as `atomicJson`). Require total <= 500,000,000 and a safe integer. A local budget error prevents the workflow reaching its existing upload step.
- [ ] During the existing verified copy loop, recheck actual bytes and aggregate budget to fail if sources grow after preflight. Preserve original SHA checks, path/symlink guards and manifest shape. Do not add a paid service, storage deletion or configurable budget bypass.
- [ ] Tests cover normal small payload, false manifest byte claims, oversized files, symlinks, aggregate overflow and metadata accounting. Preserve output on preflight failure. Existing tests must remain green.
- [ ] Run `npm run check`, `npm run validate`, `git diff --check`; compare failure baseline if environment prerequisites block rendering. Independently review specification and code quality before committing the exact changes to the isolated branch.

## Not claimed by this correction

Provider receipt ownership, ambiguous retries already marked expired, total
Actions storage and bandwidth accounting remain separate gates. This patch
does not establish that historical failed posts may be republished safely.
