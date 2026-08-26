import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
}

// 접근성 모달: 스크림, Esc 닫기, 포커스 진입/복귀, 기본 Tab 트랩. (edu-kit Modal.tsx와 동일 패턴)
export default function Modal({ open, onClose, labelledBy, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement;
    const el = ref.current;
    const focusable = el?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    focusable?.[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && focusable && focusable.length) {
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className="dic-scroll max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}
