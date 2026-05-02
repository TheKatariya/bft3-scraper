# bft3-scraper

Nightly scraper for BFT³ (BFT Cubed) session and member data. Authenticates into `admin.bodyfittraining.com`, fetches today's studio sessions and each session's member records, and outputs a JSON array to stdout. n8n captures that output and inserts rows into MySQL.

## How it works

1. Scraper authenticates and fetches sessions + member records for today
2. Debug/progress messages go to `stderr`
3. Final JSON array of row objects goes to `stdout`
4. n8n parses stdout, checks for empty array, then batch-inserts into `bft3_sessions`

## Local development

```bash
cp .env.example .env
# Fill in BFT_EMAIL and BFT_PASSWORD in .env

npm install
npm start
```

Stdout will be the JSON array. Stderr will show progress logs.

## Docker

### Build

```bash
docker build -t bft3-scraper .
```

### Run

```bash
docker run --rm \
  --env BFT_EMAIL=your@email.com \
  --env BFT_PASSWORD=yourpassword \
  bft3-scraper
```

Credentials are passed via environment variables at runtime — they are never baked into the image.

### Capture stdout only (JSON)

```bash
docker run --rm \
  --env BFT_EMAIL=your@email.com \
  --env BFT_PASSWORD=yourpassword \
  bft3-scraper 2>/dev/null
```

## n8n integration

The n8n workflow (`bft3-nightly-ingest`) runs nightly at 23:30:

1. **Cron trigger** — `30 23 * * *`
2. **Execute Command** — runs the Docker container with credentials from n8n env vars
3. **Code node** — parses stdout JSON into individual items
4. **If node** — skips if array is empty
5. **MySQL node** — inserts each row into `bft3_sessions` using Execute SQL with INSERT IGNORE on `record_id`

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

See `schema.sql` for the full DDL.

## Data notes

- All time values (`session_length`, `duration`, `zone*_time`) are stored as **integers in seconds**
- `calories` is stored as a float
- `record_id` is unique — re-runs won't create duplicates
- `medal` values: `Gold`, `Silver`, `Bronze`, `None`, or empty string
