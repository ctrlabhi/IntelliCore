import https from 'node:https';

function probe(urlPath, method = 'GET') {
  return new Promise((resolve) => {
    const url = `https://intellicore-six.vercel.app${urlPath}`;
    const req = https.request(url, { method, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          url,
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', (err) => {
      resolve({ url, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ url, error: 'Request Timed Out (15s)' });
    });
    req.end();
  });
}

async function runSecurityProbes() {
  console.log('================================================================');
  console.log('🔒 SECURITY & AUTHORIZATION PROBES: https://intellicore-six.vercel.app');
  console.log('================================================================');

  const tests = [
    { path: '/api/v1/auth/me', expected: 401, desc: 'Unauthorized protected endpoint (/api/v1/auth/me)' },
    { path: '/api/v1/users', expected: 401, desc: 'Unauthorized administrative endpoint (/api/v1/users)' },
    { path: '/.env', expected: 403, desc: 'Sensitive file guard (/.env)' },
    { path: '/prisma/schema.prisma', expected: 403, desc: 'Prisma schema guard (/prisma/schema.prisma)' }
  ];

  for (const t of tests) {
    console.log(`\nTesting ${t.desc}...`);
    const res = await probe(t.path);
    if (res.error) {
      console.log(`❌ Error: ${res.error}`);
    } else {
      const pass = res.status === t.expected;
      console.log(`${pass ? '✅' : '❌'} HTTP ${res.status} (Expected: ${t.expected})`);
      try {
        const json = JSON.parse(res.body);
        console.log('Response JSON:', JSON.stringify(json, null, 2));
      } catch {
        console.log('Response Text:', res.body.substring(0, 150));
      }
    }
  }
}

runSecurityProbes();
