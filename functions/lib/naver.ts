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

export async function searchNaverImage(clientId: string, clientSecret: string, query: string): Promise<DictImage | null> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&display=1&sort=sim`;
  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { items?: NaverImageItem[] };
  const item = data.items?.[0];
  if (!item) return null;

  const src = item.thumbnail || item.link;
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
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { errata?: string };
  const corrected = data.errata?.trim();
  return corrected || null;
}
