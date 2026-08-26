import { json, type Env } from "../_shared.ts";
import { getCachedEntry, putCachedEntry } from "../lib/store.ts";
import { searchNaverImage } from "../lib/naver.ts";
import { homographImageQuery, imageSearchQuery } from "../lib/textutil.ts";
import { blockImage, getBlockedImages } from "../lib/image-block.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = (await request.json()) as {
      word?: string;
      currentUrl?: string;
      action?: "next" | "hide";
      homoIndex?: number;
    };

    const word = body.word?.trim();
    const currentUrl = body.currentUrl?.trim();
    const action = body.action || "next";
    const homoIndex = typeof body.homoIndex === "number" ? body.homoIndex : 0;

    if (!word) {
      return json({ success: false, error: "word is required" }, 400);
    }

    // 1. 현재 불편한 URL이 있으면 D1 차단 테이블에 영구 등록
    if (currentUrl) {
      await blockImage(env.DB, word, currentUrl);
    }

    // 2. D1 캐시에서 기존 엔트리 가져오기
    const entry = await getCachedEntry(env, word);
    if (!entry) {
      return json({ success: false, error: "entry not found in cache" }, 404);
    }

    const homographs = entry.homographs && entry.homographs.length > 1 ? entry.homographs : null;
    const currentSense = homographs ? homographs[homoIndex]?.senses[0]?.def : entry.senses[0]?.def;

    if (action === "hide") {
      // 이미지 완전 숨김 처리
      if (homographs && homographs[homoIndex]) {
        homographs[homoIndex].image = null;
        if (homoIndex === 0) entry.image = null;
      } else {
        entry.image = null;
      }
      await putCachedEntry(env, word, entry);
      return json({ success: true, image: null, action: "hide" });
    }

    // action === "next": 다음 순위 네이버 이미지 조회
    const naverId = env["X-NCP-APIGW-API-KEY-ID"];
    const naverKey = env["X-NCP-APIGW-API-KEY"];
    if (!naverId || !naverKey) {
      if (homographs && homographs[homoIndex]) {
        homographs[homoIndex].image = null;
        if (homoIndex === 0) entry.image = null;
      } else {
        entry.image = null;
      }
      await putCachedEntry(env, word, entry);
      return json({ success: true, image: null, action: "next" });
    }

    const blockedList = await getBlockedImages(env.DB, word);
    if (currentUrl && !blockedList.includes(currentUrl)) {
      blockedList.push(currentUrl);
    }

    const query = homographs
      ? homographImageQuery(word, currentSense)
      : imageSearchQuery(word, currentSense);

    const nextImage = query ? await searchNaverImage(naverId, naverKey, query, blockedList) : null;

    if (homographs && homographs[homoIndex]) {
      homographs[homoIndex].image = nextImage;
      if (homoIndex === 0) entry.image = nextImage;
    } else {
      entry.image = nextImage;
    }

    await putCachedEntry(env, word, entry);
    return json({ success: true, image: nextImage, action: "next" });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
};
