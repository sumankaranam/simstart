CREATE TABLE funds (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  refresh_slot INTEGER NOT NULL UNIQUE CHECK(refresh_slot BETWEEN 0 AND 19),
  source TEXT NOT NULL DEFAULT 'MFapi.in',
  source_url TEXT NOT NULL,
  history_json TEXT,
  first_date TEXT,
  last_date TEXT,
  observation_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT,
  checked_at TEXT,
  last_error TEXT,
  CHECK (history_json IS NULL OR length(history_json) <= 1000000)
);
CREATE TABLE sync_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  outcome TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX sync_events_checked ON sync_events(checked_at);
