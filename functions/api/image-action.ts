import { json, type Env } from "../_shared.ts";
import type { DictImage } from "../../app/types.ts";
import { getCachedEntry, patchCachedEntry } from "../lib/store.ts";
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
      return json({ success: false, error: "word is required" }, { status: 400 });
    }

    // 1. 현재 불편한 URL이 있으면 D1 차단 테이블에 영구 등록
    if (currentUrl) {
      await blockImage(env.DB, word, currentUrl);
    }

    // 2. D1 캐시에서 기존 엔트리 가져오기
    const entry = await getCachedEntry(env, word);
    if (!entry) {
      return json({ success: false, error: "entry not found in cache" }, { status: 404 });
    }

    const homographs = entry.homographs && entry.homographs.length > 1 ? entry.homographs : null;
    const currentSense = homographs ? homographs[homoIndex]?.senses[0]?.def : entry.senses[0]?.def;

    // 사진 필드만 갱신 — 같은 때 끝난 쉬운 말·관련어 저장을 덮어쓰지 않는다(docs/perf-plan.md §2.4).
    const saveImage = (image: DictImage | null) => {
      const sets: [string, unknown][] = [];
      if (homographs && homographs[homoIndex]) {
        sets.push([`$.homographs[${homoIndex}].image`, image]);
        if (homoIndex === 0) sets.push(["$.image", image]);
      } else {
        sets.push(["$.image", image]);
      }
      return patchCachedEntry(env, word, sets);
    };

    if (action === "hide") {
      // 이미지 완전 숨김 처리
      await saveImage(null);
      return json({ success: true, image: null, action: "hide" });
    }

    // action === "next": 다음 순위 네이버 이미지 조회
    const naverId = env["X-NCP-APIGW-API-KEY-ID"];
    const naverKey = env["X-NCP-APIGW-API-KEY"];
    if (!naverId || !naverKey) {
      await saveImage(null);
      return json({ success: true, image: null, action: "next" });
    }

    const blockedList = await getBlockedImages(env.DB, word);
    if (currentUrl && !blockedList.includes(currentUrl)) {
      blockedList.push(currentUrl);
    }

    const query = homographs
      ? homographImageQuery(word, currentSense)
      : imageSearchQuery(word, currentSense);

    const nextImage = query
      ? await searchNaverImage(naverId, naverKey, query, blockedList, { word, def: currentSense, env })
      : null;

    await saveImage(nextImage);
    return json({ success: true, image: nextImage, action: "next" });
  } catch (err) {
    return json({ success: false, error: String(err) }, { status: 500 });
  }
};
