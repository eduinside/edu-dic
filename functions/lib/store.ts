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

// 항목 전체를 읽고-덮어쓰면 simplify·related·image가 동시에 끝날 때 서로의 필드를 지운다.
// 바꿀 필드만 D1(SQLite JSON1) json_set/json_remove로 갱신한다. 행이 없으면 아무 일도 안 한다.
// path 예: "$.related", "$.homographs[2].easySenses"
export async function patchCachedEntry(
  env: Env,
  word: string,
  sets: [path: string, value: unknown][],
  removes: string[] = [],
): Promise<void> {
  if (sets.length === 0 && removes.length === 0) return;
  let expr = "entry";
  const binds: unknown[] = [];
  if (sets.length > 0) {
    expr = `json_set(${expr}${", ?, json(?)".repeat(sets.length)})`;
    for (const [path, value] of sets) binds.push(path, JSON.stringify(value ?? null));
  }
  if (removes.length > 0) {
    expr = `json_remove(${expr}${", ?".repeat(removes.length)})`;
    binds.push(...removes);
  }
  await env.DB
    .prepare(`UPDATE edudic_dict_cache SET entry = ${expr} WHERE word = ?`)
    .bind(...binds, word)
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

// 자동완성은 글자마다 호출되는데, 매번 D1에서 1,000행 + 30일 집계를 읽으면 느리고 읽기 한도도 갉아먹는다.
// isolate 메모리에 5분 보관한다(새로 찾은 낱말이 자동완성에 늦게 뜨는 정도는 괜찮다).
const POOL_TTL_MS = 5 * 60 * 1000;
let poolCache: { at: number; cached: string[]; popular: string[] } | null = null;

export async function getWordPool(env: Env): Promise<{ cached: string[]; popular: string[] }> {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL_MS) return poolCache;
  const [cached, popular] = await Promise.all([
    getCachedWords(env, 1000).catch(() => [] as string[]),
    getPopular(env, 50).catch(() => [] as string[]),
  ]);
  poolCache = { at: Date.now(), cached, popular };
  return poolCache;
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

