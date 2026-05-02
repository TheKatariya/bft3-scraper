# bft3-scraper

Nightly scraper for BFT³ (BFT Cubed) session and member data. Uses Playwright to authenticate into `admin.bodyfittraining.com`, navigate the sessions SPA, and capture per-member performance data. Outputs either a JSON array to stdout (for n8n ingestion) or a CSV file (for standalone use).

## How it works

The BFT admin portal is a Vue.js SPA — member data is only loaded when you click a session row in the UI. The scraper:

1. Logs in via Playwright (headless Chromium)
2. Intercepts the `/bft-cubed/get-sessions/v3` API response on page load to capture today's session list
3. Clicks each session row and waits for the per-member API response
4. Outputs all records in one shot

Progress/debug messages go to `stderr`. Final output goes to `stdout`.

## Setup

```bash
cp .env.example .env
# Fill in BFT_EMAIL and BFT_PASSWORD
```

## Docker

### Build

```bash
docker build -t bft3-scraper .
```

### Run (JSON mode — default, for n8n/scripting)

```bash
docker run --rm --env-file .env bft3-scraper
```

stdout is a JSON array of member session records. stderr shows progress.

### Standalone usage (CSV, no n8n needed)

```bash
docker run --rm \
  --env-file .env \
  -e OUTPUT_MODE=csv \
  -v $(pwd)/output:/app/output \
  bft3-scraper
```

Writes `./output/bft3sessions-YYYY-MM-DD.csv` on your host. The output directory is created automatically inside the container.

## n8n integration

The `bft3-nightly-ingest` workflow runs at 23:30 nightly:

1. **Schedule Trigger** — `30 23 * * *`
2. **SSH node** — `docker run --rm --env-file /home/pkatariya/bft3-scraper/.env bft3-scraper`
3. **Code node** — parses stdout JSON into items
4. **IF node** — stops if array is empty
5. **MySQL node** — `INSERT IGNORE` into `bft3_sessions` on `record_id`

## Output fields

| Field | Type | Description |
|---|---|---|
| `session_id` | string | BFT session class ID |
| `session_title` | string | Session name (e.g. "BFT3 45 Min") |
| `session_date` | string | YYYY-MM-DD |
| `session_start_time` | string | HH:MM:SS |
| `session_length` | int | Session length in seconds |
| `target_pxi` | int | Target PXI for the session |
| `record_id` | string | Unique member-session record ID (dedup key) |
| `member_name` | string | Member full name |
| `member_id` | string | Member ID |
| `sensor_id` | string | HR sensor/device ID |
| `pxi` | int | Member's PXI score |
| `avg_hr_percent` | float | Average HR as % of max |
| `max_hr` | int | Peak HR during session |
| `member_max_hr` | int | Member's recorded max HR |
| `calories` | float | Calories burned |
| `medal` | string | Gold / Silver / Bronze / None |
| `duration` | int | Active time in seconds |
| `zone0_time`–`zone5_time` | int | Seconds spent in each HR zone |
| `type` | string | Record type |

## MySQL table

```sql
CREATE TABLE IF NOT EXISTS bft3_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(100),
  session_title VARCHAR(255),
  session_date DATE,
  session_start_time TIME,
  session_length INT,
  target_pxi INT,
  record_id VARCHAR(100) UNIQUE,
  member_name VARCHAR(255),
  member_id VARCHAR(100),
  sensor_id VARCHAR(100),
  pxi INT,
  avg_hr_percent FLOAT,
  max_hr INT,
  member_max_hr INT,
  calories FLOAT,
  medal VARCHAR(20),
  duration INT,
  zone0_time INT,
  zone1_time INT,
  zone2_time INT,
  zone3_time INT,
  zone4_time INT,
  zone5_time INT,
  type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

All time values are in **seconds**. `record_id` is the deduplication key — re-runs won't create duplicates.
