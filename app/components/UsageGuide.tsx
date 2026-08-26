import { X, Search, Sparkles, EyeOff, Star, Monitor, Maximize2, Download } from "lucide-react";
import Modal from "./Modal.tsx";

const STEPS: { icon: typeof Search; title: string; body: string }[] = [
  {
    icon: Search,
    title: "1. 낱말 & 초성 검색",
    body: "낱말이나 초성(예: 'ㄱㅇ')을 적으면 쉬운 뜻풀이와 그림을 바로 보여줘요.",
  },
  {
    icon: Sparkles,
    title: "2. 쉬운 말로 풀이",
    body: "어려운 사전 뜻을 초등학생 눈높이에 맞춰 더 알기 쉽게 풀어줘요.",
  },
  {
    icon: EyeOff,
    title: "3. 사진 바꾸기 & 숨기기",
    body: "웹 사진 하단 버튼으로 다른 사진으로 교체하거나 부적절한 사진을 숨길 수 있어요.",
  },
  {
    icon: Star,
    title: "4. 즐겨찾기 & 낱말 익히기",
    body: "별표(★)로 낱말을 모으고, '나의 낱말사전'에서 주제별로 익혀요.",
  },
  {
    icon: Maximize2,
    title: "5. 발표용 큰 화면",
    body: "'큰 화면' 버튼을 누르면 교실 TV나 전자칠판에 낱말과 그림이 시원하게 커져요.",
  },
  {
    icon: Monitor,
    title: "6. PC 단축키 앱",
    body: "단축키(Ctrl+Alt+D)로 화면 위에 즉시 사전을 띄우는 데스크탑 앱을 제공해요.",
  },
];

export default function UsageGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="usage-title">
      <div className="sticky top-0 flex items-center justify-between bg-brand-600 px-6 py-4 text-white">
        <div>
          <div id="usage-title" className="text-base font-extrabold">어린이 쉬운 사전 활용 안내</div>
          <div className="mt-0.5 text-xs font-semibold opacity-85">수업 시간에 큰 화면으로 함께 보는 어린이 사전</div>
        </div>
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-2.5 p-6 max-h-[75vh] overflow-y-auto">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3 rounded-2xl bg-paper p-3.5 items-start">
            <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 mt-0.5">
              <Icon className="size-4" aria-hidden />
            </div>
            <div>
              <div className="text-sm font-extrabold text-ink">{title}</div>
              <p className="mt-0.5 text-[13px] font-medium leading-normal text-ink-soft">{body}</p>
            </div>
          </div>
        ))}

        {/* 데스크탑 앱 다운로드 배너 */}
        <div className="mt-1 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">💻</span>
            <div>
              <div className="text-sm font-extrabold text-brand-900">PC 전용 앱 다운로드</div>
              <div className="mt-0.5 text-xs text-brand-700">
                단축키 <kbd className="rounded border border-brand-300 bg-white px-1 py-0.5 font-mono text-[10px] font-bold text-brand-800 shadow-2xs">Ctrl+Alt+D</kbd> 지원
              </div>
            </div>
          </div>

          <a
            href="/api/download/desktop"
            download="어린이 쉬운 사전 데스크탑 설치.exe"
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <Download className="size-3.5" aria-hidden />
            <span>다운로드</span>
          </a>
        </div>
      </div>
    </Modal>
  );
}


