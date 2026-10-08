// /api/lookup, /api/simplify, /api/related 가 공유하는 "캐시 우선 조회" 로직.
//
// 우선순위(D3/D4/D20/D24):
//   텍스트: 1) krdict  2) krdict 미수록일 때만 encykorea
//   이미지: 1) krdict  2) encykorea(대표 항목만)  3) 네이버 이미지 검색(카카오 대체)
// 텍스트와 이미지 폴백은 서로 독립적 — krdict에 뜻은 있는데 이미지만 없는 경우에도 encykorea/네이버를 시도한다.
// 동음이의어(D22)가 있으면 각 동음이의어마다 독립적으로 이미지를 보완한다(D25):
//   - encykorea는 표제어만으로 찾고 뜻을 구분 못 하므로(뜻별 항목이 아님) 동음이의어가 있는 낱말에는
//     아예 쓰지 않는다 — 어느 동음이의어에 배정해도 다른 뜻과 잘못 엮일 위험이 같다.
//   - 네이버(자유 검색)에는 그 동음이의어 뜻풀이 끝 낱말을 힌트로 붙인다(예: "배 과일"). 힌트가
//     "부분"·"단위"처럼 너무 일반적이면(실측: "배" 신체 뜻에서 표제어만으로 검색해 오히려 선박
//     사진이 걸림 — 관대한 폴백을 index 0에만 남겨 뒀다가 뚫린 적이 있다) 검색 자체를 생략하고
//     이니셜 타일로 둔다 — 틀린 사진보다 사진 없음이 안전하다. 예외 없이 모든 동음이의어에 적용.
//
// 사진 보완(encykorea·네이버+AI 심사)은 1~3초가 걸려 처음 찾는 낱말의 응답을 붙잡고 있었다.
// deferImages면 krdict 결과(뜻·삽화·소리)만으로 바로 돌려주고, 사진이 빈 항목에 imagePending을 표시해 둔다.
// 대기 표시는 /api/image(또는 deferImages 없이 부르는 데스크탑 앱의 다음 조회)가 채운다(docs/perf-plan.md §2.2).
import type { DictEntry, DictImage } from "../../app/types.ts";
import type { Env } from "../_shared.ts";
import { searchEncykorea } from "./encykorea.ts";
import { fetchDictEntry } from "./krdict.ts";
import { searchNaverImage } from "./naver.ts";
import { getBlockedImages } from "./image-block.ts";
import { getCachedEntry, patchCachedEntry, putCachedEntry } from "./store.ts";
import { homographImageQuery, imageSearchQuery } from "./textutil.ts";

async function naverFallback(env: Env, query: string | null, word: string, def?: string): Promise<DictImage | null> {
  if (!query) return null;
  const naverId = env["X-NCP-APIGW-API-KEY-ID"];
  const naverKey = env["X-NCP-APIGW-API-KEY"];
  if (!naverId || !naverKey) return null;
  const blocked = await getBlockedImages(env.DB, word);
  return searchNaverImage(naverId, naverKey, query, blocked, { word, def, env }).catch(() => null);
}

// 대표(단일 또는 0번) 항목 — encykorea·네이버를 순차 대기하지 않고 동시에 조회해 지연을 줄인다
// (실측: 기초 어휘는 encykorea에 없는 경우가 많아 순차 진행 시 헛되이 한 번 더 왕복이 걸렸다).
// 텍스트가 이미 encykorea에서 온 항목은 그때 사진도 같이 봤으므로 다시 묻지 않는다.
async function fillPrimaryImage(env: Env, entry: DictEntry): Promise<DictImage | null> {
  const def = entry.senses[0]?.def;
  const [ency, naver] = await Promise.all([
    env.ENCYKOREA_API_KEY && entry.source !== "encykorea"
      ? searchEncykorea(env.ENCYKOREA_API_KEY, entry.word).catch(() => null)
      : Promise.resolve(null),
    naverFallback(env, imageSearchQuery(entry.word, def), entry.word, def),
  ]);
  return ency?.image ?? naver;
}

// 대표가 아닌 동음이의어 — encykorea는 뜻을 구분 못 하니 건너뛰고 네이버(힌트 필수)만 시도.
async function fillHomographImage(env: Env, word: string, def: string | undefined): Promise<DictImage | null> {
  return naverFallback(env, homographImageQuery(word, def), word, def);
}

function isMulti(entry: DictEntry): boolean {
  return !!entry.homographs && entry.homographs.length > 1;
}

// 새로 가져온 항목에서 사진이 빈 자리에 대기 표시를 단다.
function markPendingImages(entry: DictEntry): void {
  if (isMulti(entry)) {
    for (const hg of entry.homographs!) if (!hg.image) hg.imagePending = true;
  } else if (!entry.image) {
    entry.imagePending = true;
  }
}

export function hasPendingImages(entry: DictEntry): boolean {
  return isMulti(entry) ? entry.homographs!.some((hg) => hg.imagePending) : !!entry.imagePending;
}

// 대기 중인 사진을 모두(동음이의어는 병렬로) 채워 entry를 고치고, D1에 반영할 필드 패치를 돌려준다.
async function fillPendingImages(
  env: Env,
  entry: DictEntry,
): Promise<{ sets: [string, unknown][]; removes: string[] }> {
  const sets: [string, unknown][] = [];
  const removes: string[] = [];
  if (isMulti(entry)) {
    const hgs = entry.homographs!;
    await Promise.all(
      hgs.map(async (hg, i) => {
        if (!hg.imagePending) return;
        const image = await fillHomographImage(env, entry.word, hg.senses[0]?.def);
        hgs[i] = { ...hg, image };
        delete hgs[i].imagePending;
        sets.push([`$.homographs[${i}].image`, image]);
        removes.push(`$.homographs[${i}].imagePending`);
      }),
    );
    entry.image = hgs[0]?.image ?? null; // 대표 필드도 동기화
    sets.push(["$.image", entry.image]);
  } else if (entry.imagePending) {
    entry.image = await fillPrimaryImage(env, entry);
    delete entry.imagePending;
    sets.push(["$.image", entry.image]);
    removes.push("$.imagePending");
  }
  return { sets, removes };
}

interface FetchOpts {
  // 넘기면 D1 저장을 응답 반환 뒤로 미룬다(Pages Functions의 EventContext.waitUntil) — 멱등이라 안전.
  waitUntil?: (p: Promise<unknown>) => void;
  refresh?: boolean; // 캐시를 무시하고 krdict에서 다시 가져와 덮어쓴다(사전 새로고침).
  deferImages?: boolean; // 사진 보완을 건너뛰고 imagePending만 남긴다(웹의 첫 조회).
}

export async function getOrFetchEntry(env: Env, word: string, opts: FetchOpts = {}): Promise<DictEntry | null> {
  const { waitUntil, refresh = false, deferImages = false } = opts;
  // waitUntil이 없으면 응답 뒤 작업이 잘릴 수 있으니 그 자리에서 기다린다.
  const later = async (p: Promise<unknown>) => {
    if (waitUntil) waitUntil(p.catch(() => {}));
    else await p.catch(() => {});
  };

  const cached = refresh ? null : await getCachedEntry(env, word);
  if (cached) {
    if (!deferImages && hasPendingImages(cached)) {
      const { sets, removes } = await fillPendingImages(env, cached);
      await later(patchCachedEntry(env, word, sets, removes));
    }
    return cached;
  }

  if (!env.KRDICT_API_KEY) return null;

  let entry = await fetchDictEntry(env.KRDICT_API_KEY, word);

  if (!entry && env.ENCYKOREA_API_KEY) {
    // krdict 미수록 → encykorea 텍스트로 항목 자체를 구성(D20). 표제어 정확 일치만 신뢰.
    const ency = await searchEncykorea(env.ENCYKOREA_API_KEY, word).catch(() => null);
    if (ency) {
      entry = {
        word,
        senses: [{ def: ency.def }],
        pos: ency.field,
        level: null,
        image: ency.image,
        audio: null,
        source: "encykorea",
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  if (!entry) return null;
  markPendingImages(entry);

  if (deferImages) {
    // 곧바로 /api/image가 이 행을 읽으므로 저장을 끝낸 뒤 응답한다(D1 쓰기 한 번이라 짧다).
    await putCachedEntry(env, word, entry).catch(() => {});
    return entry;
  }

  if (hasPendingImages(entry)) await fillPendingImages(env, entry);
  await later(putCachedEntry(env, word, entry));
  return entry;
}
