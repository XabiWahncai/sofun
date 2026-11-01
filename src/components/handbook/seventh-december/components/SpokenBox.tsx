import { useState } from 'react';
import { Copy, Check, Maximize2, X, Volume2 } from 'lucide-react';

interface SpokenBoxProps {
  dialogue: string;
  speaker?: string;
  instruction?: string;
  stageName?: string;
}

export const SpokenBox = ({
  dialogue,
  speaker = 'บทพูด DM (เทพผู้สร้างไดอารี่)',
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
      <div className="my-3.5 rounded-xl border border-zinc-850 bg-zinc-950/80 text-zinc-100 relative overflow-hidden" style={{ borderColor: '#222226' }}>
        <div className="p-3.5 sm:p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-zinc-900">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 h-5 rounded-md bg-rose-950/80 text-rose-400 flex items-center justify-center shrink-0">
                <Volume2 size={12} />
              </span>
              <span className="text-xs font-semibold text-rose-300 tracking-wide truncate">
                {speaker}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleCopy}
                className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-zinc-350 hover:text-white active:scale-95 transition-all"
                title="คัดลอกบทพูด"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copied ? 'ก๊อปแล้ว' : 'คัดลอก'}</span>
              </button>

              <button
                onClick={() => setIsFocusMode(true)}
                className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-zinc-350 hover:text-white active:scale-95 transition-all"
                title="ขยายสำหรับอ่านออกเสียง"
              >
                <Maximize2 size={12} />
                <span>โหมดอ่าน</span>
              </button>
            </div>
          </div>

          {/* Dialogue Text */}
          <div className="relative pl-3.5 border-l-2 border-rose-600/90 py-0.5 my-1">
            <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-line font-serif italic text-zinc-100">
              "{dialogue}"
            </p>
          </div>

          {/* Instruction */}
          {instruction && (
            <div className="mt-2.5 pt-2 border-t border-zinc-900 text-[11px] sm:text-xs leading-relaxed text-zinc-400 flex items-start gap-1.5">
              <span className="font-bold text-amber-400 shrink-0">
                คำแนะนำ DM:
              </span>
              <span>{instruction}</span>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Read Aloud Modal for Dim Table Lighting */}
      {isFocusMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/95 backdrop-blur-md animate-in fade-in duration-150">
          <div className="max-w-xl w-full max-h-[92vh] flex flex-col rounded-2xl p-5 sm:p-6 border border-zinc-800 bg-black text-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-900 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-900/60">
                  {speaker}
                </span>
                {stageName && (
                  <span className="text-xs text-zinc-500 font-mono">
                    • {stageName}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsFocusMode(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-900 text-zinc-400 hover:text-white"
                title="ปิด"
              >
                <X size={16} />
              </button>
            </div>

            {/* Read Text */}
            <div className="my-5 overflow-y-auto flex-1 pr-1 space-y-4">
              <p className="text-lg sm:text-2xl leading-relaxed sm:leading-loose font-serif italic text-zinc-100 whitespace-pre-line">
                "{dialogue}"
              </p>

              {instruction && (
                <div className="p-3.5 rounded-xl text-xs bg-zinc-950 border border-zinc-850 text-zinc-300 leading-relaxed">
                  <div className="font-bold mb-1 text-amber-400">คำแนะนำสำหรับผู้ดำเนินเกม:</div>
                  <div>{instruction}</div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-zinc-900 shrink-0 flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="h-10 px-4 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1.5"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกบท'}</span>
              </button>
              <button
                onClick={() => setIsFocusMode(false)}
                className="flex-1 h-10 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors"
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
