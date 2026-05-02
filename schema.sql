-- Run this once to create the bft3_sessions table
-- in whichever database your n8n MySQL credential points to

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
