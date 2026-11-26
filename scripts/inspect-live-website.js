import puppeteer from 'puppeteer-core';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\Abhishek\\.gemini\\antigravity\\brain\\3ce27e68-2b43-425c-b506-f5deea6d9407';

async function inspectLiveWebsite() {
  console.log('================================================================');
  console.log('🌐 LIVE WEBSITE INSPECTION: https://www.intellicoretechnologies.in');
  console.log('================================================================\n');

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: EDGE_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`));
    page.on('pageerror', err => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

    console.log('Navigating to https://www.intellicoretechnologies.in ...');
    const response = await page.goto('https://www.intellicoretechnologies.in', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log(`HTTP Status: ${response.status()}`);
    console.log(`Final URL:   ${page.url()}`);
    console.log(`Page Title:  "${await page.title()}"`);

    // Capture screenshot
    await page.screenshot({ path: `${ARTIFACT_DIR}/live_website_public.png` });
    console.log(`Screenshot saved to ${ARTIFACT_DIR}/live_website_public.png`);

    console.log('\nConsole Logs from Live Website:');
    if (consoleLogs.length === 0) {
      console.log('  (Clean: 0 console errors)');
    } else {
      consoleLogs.forEach(l => console.log('  ' + l));
    }

  } catch (err) {
    console.error('Inspection failed:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

inspectLiveWebsite();
