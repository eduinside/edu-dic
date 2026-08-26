import { json, type Env } from "../_shared.ts";
import { getPopular } from "../lib/store.ts";

// GET /api/popular — 전역 인기 낱말 상위 N개(익명 집계, 계획서 §1.3).
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const words = await getPopular(env, 12);
  return json({ words });
};
