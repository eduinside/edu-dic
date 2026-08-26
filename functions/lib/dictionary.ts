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
import type { DictEntry, DictHomograph, DictImage } from "../../app/types.ts";
import type { Env } from "../_shared.ts";
import { searchEncykorea } from "./encykorea.ts";
import { fetchDictEntry } from "./krdict.ts";
import { searchNaverImage } from "./naver.ts";
import { blockImage, getBlockedImages } from "./image-block.ts";
import { getCachedEntry, putCachedEntry } from "./store.ts";
import { homographImageQuery, imageSearchQuery } from "./textutil.ts";


async function naverFallback(env: Env, query: string | null, word: string): Promise<DictImage | null> {
  if (!query) return null;
  const naverId = env["X-NCP-APIGW-API-KEY-ID"];
  const naverKey = env["X-NCP-APIGW-API-KEY"];
  if (!naverId || !naverKey) return null;
  const blocked = await getBlockedImages(env.DB, word);
  return searchNaverImage(naverId, naverKey, query, blocked).catch(() => null);
}

// 대표(단일 또는 0번) 항목 — encykorea·네이버를 순차 대기하지 않고 동시에 조회해 지연을 줄인다
// (실측: 기초 어휘는 encykorea에 없는 경우가 많아 순차 진행 시 헛되이 한 번 더 왕복이 걸렸다).
async function fillPrimaryImage(env: Env, word: string, def: string | undefined): Promise<DictImage | null> {
  const [ency, naver] = await Promise.all([
    env.ENCYKOREA_API_KEY ? searchEncykorea(env.ENCYKOREA_API_KEY, word).catch(() => null) : Promise.resolve(null),
    naverFallback(env, imageSearchQuery(word, def), word),
  ]);
  return ency?.image ?? naver;
}

// 대표가 아닌 동음이의어 — encykorea는 뜻을 구분 못 하니 건너뛰고 네이버(힌트 필수)만 시도.
async function fillHomographImage(env: Env, word: string, def: string | undefined): Promise<DictImage | null> {
  return naverFallback(env, homographImageQuery(word, def), word);
}


// waitUntil을 넘기면 D1 캐시 저장을 응답 반환 뒤로 미룬다(Pages Functions의 EventContext.waitUntil).
// 저장 자체도 응답 지연에 들어가던 것을 빼서 첫 조회 체감 속도를 줄인다 — 멱등 upsert라 안전.
export async function getOrFetchEntry(
  env: Env,
  word: string,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<DictEntry | null> {
  const cached = await getCachedEntry(env, word);
  if (cached) return cached;

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

  if (entry.homographs && entry.homographs.length > 1) {
    const filled: DictHomograph[] = await Promise.all(
      entry.homographs.map(async (hg) => (hg.image ? hg : { ...hg, image: await fillHomographImage(env, entry!.word, hg.senses[0]?.def) })),
    );
    entry.homographs = filled;
    entry.image = filled[0]?.image ?? null; // 대표 필드도 동기화
  } else if (!entry.image) {
    entry.image = await fillPrimaryImage(env, entry.word, entry.senses[0]?.def);
  }

  const save = putCachedEntry(env, word, entry);
  if (waitUntil) waitUntil(save.catch(() => {}));
  else await save;
  return entry;
}
