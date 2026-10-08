import { json, type Env } from "../_shared.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { getOrFetchEntry } from "../lib/dictionary.ts";

// GET /api/image?q=낱말 — /api/lookup?defer=1 이 비워 둔 사진(imagePending)을 채워 돌려준다(docs/perf-plan.md §2.2).
// 동음이의어가 있으면 대기 중인 것을 모두 병렬로 채운다. 대기 표시가 없으면 캐시 값을 그대로 준다.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || isBlocked(q)) return json({ status: "not_found" });

  const entry = await getOrFetchEntry(env, q, { waitUntil }).catch(() => null);
  if (!entry) return json({ status: "not_found" });

  return json({
    status: "ok",
    image: entry.image ?? null,
    homographImages: entry.homographs && entry.homographs.length > 1 ? entry.homographs.map((hg) => hg.image ?? null) : null,
  });
};
