# Immutable media recovery

Planning reuses hash-verified local media before attempting public retrieval.
When neither source is available, it renders in a temporary directory and
accepts the result only if all hashes match persisted state. A renderer upgrade
must never overwrite a campaign already handed to a provider.

The scheduled workflow checks Pages availability before planning and preserves
the completed rolling media window as a separate `campaign-media-archive`
artifact for 30 days. The latest nonexpired archive from main is restored on the
next run. Archives contain generated media only and are excluded from Git.
Every restored file is checked against campaign state before use.

On 2026-09-06 the repository API reported private visibility and no active Pages
site. Existing `github-pages` artifacts were expired. The last recorded pipeline
failure was in immutable media recovery. A 404 alone does not explain why the
site was removed or which hosting option is intended.

Recovery still requires an available hosting destination and original bytes for
the retained, already-scheduled campaigns. Configure Pages on the existing
private repository if supported by its plan, or complete the separately planned
hosting migration. Do not change repository visibility as an incidental fix.
Restore a matching archive or original files; regenerating different bytes and
rewriting hashes would invalidate the provider's existing references.

These changes prevent future loss but cannot resurrect already-expired artifacts.
No production state, repository visibility, or scheduled provider object was
changed by this implementation.
