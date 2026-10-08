// 네이버 이미지 검색(NCP API Hub) — krdict·encykorea 둘 다 이미지가 없을 때만 쓰는 최종 폴백(D24).
// 카카오 이미지 검색을 대체(2026-08-26). https://api.ncloud-docs.com/docs/naver-api-hub-search-image
//
// 주의: 카카오와 마찬가지로 안전검색(safe-search) 옵션이 문서에 없다 — 미검수 웹 이미지가 그대로 노출될
// 수 있다. krdict·encykorea에 이미지가 있으면 절대 이 폴백을 타지 않고, 정확도순(sort=sim) 1건만 취하며,
// 결과는 D1에 영구 캐시된다(재검증·수동 교체가 쉽다).
import type { DictImage } from "../../app/types.ts";
import type { Env } from "../_shared.ts";
import { selectBestImageIndex } from "./ai.ts";

const ENDPOINT = "https://naverapihub.apigw.ntruss.com/search/v1/image";

interface NaverImageItem {
  link: string;
  thumbnail: string;
  title?: string;
}

export interface ImageContext {
  word: string;
  def?: string;
  env?: Env;
}

const COMMERCIAL_PATTERN =
  /(할인|구매|가격|판매|후기|이벤트|쿠폰|특가|리뷰|쇼핑|체험단|협찬|뉴스|포토뉴스|속보|사건|사고|논란|연예|찌라시|경찰|사망|범죄|중고|렌탈|대여)/i;

function cleanTitle(title: string): string {
  return title.replace(/<[^>]+>/g, "").replace(/&[a-z0-9#]+;/gi, " ").trim();
}

export async function searchNaverImage(
  clientId: string,
  clientSecret: string,
  query: string,
  blockedUrls: string[] = [],
  context?: ImageContext,
): Promise<DictImage | null> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&display=15&sort=sim`;
  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { items?: NaverImageItem[] };
  const rawItems = data.items || [];

  // 1단계: 초고속 0ms 규칙 기반 필터링 (차단 목록 제외 + 상업/뉴스 키워드 배제)
  const candidateItems = rawItems.filter((item) => {
    const src = item.thumbnail || item.link;
    if (!src || blockedUrls.includes(src)) return false;
    const title = cleanTitle(item.title || "");
    if (COMMERCIAL_PATTERN.test(title)) return false;
    return true;
  });

  if (candidateItems.length === 0) {
    // 만약 규칙 필터로 전부 걸러졌다면, 차단 URL만 제외한 첫 원본으로 최소 안전 보장
    const fallbackItem = rawItems.find((item) => {
      const src = item.thumbnail || item.link;
      return src && !blockedUrls.includes(src);
    });
    if (!fallbackItem) return null;
    const src = fallbackItem.thumbnail || fallbackItem.link;
    return {
      url: src,
      license: "네이버 이미지 검색",
      attribution: "출처: 네이버 이미지 검색",
      source: "naver",
    };
  }

  // 2단계: AI 검증 및 최적 후보 선택 (1.2초 타임아웃)
  let chosenItem = candidateItems[0];

  if (context?.env && context.word && context.def && candidateItems.length > 1) {
    try {
      const topCandidates = candidateItems.slice(0, 5);
      const titles = topCandidates.map((c) => cleanTitle(c.title || ""));
      const bestIdx = await selectBestImageIndex(context.env, context.word, context.def, titles);
      if (bestIdx === 0) {
        // AI가 모든 후보가 엉뚱/부적절하다고 판별한 경우 -> 오답 방지를 위해 안전하게 미노출
        return null;
      }
      if (bestIdx && bestIdx >= 1 && bestIdx <= topCandidates.length) {
        chosenItem = topCandidates[bestIdx - 1];
      }
    } catch {
      // AI 실패/지연 시 규칙 1순위(chosenItem)로 안전 폴백
    }
  }

  const src = chosenItem.thumbnail || chosenItem.link;
  if (!src) return null;

  return {
    url: src,
    license: "네이버 이미지 검색",
    attribution: "출처: 네이버 이미지 검색",
    source: "naver",
  };
}



// 네이버 오타 변환(NCP API Hub) — 사전 미수록어의 오타 교정에 사용(D29, AI 대신 이 공식 API로 교체).
// https://api.ncloud-docs.com/docs/naver-api-hub-search-errata — 이미지 검색과 같은 키·쿼터(25,000회/일) 공유.
// 실측(2026-08-26): "안뇽하세요"→"안녕하세요", "강아치"→"강아지"는 잡지만 "사가"·"메마" 같은 사전 낱말
// 단순 오타는 못 잡는 경우가 있다 — 이 API는 널리 알려진 검색어 오타 패턴에 특화된 것으로 보인다.
export async function searchNaverErrata(clientId: string, clientSecret: string, query: string): Promise<string | null> {
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/errata?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { errata?: string };
  const corrected = data.errata?.trim();
  return corrected || null;
}

// 네이버 웹문서 검색(NCP API Hub) — "24절기", "전통놀이" 같은 주제에서 구체적인 세부 어휘를
// 파악하기 위해 웹문서 스니펫을 수집해 AI 컨텍스트로 제공한다.
// https://api.ncloud-docs.com/docs/naver-api-hub-search-webkr
export async function searchNaverWeb(
  clientId: string,
  clientSecret: string,
  query: string,
  display = 4,
): Promise<string[]> {
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/webkr?query=${encodeURIComponent(query)}&display=${display}`;
  try {
    const res = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      items?: { title?: string; description?: string }[];
    };
    if (!data.items || !Array.isArray(data.items)) return [];

    // HTML 태그(<b>, </b>, &quot; 등) 제거 및 텍스트 정리
    return data.items
      .map((item) => {
        const title = (item.title ?? "").replace(/<[^>]+>/g, "").replace(/&[a-z0-9#]+;/gi, " ");
        const desc = (item.description ?? "").replace(/<[^>]+>/g, "").replace(/&[a-z0-9#]+;/gi, " ");
        return `${title}: ${desc}`.trim();
      })
      .filter((text) => text.length > 5);
  } catch {
    return [];
  }
}
