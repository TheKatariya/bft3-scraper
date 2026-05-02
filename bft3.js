require('dotenv').config();
const { chromium } = require('playwright');

const log = msg => process.stderr.write(msg + '\n');

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const dateStr = `${yyyy}-${mm}-${dd}`;

function msToSec(ms) {
  if (ms == null) return null;
  return Math.floor(ms / 1000);
}

function medalLabel(medal) {
  const map = { 1: 'Gold', 2: 'Silver', 3: 'Bronze', 4: 'None' };
  return map[medal] ?? '';
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  // Capture the initial sessions summary (one row per session class).
  // Clicking a session row re-calls the same endpoint with per-member rows —
  // we handle those separately with waitForResponse per click.
  let sessionList = [];
  page.on('response', async (response) => {
    if (!response.url().includes('get-sessions')) return;
    try {
      const data = await response.json();
      const rows = data?.data ?? [];
      if (rows.length > 0 && sessionList.length === 0) {
        sessionList = rows;
        log(`Session list captured: ${rows.length} session(s)`);
      }
    } catch (e) {}
  });

  // --- Login ---
  log('Logging in...');
  await page.goto('https://admin.bodyfittraining.com/login');
  await page.fill('input[name="email"]', process.env.BFT_EMAIL);
  await page.fill('input[name="password"]', process.env.BFT_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  log(`After login URL: ${page.url()}`);

  // --- Navigate to BFT3 sessions page if not already there ---
  if (!page.url().includes('bft-cubed')) {
    log('Navigating to BFT3 sessions page...');
    try {
      await Promise.all([
        page.waitForResponse(r => r.url().includes('get-sessions') && r.status() === 200, { timeout: 20000 }),
        page.goto('https://admin.bodyfittraining.com/bft-cubed/sessions'),
      ]);
    } catch (e) {
      log('Navigation timeout — proceeding with captured data...');
    }
  } else {
    log(`Already on BFT3 page: ${page.url()}`);
  }
  await page.waitForTimeout(2000);

  if (sessionList.length === 0) {
    log('No sessions found for today.');
    console.log(JSON.stringify([]));
    await browser.close();
    return;
  }

  // --- Click each session row and capture the per-member API response ---
  log(`Clicking ${sessionList.length} session row(s) to load member data...`);

  const rows = await page.$$('table tbody tr');
  log(`Found ${rows.length} table row(s)`);

  const memberDataBySession = new Map();

  for (let i = 0; i < sessionList.length; i++) {
    const session = sessionList[i];
    if (i >= rows.length) {
      log(`No DOM row for session index ${i}, skipping`);
      continue;
    }
    try {
      log(`Clicking row ${i + 1}: ${session.session_title} (${session.session_id})`);
      const responsePromise = page.waitForResponse(
        r => r.url().includes('get-sessions') && r.status() === 200,
        { timeout: 15000 }
      );
      await rows[i].click();
      const response = await responsePromise;
      const data = await response.json();
      const memberRows = data?.data ?? [];
      memberDataBySession.set(session.session_id, memberRows);
      log(`  → ${memberRows.length} member record(s)`);
    } catch (e) {
      log(`  Error clicking row ${i + 1}: ${e.message}`);
      memberDataBySession.set(session.session_id, []);
    }
    await page.waitForTimeout(500);
  }

  // --- Build output rows ---
  const outputRows = [];

  for (const session of sessionList) {
    const sessionStart = session.local_start_time
      ? new Date(session.local_start_time)
      : new Date(session.start_time);
    const sessionDate = sessionStart.toISOString().split('T')[0];
    const sessionTime = sessionStart.toTimeString().split(' ')[0];
    const members = memberDataBySession.get(session.session_id) ?? [];

    for (const m of members) {
      outputRows.push({
        session_id:         session.session_id,
        session_title:      session.session_title,
        session_date:       sessionDate,
        session_start_time: sessionTime,
        session_length:     msToSec(session.total_time),
        target_pxi:         session.target_pxi,
        record_id:          m.id,
        member_name:        m.member_name,
        member_id:          m.member_id,
        sensor_id:          m.sensor_id ?? null,
        pxi:                m.pxi,
        avg_hr_percent:     m.avg_percent ?? null,
        max_hr:             m.max_hr ?? null,
        member_max_hr:      m.member_max_hr ?? null,
        calories:           m.calories != null ? parseFloat(parseFloat(m.calories).toFixed(2)) : null,
        medal:              medalLabel(m.medal),
        duration:           msToSec(m.total_time),
        zone0_time:         msToSec(m.zone_times?.zone0 ?? null),
        zone1_time:         msToSec(m.zone_times?.zone1 ?? null),
        zone2_time:         msToSec(m.zone_times?.zone2 ?? null),
        zone3_time:         msToSec(m.zone_times?.zone3 ?? null),
        zone4_time:         msToSec(m.zone_times?.zone4 ?? null),
        zone5_time:         msToSec(m.zone_times?.zone5 ?? null),
        type:               m.type ?? null,
      });
    }
  }

  log(`\nDone. ${outputRows.length} total record(s) across ${sessionList.length} session(s).`);
  console.log(JSON.stringify(outputRows));
  await browser.close();
}

run().catch(err => {
  process.stderr.write('ERROR: ' + err.message + '\n');
  process.exit(1);
});
