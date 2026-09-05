CREATE TABLE auth_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  session_expires_in INTEGER NOT NULL CHECK(session_expires_in BETWEEN 3600 AND 2592000),
  otp_expires_in INTEGER NOT NULL CHECK(otp_expires_in BETWEEN 60 AND 1800),
  rate_limit_window INTEGER NOT NULL CHECK(rate_limit_window BETWEEN 10 AND 3600),
  rate_limit_max INTEGER NOT NULL CHECK(rate_limit_max BETWEEN 5 AND 1000),
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES user(id) ON DELETE SET NULL
);

INSERT INTO auth_settings(id,session_expires_in,otp_expires_in,rate_limit_window,rate_limit_max,updated_at)
VALUES(1,604800,300,60,60,CAST(strftime('%s','now') AS INTEGER) * 1000);
