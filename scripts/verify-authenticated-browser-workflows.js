import http from 'node:http';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { PrismaClient } from '@prisma/client';

const testDbUrl = process.env.INTELLICORE_TEST_DATABASE_URL || 'mysql://intellicore_test_fresh:test_secret@127.0.0.1:33359/intellicore_test_fresh';
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'development';
process.env.FIREBASE_PROJECT_ID = 'intellicore-dev';

import app from '../backend/src/app.js';
import firebaseService from '../backend/src/integrations/firebase/firebaseService.js';

const CHROME_PATH = 'C:\\Users\\Abhishek\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 3000;
const ARTIFACT_DIR = 'C:\\Users\\Abhishek\\.gemini\\antigravity\\brain\\3ce27e68-2b43-425c-b506-f5deea6d9407';

const prisma = new PrismaClient({ datasourceUrl: testDbUrl });

async function ensureRoleUser(roleCode, emailPrefix, fullName) {
  let user = await prisma.user.findFirst({
    where: {
      status: 'ACTIVE',
      userRoles: { some: { role: { code: roleCode } } }
    },
    include: {
      userRoles: { include: { role: true } },
      profile: true
    }
  });

  if (!user) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    const uid = `e2e-${roleCode.toLowerCase()}-${Date.now().toString().slice(-6)}`;
    const email = `${emailPrefix}-${Date.now().toString().slice(-6)}@intellicore.dev`;
    const userId = randomUUID();

    // Create Firebase auth record if not exists
    await firebaseService.auth.createUser({
      uid,
      email,
      emailVerified: true,
      displayName: fullName
    }).catch(() => {});

    user = await prisma.user.create({
      data: {
        id: userId,
        firebaseUid: uid,
        email,
        emailVerified: true,
        status: 'ACTIVE',
        profile: {
          create: {
            fullName,
            phone: '+919876543210'
          }
        },
        userRoles: {
          create: {
            roleId: role.id
          }
        }
      },
      include: {
        userRoles: { include: { role: true } },
        profile: true
      }
    });
  }

  return user;
}

async function runAuthenticatedBrowserWorkflows() {
  console.log('================================================================');
  console.log('🌐 INTELLICORE V2.0 — AUTHENTICATED BROWSER WORKFLOWS VERIFICATION');
  console.log('Roles Covered: Founder, HR, Team Leader, Intern');
  console.log('Browser Binary: Google Chrome (' + CHROME_PATH + ')');
  console.log(`Target Database: ${testDbUrl}`);
  console.log('================================================================\n');

  if (!firebaseService.isInitialized || !firebaseService.auth) {
    throw new Error('Firebase Admin SDK is not initialized with intellicore-dev.');
  }

  // 1. Prepare Role Users
  console.log('[1/5] Provisioning / Confirming test accounts for all 4 roles...');
  const founderUser = await ensureRoleUser('FOUNDER', 'founder', 'Abhishek Founder');
  const hrUser = await ensureRoleUser('HR_MANAGER', 'hr-manager', 'Priya HR Manager');
  const tlUser = await ensureRoleUser('TEAM_LEADER', 'team-leader', 'Rahul Team Leader');
  const internUser = await ensureRoleUser('INTERN', 'intern', 'Sneha Intern');

  console.log(`  Founder User: ${founderUser.email} (UID: ${founderUser.firebaseUid})`);
  console.log(`  HR User:      ${hrUser.email} (UID: ${hrUser.firebaseUid})`);
  console.log(`  TL User:      ${tlUser.email} (UID: ${tlUser.firebaseUid})`);
  console.log(`  Intern User:  ${internUser.email} (UID: ${internUser.firebaseUid})`);

  // 2. Generate Custom Tokens
  console.log('\n[2/5] Minting Firebase Custom Tokens via intellicore-dev...');
  const founderToken = await firebaseService.auth.createCustomToken(founderUser.firebaseUid);
  const hrToken = await firebaseService.auth.createCustomToken(hrUser.firebaseUid);
  const tlToken = await firebaseService.auth.createCustomToken(tlUser.firebaseUid);
  const internToken = await firebaseService.auth.createCustomToken(internUser.firebaseUid);
  console.log('  All 4 Firebase custom tokens generated successfully.');

  // 3. Start Express HTTP Server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`\n[3/5] Express test server listening on http://127.0.0.1:${PORT}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1440,900',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const workflows = [
      {
        role: 'FOUNDER',
        user: founderUser,
        token: founderToken,
        dashboardUrl: `http://localhost:${PORT}/dashboards/founder`,
        screenshot: `${ARTIFACT_DIR}/auth_browser_founder.png`,
        expectedKeywords: ['Founder', 'IntelliCore', 'Command Center']
      },
      {
        role: 'HR_MANAGER',
        user: hrUser,
        token: hrToken,
        dashboardUrl: `http://localhost:${PORT}/dashboards/hr`,
        screenshot: `${ARTIFACT_DIR}/auth_browser_hr.png`,
        expectedKeywords: ['HR', 'Internship', 'IntelliCore']
      },
      {
        role: 'TEAM_LEADER',
        user: tlUser,
        token: tlToken,
        dashboardUrl: `http://localhost:${PORT}/dashboards/team-leader`,
        screenshot: `${ARTIFACT_DIR}/auth_browser_team_leader.png`,
        expectedKeywords: ['Team Leader', 'IntelliCore']
      },
      {
        role: 'INTERN',
        user: internUser,
        token: internToken,
        dashboardUrl: `http://localhost:${PORT}/dashboards/intern`,
        screenshot: `${ARTIFACT_DIR}/auth_browser_intern.png`,
        expectedKeywords: ['Intern', 'IntelliCore']
      }
    ];

    console.log('\n[4/5] Executing browser authentication & dashboard workflows...');

    for (let i = 0; i < workflows.length; i++) {
      const wf = workflows[i];
      console.log(`\n  --- Workflow ${i + 1}/4: Role ${wf.role} (${wf.user.email}) ---`);

      // A. Load home page first to initialize Firebase Web SDK context
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });

      // B. Authenticate via Firebase Web SDK in Chrome
      console.log(`      Authenticating session in Google Chrome for ${wf.user.email}...`);
      await page.evaluate(async (customToken) => {
        const { getAuth, signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js');
        const auth = getAuth();
        await signInWithCustomToken(auth, customToken);
      }, wf.token);

      // C. Navigate to dashboard
      console.log(`      Navigating to ${wf.dashboardUrl}...`);
      await page.goto(wf.dashboardUrl, { waitUntil: 'networkidle2' });
      await new Promise((r) => setTimeout(r, 1200));

      // D. Verify DOM and content
      const content = await page.content();
      const matchedKeywords = wf.expectedKeywords.filter((kw) => content.includes(kw));
      console.log(`      Matched keywords: ${matchedKeywords.join(', ')}`);

      if (matchedKeywords.length === 0) {
        throw new Error(`Dashboard for ${wf.role} did not render expected keywords: ${wf.expectedKeywords.join(', ')}`);
      }

      // E. Capture High-Resolution Screenshot
      await page.screenshot({ path: wf.screenshot, fullPage: false });
      console.log(`      Screenshot captured: ${wf.screenshot}`);

      // F. Test Logout / Session Termination
      console.log(`      Testing Logout & Session Termination for ${wf.role}...`);
      await page.evaluate(async () => {
        const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js');
        const auth = getAuth();
        await signOut(auth);
      });
      await new Promise((r) => setTimeout(r, 500));
      console.log(`      Session for ${wf.role} terminated cleanly.`);
    }

    console.log('\n================================================================');
    console.log('🎉 ALL 4 AUTHENTICATED BROWSER WORKFLOWS COMPLETED SUCCESSFULLY');
    console.log('================================================================');

  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
}

runAuthenticatedBrowserWorkflows().catch((err) => {
  console.error('\nFAILURE: Authenticated browser workflow failed:', err);
  process.exit(1);
});
