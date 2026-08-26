// 네이버 이미지 검색(NCP API Hub) — krdict·encykorea 둘 다 이미지가 없을 때만 쓰는 최종 폴백(D24).
// 카카오 이미지 검색을 대체(2026-08-26). https://api.ncloud-docs.com/docs/naver-api-hub-search-image
//
// 주의: 카카오와 마찬가지로 안전검색(safe-search) 옵션이 문서에 없다 — 미검수 웹 이미지가 그대로 노출될
// 수 있다. krdict·encykorea에 이미지가 있으면 절대 이 폴백을 타지 않고, 정확도순(sort=sim) 1건만 취하며,
// 결과는 D1에 영구 캐시된다(재검증·수동 교체가 쉽다).
import type { DictImage } from "../../app/types.ts";

const ENDPOINT = "https://naverapihub.apigw.ntruss.com/search/v1/image";

interface NaverImageItem {
  link: string;
  thumbnail: string;
  title?: string;
}

export async function searchNaverImage(
  clientId: string,
  clientSecret: string,
  query: string,
  blockedUrls: string[] = [],
): Promise<DictImage | null> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&display=10&sort=sim`;
  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { items?: NaverImageItem[] };
  const items = data.items || [];

  const validItem = items.find((item) => {
    const src = item.thumbnail || item.link;
    return src && !blockedUrls.includes(src);
  });

  if (!validItem) return null;

  const src = validItem.thumbnail || validItem.link;
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
