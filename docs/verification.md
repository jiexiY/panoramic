# Verification record

## Panoramic rename — September 26, 2026

- Renamed the existing GitHub repository to `jiexiY/panoramic` and Vercel project to `panoramic`; repository history and Vercel project ID remain unchanged. Updated the local Git remote and Vercel project link. Verified Vercel's Git connection references `jiexiY/panoramic`, repository ID `1388472646`, branch `main`.
- `panoramic.vercel.app` was unavailable (Vercel HTTP 409). Added and verified `panoramic-care.vercel.app` on the same project. The old production domain is retained for existing links.
- App name, browser titles, report headings/download names, package metadata, current README/setup instructions, and local submission-draft branding now use Panoramic. Historical verification/provenance and archived source retain their original names. No live Devpost update or submission was made.
- All 54 tests and TypeScript/Vite builds passed after the rename. Local Chrome verified the Panoramic entrance and workspace navigation. The 390-pixel mobile entrance had no horizontal overflow; the temporary viewport override was reset.
- Pushed commit `4bceacd` to the renamed repository. GitHub Actions run `36229548488` succeeded, and the connected Git deployment `dpl_MrV8Lg2puFF8anPR9qygpKUdjjYw` reached Ready with a successful Vercel commit check.
- New production entrance, all three workspace paths, and legacy welcome URL returned HTTP 200. The old production domain also returned Panoramic. Read-only Gemini readiness remains configured; no generation request, secret change, database change, or billing change was made. Live Chrome confirmed Panoramic branding, entry navigation, and the empty workspace without console errors. Proof: `output/panoramic-live-entry.png`.

## Minimal entrance and empty workspace — September 26, 2026

- Entrance now shows only the bold SteadySide name and entry button. Removed top-left and center branding icons, welcome text, white center card, surrounding copy, and footer. Removed redundant workspace sidebar/footer copy and the default fictional user avatar.
- Fresh scene review has no selected room, observations, caregivers, incident, or activity. Upload tools appear after Add room image; the privacy confirmation stays with the upload. The authored rehearsal and sample caregivers load only on explicit selection.
- Care-session state starts with zero events and no displayed resident. New demo session creates the sample. Signing into an empty account no longer creates a sample record; existing saved records are not deleted or altered. No backend schema, RLS, credentials, or billing settings were changed. Authenticated account restoration was not live-tested in this UI update.
- All 54 automated tests passed and TypeScript/Vite builds passed. Chrome verified empty scene review, care session, and history; explicit sample session creation; upload panel opening/focus; and the illustrated response from acknowledgment through arrival and written resolution. Reload returned to empty state. No Gemini generation request was made.
- Desktop and 390-pixel mobile entrance/home visually checked. Mobile and 900-pixel tablet DOM widths matched their content widths without horizontal overflow. Temporary viewport override reset.
- Production deployment `dpl_3eYTBudWq89WECnfVTd77TJffcJX` reached Ready. All four product routes returned HTTP 200, read-only API readiness remained configured, and live Chrome showed the minimal entrance and empty homepage without console errors.
- Proof screenshots: `output/steadyside-minimal-entry.png` and `output/steadyside-empty-home.png`.

## Product-only entrance and home — September 26, 2026

- Supersedes the three-screen structure below at the owner's request. `/` now opens the product entrance directly; its single primary action enters `/app`. The former `/welcome` address redirects to `/` in production. Session and history remain workspace tabs.
- Removed the advertising page, story, How it works, technical explainer, sales CTA, and links to those sections from runtime source and the build. Previous site source/styling are preserved in `docs/archive/` and excluded from deployment. Essential privacy and prototype-status notices remain.
- All 50 automated tests and the production build passed. New regression cases cover the legacy redirect and absence of marketing content/links in the entry/workspace. No matching advertising copy was found in built assets.
- Local Chrome: entrance → workspace → entrance works; mobile entrance has matching 390-pixel content/viewport widths and no browser errors. No model generation calls, auth/database changes, or billing changes.
- Deployment `dpl_4rVypqmwvbvy2Ztq3561nhM6449R` reached Ready. Production `/` and `/app` returned HTTP 200; requesting `/welcome` ended at `/`. Live Chrome confirmed direct entry into the workspace and return to the start page. Screenshot: `output/steadyside-product-start.png`.

## Public website, opening screen, and product separation — September 26, 2026

- Added the requested public journey: `/` → “Try SteadySide now” → `/welcome` → “Open care workspace” → `/app`. Care sessions and history have their own `/app/session` and `/app/history` paths.
- Moved the founder story, workflow explanation, technology roles, and implementation boundaries to the public landing page. Removed the in-workspace About navigation/page and replaced session/history marketing headings with operational labels.
- Preserved the existing workflows in `src/Workspace.tsx`; extracted the shared authored room illustration without replacing the scene-analysis integration. Lazy loading separates the initial public page from workspace integrations. Internal navigation retains opened workspace state, while refresh still clears local records as disclosed.
- All 48 tests passed, including five route/production-rewrite tests. TypeScript and Vite production builds passed. Client code is split into landing/runtime and workspace chunks; only the existing non-failing Lucide directives warning remains in the frontend build.
- Chrome local QA: full entry journey, public section anchor, care-session direct refresh, browser Back retaining an acknowledged fictional response, focus on the visible page heading, and no browser errors. Mobile landing, welcome, and workspace content widths matched their viewports; no horizontal overflow.
- Vercel deployment `dpl_GDac4QE382imAuLLvV8gztYtkzkp` reached Ready. All five page routes returned HTTP 200. The production landing → welcome → workspace journey rendered correctly, and refreshing `/app` returned the workspace. The API readiness endpoint still returned JSON with all settings checks true; no generation requests were made.
- No authentication, database, billing, analytics, or Devpost changes. No claim of successful live Gemini analysis is added. Production screenshots: `output/steadyside-landing-live.png`, `output/steadyside-opening-live.png`, and `output/steadyside-workspace-live.png`.

## Care-center homepage theme — September 26, 2026

- Replaced homepage slogans with operational scene-review, response, availability, and handoff labels. Updated the shared shell to warm cream, sage, and slate blue; retained fictional-data, privacy, and model-readiness labels.
- All 43 automated tests passed. TypeScript and Vite production build passed with the existing non-failing bundle-size and Lucide directive warnings.
- Local Chrome checks: desktop layout, 390-pixel requested mobile viewport (375-pixel content width), no horizontal overflow, no console errors, and navigation away/back retaining the scene state.
- Illustrated rehearsal completed acknowledgment, arrival, and a specific operator-entered resolution. All five progress steps reached; response heading changed to “Response recorded.” No Gemini generation requests were made.
- Vercel production deployment `dpl_8rPPDjJPafSfeV9EpnechfWhm78V` reached Ready. The production alias returned HTTP 200 with the updated title and rendered the new homepage. Read-only readiness checks remained configured; no backend settings or billing changed.
- Local screenshots: `output/care-center-homepage.png` (production desktop) and `output/care-center-mobile.png` (local illustrated rehearsal).

## Gemini scene-review addition — September 26, 2026

- Latest live check: the owner corrected the demo code and redeployed. All three production readiness booleans passed. Two explicitly approved requests were made with the same non-sensitive illustrated rehearsal screenshot. The first received a generic provider rejection; after safe error-code reporting was added, the one approved retry returned Google HTTP 503 `UNAVAILABLE`. No model result was fabricated, and no successful analysis or accuracy claim is made. Billing stayed unchanged; no further requests were attempted.
- The fixture contains preset boxes and labels. These requests were connectivity checks only, not a spill-detection benchmark. Google project logs were disabled and required billing; logging was not enabled. The account's Usage page still displayed Free tier.
- Added allowlisted provider error reporting and a service-unavailable-specific explanation; 43 local tests pass. No raw provider messages or key identifiers are returned to the browser.

- Earlier activation follow-up (resolved): Vercel confirmed all three required Production variables were saved. Safe readiness diagnostics initially returned `demoAccessCodeValid: false`. The owner subsequently corrected the code, as recorded above. Secret values were not retrieved for that diagnosis.
- Added a regression test for boolean-only readiness diagnostics; all 41 tests passed. Production build and deployment `dpl_zjMT9cRA1jeYjtU4gwPNfEdvx8iW` succeeded. Billing unchanged.

- All 40 automated tests passed: 21 existing care-workflow tests, 8 scene/response tests, and 11 server-handler tests with mocked Google responses. No external API calls or paid requests were used.
- TypeScript check and Vite production build passed. Non-failing build warnings: Lucide `use client` directives and a client bundle slightly above 500 kB.
- Before activation, local and production `/api/gemini` returned `configured: false` without revealing credentials. Initial production configuration inspection found only the existing Supabase frontend variables.
- Browser rehearsal verified: explicit authored-source labels, candidate-hazard record, busy closest caregiver excluded, no-available-caregiver state, acknowledgment distinct from arrival, resolution requiring a specific note, four retained events, and no external-notification claim.
- Responsive scene-review check: 390-pixel requested viewport, 375-pixel content viewport and matching content width, no horizontal overflow. Local PNG selection/decoding/resize was exercised with an authored illustration; it was not sent to Google. Staged-video frame capture still needs a supplied video test.
- The owner switched Google accounts; AI Studio then displayed a usable default project marked Free tier. With explicit approval, its existing key was saved as a Vercel Production Secret and `GEMINI_FREE_TIER_CONFIRMED=true` was saved as configuration. No billing was enabled. The configuration blocker is resolved; the latest provider response is recorded above.
- No successful live scene analysis, model accuracy, or summary generation is claimed. See `gemini-setup.md`. The UI permits explicit analysis requests and displays failures without substituting rehearsal data.

## Local checks

- All 21 workflow tests passed, including consent withdrawal during support.
- TypeScript check and Vite production build passed.
- Dependency audit at installation: zero reported vulnerabilities (not a guarantee of security).
- Desktop browser flow verified: required helper absent blocks Begin; helper present enables it; acknowledgment does not enable Resume; arrival plus resolution still needs explicit Resume; support loss pauses; closing the handoff preserves three unresolved support items.
- Handoff text download verified on disk, including unresolved second-helper presence, coverage, and support-change concerns. The browser automation download-event listener timed out, but the actual file downloaded successfully and its content was read.
- Dialog keyboard focus wraps inside the new-session modal with Shift+Tab.
- Production site rendered at a 390-pixel requested mobile viewport (375-pixel content viewport after scrollbar); content and viewport widths matched, with no horizontal overflow. Refusal ended the routine and disabled further preparation controls.
- Found and corrected a progress-indicator issue: a declined routine must not visually mark preparation/support as completed. Local handoff closure is now distinguished from a cloud save.

## Supabase

- Connected the existing empty `Steadyside` project selected in the user's Chrome tab.
- Applied `create_private_demo_care_sessions` migration successfully.
- Supabase security advisor returned no lints after the initial migration. This is not a comprehensive security audit.
- Read-only catalog query confirmed enabled/forced RLS, four ownership policies, and no unauthenticated SELECT privilege. An unauthenticated Data API request returned HTTP 401 / permission denied, as expected; no privileges were relaxed to silence that response.
- Guest sign-in enablement: awaiting user approval. Live Auth/Data API isolation tests have not yet run.

## Deployment

- Public repository: https://github.com/jiexiY/steadyside
- Production alias: https://steadyside.vercel.app
- Initial commit `5d8f109` deployed Ready through the GitHub integration; GitHub Actions Verify passed: https://github.com/jiexiY/steadyside/actions/runs/36216570915
- Production HTTP 200 and CSP header verified. Live page rendered and was interactive in Chrome.
- No real patient data, AI calls, paid provider generation, or Devpost submission was used for the initial deployment checks. The later Gemini connectivity attempts are recorded separately above.

## Manual acceptance cases

1. Complete room checks but leave the required helper absent: Begin remains disabled.
2. Confirm helper presence and coverage, then consent: Begin becomes available.
3. Record request → acknowledgment: Resume stays disabled; arrival is not assumed.
4. Record arrival → human resolution: Resume still requires its own action.
5. Simulate missing support: workflow pauses, required confirmations reset, concern persists.
6. Confirm supported exit with open concerns: handoff carries those concerns forward.
7. Decline before starting; withdraw consent during support; neither permits unwanted continuation.
8. Save to Supabase, reload, and select from history: state and timeline survive.
9. A separate identity cannot read, update, delete, or claim the first identity's rows.
10. A stale revision cannot overwrite the current record.
