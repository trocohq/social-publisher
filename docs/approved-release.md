# Approved illustrated release

The approved visual is implemented in `src/render/approved-lessons.ts`, with
versioned copy in `assets/editorial/approved-lessons.json`. Its 48 scene stacks
are centered at y=960 with 80px between blocks and at least 88px lateral text
margins. The original brand assets and three hash-pinned generated illustrations
are required. Generated images remain outside Git.

Build a complete offline package into a **new** directory:

```sh
npm run package:approved -- \
  --art-root .tmp/practical-lessons-review/illustrations \
  --brand-root ../frontend/public \
  --output .tmp/approved-release-2026-09-06-v1
```

This creates twelve MP4s, twelve JPEG covers, forty-eight PNG scenes, twelve
caption files and a manifest containing file hashes. An existing output
directory is rejected. Failed partial builds must not be dispatched: only a
complete manifest marks a package ready. Renderer identity must be versioned
when its appearance changes. Packaging never changes historical campaign state,
uploads assets or contacts a social provider. Existing scheduled campaigns keep
their prior immutable media references.

## Deployment boundary checked on 2026-09-06

- The Troco GitHub Pages origin remains configured but Pages is unavailable.
- TikTok is disabled in the current repository configuration.
- The shared platform runbook selects Cloudflare R2 and Worker production, but
  explicitly excludes social adapters and producer intake from this rollout.
- Its documented production `/health/live` origin returned HTTP 404 during the
  latest read-only check. This does not prove the entire migration failed, but
  it does not establish a usable upload/publication endpoint either.

## Current production is the release target

The user confirmed that the existing production publisher, not Cloudflare,
must be used. The remote `main` branch and its GitHub Actions publishing workflow
are active; Buffer remains the provider. Cloudflare activation is not a release
prerequisite. Its migration must stay separate.

The latest existing workflow failed restoring immutable historical media, and
its configured Pages origin requires investigation. Integrate the approved
renderer and copy into future campaign planning on the current production path,
resolve its media hosting/recovery issue, then run its controlled release checks.
Do not dispatch it unchanged expecting these package files to be picked up:
it currently renders older campaign plans. Preserve existing provider IDs and
hashes. Stories must wait for primary Instagram confirmation. Confirm TikTok's
connection before enabling it. Do not switch DNS or make the repository public.
