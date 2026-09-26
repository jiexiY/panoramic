// Read-only anonymous access checks. No accounts, records, emails or AI calls.
import assert from 'node:assert/strict';
const url=process.env.VITE_SUPABASE_URL;
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url&&key,'Configure the Supabase URL and publishable key.');
for(const table of ['care_facilities','care_members','care_incidents','care_incident_events']) {
  const response=await fetch(`${url}/rest/v1/${table}?select=*&limit=1`,{headers:{apikey:key}});
  assert.ok([401,403].includes(response.status),`${table}: anonymous access unexpectedly returned ${response.status}`);
  console.log(`${table}: anonymous access denied (${response.status})`);
}
console.log('PASS: read-only anonymous access checks; no credentials printed.');
