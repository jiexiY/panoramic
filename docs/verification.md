# Verification record

## Local checks

- Initial 20 workflow tests passed; consent-withdrawal coverage added afterward and awaiting the final rerun.
- Initial TypeScript check and Vite production build passed.
- Dependency audit at installation: zero reported vulnerabilities (not a guarantee of security).
- Desktop and mobile browser verification: in progress.

## Supabase

- Connected the existing empty `Steadyside` project selected in the user's Chrome tab.
- Applied `create_private_demo_care_sessions` migration successfully.
- Supabase security advisor returned no lints after the initial migration. This is not a comprehensive security audit.
- Guest sign-in enablement: awaiting user approval. Live Auth/Data API isolation tests have not yet run.

## Deployment

New GitHub repository and Vercel deployment: in progress. No production success is claimed by this draft record.

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
