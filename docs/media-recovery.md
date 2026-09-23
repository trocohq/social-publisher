# Immutable media recovery

Production restores the newest unexpired `campaign-media-archive` or
`verified-recovery-media` artifact from main before planning. Every file is
checked against persisted campaign hashes; an archive is not trusted by name
alone. Valid local files are reused without rerendering. Public recovery and
isolated rerendering are fallback paths, never permission to change a hash.

The completed Pages payload is archived for 30 days before deployment. Keep
the scheduler active so the rolling window is refreshed before expiry.

On 2026-09-07 UTC, diagnostic run 34069157600 regenerated all seven retained
campaigns from September 4 through 10 with exact original feed and video hashes.
It stored these files as `verified-recovery-media`. This recovered the missing
media without changing campaign identities or provider posts. Previous Pages
artifacts had expired. The exact source of the intermittent render mismatch
is not established; production no longer depends on rerendering originals on
every runner.

The diagnostic also read Buffer status without writes. Some September 4–6
posts were in error; restoring hosting does not itself resend failed posts.
Those need separate reconciliation and an explicit recovery decision.
