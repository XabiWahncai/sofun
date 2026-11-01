import { FLOW_STEPS } from '../data/handbookData';
import { GitCommit, ArrowRight } from 'lucide-react';

interface FlowBlueprintProps {
  onSelectScene?: (sceneKey: string) => void;
}

export const FlowBlueprint = ({ onSelectScene }: FlowBlueprintProps) => {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-sky-950/80 text-sky-400 border border-sky-900/60">
              <GitCommit size={16} />
            </span>
            <h3 className="font-semibold text-base sm:text-lg text-white">
              ผังการดำเนินเกม 10 ขั้นตอน (Session Roadmap)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            แตะขั้นตอนเพื่อเปิดดูบทและแนวทางของแต่ละฉากได้ทันที
          </p>
        </div>
        <span className="text-xs font-mono text-zinc-500 self-start sm:self-auto">
          5 ฉากหลัก • ~90 นาที
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {FLOW_STEPS.map((step, idx) => (
          <div
            key={step.id}
            onClick={() => {
              if (onSelectScene) {
                const s = String(step.sceneNumber);
                if (s.includes('1') && !s.includes('ก่อน')) onSelectScene('scene1');
                else if (s.includes('ก่อน')) onSelectScene('prologue');
                else if (s.includes('2')) onSelectScene('scene2');
                else if (s.includes('3')) onSelectScene('scene3');
                else if (s.includes('4')) onSelectScene('scene4');
                else if (s.includes('5')) onSelectScene('scene5');
              }
            }}
            className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 active:scale-[0.99] transition-all cursor-pointer flex items-start gap-3 group"
          >
            <div className="flex flex-col items-center shrink-0">
              <span className="w-6 h-6 rounded-full font-mono text-xs font-bold flex items-center justify-center bg-zinc-800 text-sky-400 border border-zinc-700">
                {idx + 1}
              </span>
              <span className="text-[9px] text-zinc-500 mt-1">
                {step.sceneNumber}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <h4 className="text-xs font-bold text-white truncate group-hover:text-sky-400 transition-colors">
                  {step.title}
                </h4>
                {step.timeLimit && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-amber-950/80 text-amber-300 border border-amber-900/50 shrink-0">
                    {step.timeLimit}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-400 line-clamp-2">
                {step.objective}
              </p>
            </div>

            <ArrowRight size={14} className="text-zinc-600 group-hover:text-sky-400 transition-colors shrink-0 mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
};
