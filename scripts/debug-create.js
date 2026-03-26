const fs = require('fs');
require('dotenv').config({ path: 'environments/.env.staging' });
require('dotenv').config({ path: '.env' });

const authState = JSON.parse(fs.readFileSync('playwright/.auth/staging-user.json', 'utf-8'));
const idToken = authState.cookies.find(c => c.name.includes('idToken')).value;
const API = process.env.API_BASE_URL;

const payload = {
  name: 'QA-Test-' + Date.now(),
  description: 'test',
  step: {
    trigger: {
      iCalendarDefinition: 'DTSTART:20260401T060000Z\nRRULE:BYHOUR=6;BYMINUTE=0;FREQ=DAILY',
    },
    process: {
      endpoint: 'https://example.com/qa-noop',
      apiKey: 'qa-test-key',
      timeoutSeconds: 30,
    },
    action: [{ type: 'HOME_PAGE', schedule: { mode: 'IMMEDIATE' } }],
  },
  audience: { users: [], groups: [] },
};

console.log('Payload:', JSON.stringify(payload, null, 2));

fetch(API + '/v1/scheduled-jobs', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
}).then(async (r) => {
  console.log('Status:', r.status);
  const body = await r.json();
  console.log('Body:', JSON.stringify(body, null, 2));

  // Cleanup: delete the created job
  if (r.status === 201 && body.id) {
    console.log('\nDeleting job:', body.id);
    const delRes = await fetch(API + '/v1/scheduled-jobs/' + body.id, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
    });
    console.log('Delete status:', delRes.status);
    if (delRes.status !== 204) {
      console.log('Delete body:', JSON.stringify(await delRes.json().catch(() => null), null, 2));
    }
  }
}).catch(e => console.error(e));
