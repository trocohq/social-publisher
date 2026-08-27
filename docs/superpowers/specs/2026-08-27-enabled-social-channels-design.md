# Enabled Social Channels Design

**Date:** 2026-08-27  
**Status:** Approved approach; awaiting written-spec review

## Goal

Run the daily Troco publisher on Instagram, Facebook, and YouTube while TikTok
authentication is unresolved. TikTok must be explicitly disabled, visible in
durable campaign state, and safe to enable later without backfilling old posts.

The publication cadence remains one campaign per São Paulo calendar day at
12:17. The workflow continues to run every three hours and maintain a rolling
seven-day plan.

## Chosen approach

Each publication channel has an explicit enablement flag. The publisher derives
one immutable enabled-channel set from validated environment configuration and
passes that set through planning and provider preflight.

This is preferred over a second workflow because it keeps one scheduler and one
state machine. It is preferred over placeholder provider IDs because disabled
channels remain distinguishable from broken configuration.

## Configuration

Add these repository variables:

- `INSTAGRAM_ENABLED=true`
- `FACEBOOK_ENABLED=true`
- `TIKTOK_ENABLED=false`
- `YOUTUBE_ENABLED=true`

Each flag accepts only `true` or `false`. Existing installations default to
`true` for backward compatibility, but the production workflow sets every flag
explicitly.

Provider identifiers and secrets are conditionally required:

- An enabled Buffer channel requires its corresponding channel ID.
- At least one enabled Buffer channel requires the Buffer organization ID and
  API key during provider execution.
- Enabled YouTube requires its channel ID and OAuth credentials during provider
  execution.
- Disabled channels do not require their provider ID or credentials.
- Provider execution rejects a configuration with no enabled channels.

`AUTO_PUBLISH` and `YOUTUBE_PUBLICATION_VERIFIED` remain independent safety
gates. Channel enablement never bypasses either gate.

## Planning and durable state

Editorial planning, copy generation, image rendering, and video rendering remain
channel-complete and deterministic. A disabled network can therefore be enabled
for future campaigns without changing recipes or audiovisual output.

When a new campaign state is created, enabled channels follow the existing
`planned → rendered → deploying → media_verified` lifecycle. Disabled channels
transition from `planned` to the terminal `skipped_disabled` stage immediately,
with a timestamped transition record. Later bulk transitions operate only on
non-terminal channel records.

Campaigns that already reached `skipped_disabled` stay terminal. Enabling TikTok
later affects only newly created campaigns. The publisher never backfills or
reopens an older TikTok record.

## Provider preflight and publication

Buffer preflight receives only the enabled Buffer channel IDs. It must:

1. find exactly one matching, unpaused Buffer channel for each enabled service;
2. verify that every match belongs to the configured organization;
3. count scheduled posts and enforce the ten-item free-plan queue limit only for
   enabled services;
4. ignore unrelated or disabled Buffer connections returned by the account.

The YouTube account check runs only when YouTube is enabled. Preflight reports
the actual enabled provider-channel count instead of a hard-coded value of four.

Action selection already ignores terminal stages. A TikTok record marked
`skipped_disabled` therefore never produces an intent or provider call. Instagram,
Facebook, and YouTube retain the existing ordered, idempotent publication and
reconciliation behavior.

## Activation sequence

1. Deploy the channel-enablement implementation with all publication gates off.
2. Set the four enablement variables, with TikTok disabled.
3. Run the hosted validation and dry-run.
4. Run one controlled future campaign:
   - schedule Instagram and Facebook through Buffer;
   - upload YouTube privately for channel and reconciliation verification;
   - make no TikTok request.
5. Inspect the three provider records and public media hashes.
6. Set `YOUTUBE_PUBLICATION_VERIFIED=true` only after the private YouTube upload
   is verified.
7. Set `AUTO_PUBLISH=true` only after the controlled campaign is accepted.

Creating the controlled provider objects and enabling unattended publication
remain separate, explicit external actions.

## Error handling

- Enabled channel without its ID: configuration error before rendering or
  provider calls.
- Enabled provider without required credentials: provider configuration error.
- Disabled channel with a stale ID or credential: ignored; it cannot receive an
  action.
- Buffer returns no match or duplicate matches for an enabled channel: preflight
  fails closed.
- Every channel disabled: configuration error.
- TikTok is enabled later but authentication is still invalid: only TikTok
  preflight fails; no fake ID or silent skip is allowed.
- Existing successful siblings remain unchanged when one enabled channel fails.

## Tests and acceptance criteria

Automated coverage must prove:

- all four enablement flags parse strictly and default compatibly;
- disabled channel IDs and credentials are optional;
- enabled channels still require their own provider configuration;
- planning writes `skipped_disabled` with a legal transition and never advances
  that record;
- Buffer preflight works with Instagram and Facebook only, ignores unrelated
  channels, and enforces capacity for the active pair;
- provider-slot counting and action selection exclude TikTok;
- YouTube checks are conditional on YouTube enablement;
- the workflow declares all four flags and keeps TikTok false;
- existing all-channel behavior remains covered;
- the complete local test/media validation and hosted GitHub validation pass.

The implementation is accepted when the hosted dry-run succeeds and one
controlled planning/preflight run sees three active channels, persists TikTok as
`skipped_disabled`, and makes no TikTok API request.

## Out of scope

- Solving TikTok login or creating a replacement TikTok account.
- Republishing campaigns skipped while TikTok was disabled.
- Changing the daily cadence, 12:17 publication time, editorial rotation,
  captions, palettes, music, or generated-media contracts.
- Enabling unattended publication before the controlled provider test.
