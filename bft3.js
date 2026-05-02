require('dotenv').config();
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');

const BASE_URL = 'https://admin.bodyfittraining.com';

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const dateStr = `${yyyy}-${mm}-${dd}`;

const jar = new CookieJar();
const client = wrapper(axios.create({
  jar,
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
}));

async function getCsrfToken() {
  console.error('Fetching login page for CSRF token...');
  const res = await client.get('/login');
  const $ = cheerio.load(res.data);
  const token = $('input[name="_token"]').val();
  if (!token) throw new Error('Could not find CSRF token on login page');
  console.error('Got CSRF token.');
  return token;
}

async function login(csrfToken) {
  console.error('Logging in...');
  const params = new URLSearchParams();
  params.append('_token', csrfToken);
  params.append('email', process.env.BFT_EMAIL);
  params.append('password', process.env.BFT_PASSWORD);
  params.append('urlHash', '');

  const res = await client.post('/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    maxRedirects: 5,
  });

  if (res.request.res.responseUrl?.includes('/login')) {
    throw new Error('Login failed — check credentials in .env file');
  }
  console.error('Login successful.');
}

async function fetchSessions() {
  console.error("Fetching today's sessions...");
  const params = new URLSearchParams({
    page: '1',
    perPage: '100',
    'filters[type]': '"studio"',
    'filters[when]': '"today"',
    'filters[date]': JSON.stringify({ startDate: dateStr, endDate: dateStr }),
    'filters[session_length]': '900000',
    'filters[medals]': '[]',
    'filters[member_pxi]': '[0,250]',
    'filters[target_pxi]': '[0,220]',
    'filters[franchisees]': '[]',
  });

  const res = await client.get(`/bft-cubed/get-sessions/v3?${params}`);
  const sessions = res.data?.data ?? [];
  console.error(`Found ${sessions.length} session class(es).`);
  return sessions;
}

async function fetchMembers(sessionId) {
  const res = await client.get(`/bft-cubed/get-session-members/v3?session_id=${sessionId}`);
  return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
}

function msToSec(ms) {
  if (ms == null) return null;
  return Math.floor(ms / 1000);
}

function medalLabel(medal) {
  const map = { 1: 'Gold', 2: 'Silver', 3: 'Bronze', 4: 'None' };
  return map[medal] ?? '';
}

async function main() {
  if (!process.env.BFT_EMAIL || !process.env.BFT_PASSWORD) {
    throw new Error('Missing BFT_EMAIL or BFT_PASSWORD in .env file');
  }

  const csrfToken = await getCsrfToken();
  await login(csrfToken);

  const sessions = await fetchSessions();
  if (sessions.length === 0) {
    console.error('No sessions found for today. Exiting.');
    console.log(JSON.stringify([]));
    return;
  }

  const rows = [];

  for (const session of sessions) {
    const sessionStart = session.local_start_time
      ? new Date(session.local_start_time)
      : new Date(session.start_time);
    const sessionDate = sessionStart.toISOString().split('T')[0];
    const sessionTime = sessionStart.toTimeString().split(' ')[0];

    console.error(`Fetching members for: ${session.session_title} @ ${sessionTime} (${session.session_id})...`);
    const members = await fetchMembers(session.session_id);
    console.error(`  → ${members.length} member record(s)`);

    for (const m of members) {
      rows.push({
        session_id:         session.session_id,
        session_title:      session.session_title,
        session_date:       sessionDate,
        session_start_time: sessionTime,
        session_length:     msToSec(session.total_time),
        target_pxi:         session.target_pxi,
        record_id:          m.id,
        member_name:        m.member_name,
        member_id:          m.member_id,
        sensor_id:          m.sensor_id,
        pxi:                m.pxi,
        avg_hr_percent:     m.avg_percent,
        max_hr:             m.max_hr,
        member_max_hr:      m.member_max_hr,
        calories:           m.calories != null ? parseFloat(m.calories.toFixed(2)) : null,
        medal:              medalLabel(m.medal),
        duration:           msToSec(m.length),
        zone0_time:         msToSec(m.zone_times?.zone0),
        zone1_time:         msToSec(m.zone_times?.zone1),
        zone2_time:         msToSec(m.zone_times?.zone2),
        zone3_time:         msToSec(m.zone_times?.zone3),
        zone4_time:         msToSec(m.zone_times?.zone4),
        zone5_time:         msToSec(m.zone_times?.zone5),
        type:               m.type,
      });
    }
  }

  console.error(`\nDone! ${rows.length} member records across ${sessions.length} session(s).`);
  console.log(JSON.stringify(rows));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
