// Opt-in deployment gate. Ordinary builds never spend provider quota.
// Run where the existing secrets already live; never export or log them.
const mode = process.env.PANORAMIC_VERIFY_GEMINI;
if (mode === 'candidate' || mode === 'production') {
  try {
    if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_DEMO_ACCESS_CODE || process.env.GEMINI_FREE_TIER_CONFIRMED !== 'true') {
      throw new Error('Private Gemini settings or free-tier confirmation are missing in the build environment.');
    }
    const { createGeminiHandler } = await import('../server/gemini.ts');
    const body = {
      operation: 'demo_assistant', nonSensitiveConfirmed: true, room: 'A101',
      question: 'What still needs a response? Answer in one concise paragraph with evidence.',
      snapshot: { room: 'A101', records: [{
        id: 'a101-bathroom-tracking-demo', room: 'A101', zone: 'Bathroom', version: 1,
        summary: JSON.stringify({ status: 'Awaiting assignment', brief: 'Synthetic demonstration: possible water on the bathroom floor crosses a human-marked route. Staff inspection required.', priority: 'high', assignee: 'Nobody assigned', outcome: 'Not recorded' }),
        events: [],
      }], responders: [{ name: 'Caregiver 01', available: true }] },
    };
    // Fixed application origin: the access code must never reach an arbitrary URL.
    const request = new Request('https://panoramic-app.vercel.app/api/gemini', {
      method: 'POST', signal: AbortSignal.timeout(45_000), headers: {
        'Content-Type': 'application/json', 'x-demo-access-code': process.env.GEMINI_DEMO_ACCESS_CODE,
      }, body: JSON.stringify(body),
    });
    const started = Date.now();
    const response = mode === 'candidate'
      ? await createGeminiHandler()(request, process.env)
      : await fetch(request);
    const result = await response.json();
    const cited = Array.isArray(result.paragraphs) && result.paragraphs.length > 0 && result.paragraphs.every(p =>
      typeof p.text === 'string' && p.text.trim() && p.sourceIds?.length > 0 && p.sourceIds.every(id => result.sources?.some(s => s.id === id)));
    const ok = response.ok && result.source === 'gemini' && cited && result.action?.kind === 'none';
    // Only bounded synthetic answer data and metadata. No raw provider responses.
    console.log(JSON.stringify({ geminiVerification: mode, ok, httpStatus: response.status,
      elapsedMs: Date.now() - started, model: result.model, citedParagraphs: ok ? result.paragraphs.length : 0,
      answer: ok ? result.paragraphs.map(p => p.text).join('\n') : undefined,
      error: !ok && typeof result.error === 'string' ? result.error : undefined }));
    if (!ok) process.exitCode = 1;
  } catch {
    console.error('Gemini live verification failed or timed out. Secrets and raw diagnostics suppressed. Deployment stopped.');
    process.exitCode = 1;
  }
}
