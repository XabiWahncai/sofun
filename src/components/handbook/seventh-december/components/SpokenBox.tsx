import { useState } from 'react';
import { Copy, Check, Maximize2, X, Sparkles } from 'lucide-react';

interface SpokenBoxProps {
  dialogue: string;
  speaker?: string;
  instruction?: string;
  stageName?: string;
}

export const SpokenBox = ({
  dialogue,
  speaker = 'บทพูดผู้ดำเนินเกม (เทพผู้สร้างไดอารี่)',
  instruction,
  stageName,
}: SpokenBoxProps) => {
  const [copied, setCopied] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(dialogue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="my-4 rounded-2xl border border-amber-900/40 bg-[#0d0f12] text-zinc-100 shadow-xl relative overflow-hidden">
        {/* Accent strip */}
        <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-sky-400 to-indigo-500" />

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-950/80 text-amber-400 text-xs shrink-0">
                <Sparkles size={13} />
              </span>
              <span className="text-xs font-semibold tracking-wide text-amber-400 uppercase truncate">
                {speaker}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleCopy}
                className="h-8 px-2.5 rounded-lg text-xs flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white active:scale-95 transition-all"
                title="คัดลอกบทพูด"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span className="text-[11px]">{copied ? 'ก๊อปแล้ว' : 'คัดลอก'}</span>
              </button>

              <button
                onClick={() => setIsFocusMode(true)}
                className="h-8 px-2.5 rounded-lg text-xs flex items-center gap-1.5 bg-amber-950/50 border border-amber-900/60 text-amber-300 hover:text-amber-100 active:scale-95 transition-all"
                title="ขยายสำหรับอ่านออกเสียง"
              >
                <Maximize2 size={13} />
                <span className="text-[11px]">โหมดอ่าน</span>
              </button>
            </div>
          </div>

          {/* Dialogue Text */}
          <div className="relative pl-3.5 border-l-2 border-amber-500/80 py-1 my-1">
            <p className="text-sm sm:text-base leading-relaxed whitespace-pre-line font-serif italic text-zinc-200">
              "{dialogue}"
            </p>
          </div>

          {/* Instruction */}
          {instruction && (
            <div className="mt-3 pt-2.5 border-t border-zinc-800/80 text-[11px] sm:text-xs leading-relaxed text-zinc-400 flex items-start gap-2">
              <span className="font-semibold text-amber-400 shrink-0">
                คำแนะนำ DM:
              </span>
              <span>{instruction}</span>
            </div>
          )}
        </div>
      </div>

      {/* Focus / Read Aloud Modal for Mobile */}
      {isFocusMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="max-w-lg w-full max-h-[90vh] flex flex-col rounded-3xl p-5 sm:p-7 shadow-2xl border border-zinc-800 bg-[#0d0f12] text-white">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/50">
                  {speaker}
                </span>
                {stageName && (
                  <span className="text-xs text-zinc-400">
                    • {stageName}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsFocusMode(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-800/80 text-zinc-300 hover:text-white"
                title="ปิด"
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-5 overflow-y-auto flex-1 pr-1">
              <p className="text-lg sm:text-2xl leading-relaxed sm:leading-loose font-serif italic text-amber-100 whitespace-pre-line drop-shadow-sm">
                "{dialogue}"
              </p>

              {instruction && (
                <div className="mt-6 p-4 rounded-xl text-xs bg-zinc-900 border border-amber-900/40 text-amber-300/90 leading-relaxed">
                  <div className="font-semibold mb-1 text-amber-400">คำแนะนำสำหรับผู้ดำเนินเกม:</div>
                  <div>{instruction}</div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-zinc-800 shrink-0 flex justify-end">
              <button
                onClick={() => setIsFocusMode(false)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors"
              >
                ปิดหน้าต่างอ่าน
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
