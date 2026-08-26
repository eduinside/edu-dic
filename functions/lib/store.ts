// 공유 D1('edu-link-db')의 edudic_ 테이블 접근(계획서 §4.2, D12). 스키마: db/schema.sql
import type { DictEntry } from "../../app/types.ts";
import type { Env } from "../_shared.ts";

export async function getCachedEntry(env: Env, word: string): Promise<DictEntry | null> {
  const row = await env.DB
    .prepare("SELECT entry FROM edudic_dict_cache WHERE word = ?")
    .bind(word)
    .first<{ entry: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.entry) as DictEntry;
  } catch {
    return null;
  }
}

export async function putCachedEntry(env: Env, word: string, entry: DictEntry): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO edudic_dict_cache (word, entry, fetched_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(word) DO UPDATE SET entry = excluded.entry, fetched_at = excluded.fetched_at`,
    )
    .bind(word, JSON.stringify(entry))
    .run();
}

// "자주 찾는 낱말" = 최근 30일 동안 다른 사용자들이 많이 찾은 낱말 순(D23). 오늘 날짜 버킷에 1 더함.
export async function bumpPopular(env: Env, word: string): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO edudic_popular_daily (word, day, count)
       VALUES (?, date('now'), 1)
       ON CONFLICT(word, day) DO UPDATE SET count = count + 1`,
    )
    .bind(word)
    .run();
}

export async function getPopular(env: Env, limit = 12): Promise<string[]> {
  const res = await env.DB
    .prepare(
      `SELECT word, SUM(count) AS total
       FROM edudic_popular_daily
       WHERE day >= date('now', '-30 day')
       GROUP BY word
       ORDER BY total DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ word: string }>();
  return (res.results ?? []).map((r) => r.word);
}

// 자동완성 및 초성 검색용: D1 캐시에 이미 저장된 표제어 목록 조회
export async function getCachedWords(env: Env, limit = 1000): Promise<string[]> {
  try {
    const res = await env.DB
      .prepare(`SELECT word FROM edudic_dict_cache ORDER BY fetched_at DESC LIMIT ?`)
      .bind(limit)
      .all<{ word: string }>();
    return (res.results ?? []).map((r) => r.word);
  } catch {
    return [];
  }
}

