import { X, Search, Sparkles, Star, BookMarked } from "lucide-react";
import Modal from "./Modal.tsx";

const STEPS: { icon: typeof Search; title: string; body: string }[] = [
  { icon: Search, title: "1. 찾기", body: "가운데 검색창에 궁금한 낱말을 적으면 쉬운 뜻풀이와 그림이 큰 화면으로 나와요. 뜻이 여러 개인 낱말(예: 배)은 아래 탭으로 골라 볼 수 있어요." },
  { icon: Sparkles, title: "2. 쉬운 말로", body: "상단의 ‘사전 그대로 / 쉬운 말로’ 버튼으로 뜻풀이를 더 쉽게 바꿀 수 있어요. ‘쉬운 말로’를 누르면 초등학생 눈높이에 맞게 더 알기 쉽게 풀어 줘요." },
  { icon: Star, title: "3. 즐겨찾기", body: "낱말 옆 별표(★)를 누르면 즐겨찾기에 저장돼요. 수업에서 자주 쓰는 낱말을 모아 두기 좋아요." },
  { icon: BookMarked, title: "4. 나의 낱말사전", body: "화면 위쪽의 ‘나의 낱말사전’에서 내가 찾은 낱말·즐겨찾기·자주 찾은 낱말을 모아 보고, ‘낱말 익히기’ 주제 카드로 새 낱말도 둘러볼 수 있어요." },
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

      <div className="flex flex-col gap-3 p-6">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3.5 rounded-2xl bg-paper p-4">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Icon className="size-4.5" aria-hidden />
            </div>
            <div>
              <div className="mb-1 text-sm font-extrabold text-ink">{title}</div>
              <p className="text-[13px] font-medium leading-relaxed text-ink-soft">{body}</p>
            </div>
          </div>
        ))}

        <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
          <span className="text-lg">🎬</span>
          <p className="text-xs font-medium leading-relaxed text-ink-soft">
            <b className="text-ink-soft">큰 화면</b> 버튼을 누르면 화면 가득 낱말과 그림이 커져요. 교실 TV나 빔프로젝터로 다 같이 볼 때 편리해요.
          </p>
        </div>
      </div>
    </Modal>
  );
}
