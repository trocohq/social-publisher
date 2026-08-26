# Troco Social Publisher - Agent Instructions

This repository builds deterministic Brazilian Portuguese social campaigns for
Troco. It is a public repository and must never contain credentials or generated
media binaries.

## Required boundaries

- Use Node.js 20.19.4 or newer, ESM, strict TypeScript, and functional modules.
- Represent money as integer minor units and use `@trocohq/core` for calculations.
- Validate runtime and persisted inputs with Zod.
- Use the canonical Troco brand files; never draw or substitute the mark.
- Pass external-process arguments as arrays. Never construct shell command strings.
- Keep dry runs free of network writes and durable state mutations.
- Keep generated JPEG, MP4, WAV, HTML review output, and credentials out of Git.
- Write code, comments, documentation, and commit messages in English.

## Validation

Run `npm run check` for formatting, types, and tests. Run `npm run validate` for
catalog, brand, render, media, state, and workflow contracts.
