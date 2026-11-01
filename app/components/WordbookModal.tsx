import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Modal from "./Modal.tsx";
import { isBlocked } from "../../functions/lib/blocklist.ts";
import type { CustomWordSet } from "../types.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  words: string[]; // 담을 낱말
  wordbooks: CustomWordSet[]; // 이미 있는 낱말장(= 나의 낱말사전 '내가 만든 주제')
  defaultTitle?: string;
  onCreate: (title: string, emoji: string, words: string[]) => void;
  onAddTo: (id: string, words: string[]) => void;
}

const EMOJIS = ["🌱", "📒", "🌸", "⭐", "🍀", "🌈", "🐻", "🎈", "🍎", "🌙"];

// 낱말장 만들기 / 내 낱말장에 넣기(D28). 낱말장은 기존 '내가 만든 주제'(CustomWordSet)와 같은 것이라
// 나의 낱말사전에 카드로 나타나고, 그 카드의 '공유'로 학급에 나눌 수 있다.
export default function WordbookModal({ open, onClose, words, wordbooks, defaultTitle = "", onCreate, onAddTo }: Props) {
  const [mode, setMode] = useState<"new" | "add">("new");
  const [title, setTitle] = useState(defaultTitle);
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("new");
    setTitle(defaultTitle);
    setEmoji(EMOJIS[0]);
    setTargetId(wordbooks[0]?.id ?? null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "new") {
      const t = title.trim();
      if (!t) return setError("낱말장 이름을 적어 주세요.");
      if (isBlocked(t)) return setError("쓸 수 없는 말이 들어 있어요. 다른 이름을 적어 볼까요?");
      onCreate(t, emoji, words);
    } else {
      if (!targetId) return setError("넣을 낱말장을 골라 주세요.");
      onAddTo(targetId, words);
    }
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="wordbook-title">
      <form onSubmit={submit} className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="wordbook-title" className="text-lg font-extrabold text-ink">
            낱말장에 담기
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-ink-faint hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-full bg-paper p-1" role="tablist" aria-label="담는 방법">
          {(
            [
              ["new", "새 낱말장 만들기"],
              ["add", "내 낱말장에 넣기"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              disabled={key === "add" && wordbooks.length === 0}
              onClick={() => {
                setMode(key);
                setError(null);
              }}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                mode === key ? "bg-white text-brand-700 shadow-sm" : "text-ink-faint hover:text-ink-soft"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "new" ? (
          <>
            <label htmlFor="wordbook-name" className="mb-1.5 block text-sm font-bold text-ink-soft">
              낱말장 이름
            </label>
            <input
              id="wordbook-name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={20}
              placeholder="예: 우리 반 순우리말"
              className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-base text-ink outline-none focus:border-brand-400"
            />
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="그림 고르기">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  role="radio"
                  aria-checked={emoji === em}
                  onClick={() => setEmoji(em)}
                  className={`flex size-10 items-center justify-center rounded-xl border text-xl transition-colors ${
                    emoji === em ? "border-brand-500 bg-brand-50" : "border-line bg-white hover:border-brand-200"
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="낱말장 고르기">
            {wordbooks.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={targetId === s.id}
                onClick={() => setTargetId(s.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-colors ${
                  targetId === s.id ? "border-brand-500 bg-brand-50" : "border-line bg-white hover:border-brand-200"
                }`}
              >
                <span className="font-semibold text-ink">
                  {s.emoji} {s.title}
                </span>
                <span className="text-sm text-ink-faint">낱말 {s.words.length}개</span>
              </button>
            ))}
          </div>
        )}

        <p className="mt-5 mb-2 text-sm font-bold text-ink-soft">담을 낱말 {words.length}개</p>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {words.map((w) => (
            <span key={w} className="rounded-full border border-line bg-paper px-3 py-1 text-sm font-semibold text-ink">
              {w}
            </span>
          ))}
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-paper">
            그만두기
          </button>
          <button type="submit" className="rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">
            {mode === "new" ? "낱말장 만들기" : "넣기"}
          </button>
        </div>
        <p className="mt-4 text-xs text-ink-faint">낱말장은 이 기기에 저장돼요. 나의 낱말사전에서 '공유'를 누르면 다른 기기로 옮길 수 있어요.</p>
      </form>
    </Modal>
  );
}
