# Verification record

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
- No real patient data, AI calls, paid provider generation, or Devpost submission used for these checks.

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
