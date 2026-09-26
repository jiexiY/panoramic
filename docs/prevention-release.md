# Prevention workflow release — 26 September 2026

## Scope

Scene review → supervision → supervisor assignment → caregiver acceptance → arrival → recorded outcome → downloadable handoff. Daily notes, audio capture, audio inference and the daily route are removed. Microphone permission is disabled. The previous notes implementation is recoverable at Git commit `6585f5d`.

## Database upgrade

- Official Supabase CLI 2.118.0 created the migration file. After applying through the hosted migration runner, its local filename was aligned to returned version `20260926213803_supervision_first_dispatch`.
- Only the phase check, reservation index and two existing private functions changed. No Auth identities, grants to new roles, tables, storage visibility or billing plans were added.
- Fresh-install and baseline-upgrade tests run the real SQL in isolated PGlite. The upgrade test retains an existing outcome/event and checks unchanged table grants/RLS.
- Hosted read-back confirms dispatch and decline, the reservation index, all four RLS flags, no anonymous command access and no direct authenticated incident updates. The existing 30-second escalation job remains active. Security advisor returned no findings. The incident count was zero before and after.
- The local migration folder contains the upgrade, not a complete reconstructed hosted history. Do not blindly reset or push it as a fresh database. Fresh installations use the documented database schema files.

## Verification

- 118 automated local tests pass. Production build passes; existing non-failing Lucide directive and Three.js chunk-size warnings remain.
- Bathroom playback uses the annotated recording and an authored event. It does not demonstrate automatic water recognition, live caregiver delivery or a model response.
- Hosted Auth/Realtime/private-media integration across multiple accounts and live Gemini output remain unverified. No synthetic live identities or provider requests were used.
- Production frontend deployment and browser smoke checks follow committing/pushing this release. A successful build alone is not evidence those checks passed.
