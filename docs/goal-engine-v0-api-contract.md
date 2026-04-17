# Goal Engine v0 API Contract

## Compatibility Rules

- New request fields must be optional until all adapter clients support them.
- New response fields must be additive.
- Existing enum values must not be removed without a migration window.
- Service routes should tolerate older adapter payloads where possible.
- Adapter parsers should ignore unknown service response fields.
- For this platform facts foundation slice, `POST /goals/:goalId/complete` is the planned evidence-referenced completion protocol; direct status patching remains legacy-compatible but is not the recommended completion path once that route is available.
