-- 어린이 쉬운 사전 런타임 테이블 — 공유 D1 'edu-link-db'에 edudic_ 접두어로 둔다(계획서 D12).
-- edu-link의 wrangler d1 migrations(공유 d1_migrations 트래킹)와 충돌하지 않도록
-- CREATE TABLE IF NOT EXISTS 로 멱등 적용한다(edu-kit db/schema.sql와 동일 관례):
--   로컬:  npm run db:local     (wrangler d1 execute edu-link-db --local  --file=db/schema.sql)
--   운영:  npm run db:remote    (wrangler d1 execute edu-link-db --remote --file=db/schema.sql)

-- 사전 캐시(온디맨드 성장). krdict 정규화 결과(DictEntry JSON)를 낱말별로 저장.
CREATE TABLE IF NOT EXISTS edudic_dict_cache (
  word       TEXT PRIMARY KEY,
  entry      TEXT NOT NULL,               -- 정규화 DictEntry(JSON 문자열)
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 자주 찾는 낱말(전역 익명 집계) — "최근 30일 동안 다른 사용자들이 많이 찾은 낱말 순"(D23) 요구를
-- 정확히 만족하려고 날짜별 버킷으로 저장한다. 조회 시 최근 30일 합계로만 랭킹을 매긴다.
-- 낱말·날짜·횟수만 저장 — 개인 식별 정보 저장 금지.
CREATE TABLE IF NOT EXISTS edudic_popular_daily (
  word  TEXT NOT NULL,
  day   TEXT NOT NULL,                    -- 'YYYY-MM-DD'(UTC)
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (word, day)
);

-- 최근 30일 랭킹 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_edudic_popular_daily_day ON edudic_popular_daily (day);

-- (선택) 오래된 버킷 정리는 주기 작업으로:
--   DELETE FROM edudic_popular_daily WHERE day < date('now','-30 day');
