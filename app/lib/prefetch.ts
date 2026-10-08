import type { PointerEvent } from "react";
import { prefetchLookup } from "./api.ts";

// 낱말 버튼에 붙이는 미리 받기 이벤트. 마우스는 잠깐(80ms) 머물 때만 — 목록을 쓸고 지나가는 건 무시.
// 손가락·펜·마우스 누름(pointerdown)은 곧 클릭이 오므로 바로 시작한다.
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

export function prefetchProps(word: string) {
  return {
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => prefetchLookup(word), 80);
    },
    onPointerLeave: () => clearTimeout(hoverTimer),
    onPointerDown: () => prefetchLookup(word),
  };
}
