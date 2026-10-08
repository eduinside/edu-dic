import { json, type Env } from "../_shared.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { bumpPopular, getCachedEntry, getPopular } from "../lib/store.ts";

// GET /api/popular — 전역 인기 낱말 상위 N개(익명 집계, 계획서 §1.3).
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const words = await getPopular(env, 12);
  return json({ words });
};

// POST /api/popular {word} — 미리 받아 둔(prefetch) 결과를 실제로 열었을 때 한 번 센다.
// 사전 캐시에 있는 낱말만 센다(아무 문자열이나 인기 목록에 올리지 못하게).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json().catch(() => null)) as { word?: unknown } | null;
  const word = typeof body?.word === "string" ? body.word.trim() : "";
  if (!word || word.length > 20 || isBlocked(word)) return json({ ok: false }, { status: 400 });
  const entry = await getCachedEntry(env, word).catch(() => null);
  if (!entry) return json({ ok: false }, { status: 404 });
  await bumpPopular(env, word);
  return json({ ok: true });
};
