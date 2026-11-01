import { FLOW_STEPS } from '../data/handbookData';
import { Layers, ArrowRight } from 'lucide-react';

interface FlowBlueprintProps {
  onSelectScene?: (sceneKey: string) => void;
}

export const FlowBlueprint = ({ onSelectScene }: FlowBlueprintProps) => {
  return (
    <div className="rounded-2xl border border-zinc-900 bg-black text-zinc-100 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-zinc-900 text-sky-400 border border-zinc-800">
              <Layers size={16} />
            </span>
            <h3 className="font-bold text-sm sm:text-base text-white">
              ผังการดำเนินเกม 10 ขั้นตอน (Session Roadmap)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            แตะขั้นตอนเพื่อเปิดดูบทพูดและรายละเอียดของแต่ละฉากได้ทันที
          </p>
        </div>
        <span className="text-xs font-mono text-zinc-500 self-start sm:self-auto">
          5 ฉากหลัก • ~90 นาที
        </span>
      </div>

      <div className="space-y-2">
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
            className="p-3 rounded-xl border border-zinc-900 bg-zinc-950 hover:border-zinc-800 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-between gap-3 group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex flex-col items-center shrink-0">
                <span className="w-6 h-6 rounded-full font-mono text-xs font-bold flex items-center justify-center bg-zinc-900 text-zinc-300 border border-zinc-800">
                  {idx + 1}
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 border border-zinc-850">
                    {step.sceneNumber}
                  </span>
                  <h4 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-rose-400 transition-colors">
                    {step.title}
                  </h4>
                </div>
                <p className="text-[11px] text-zinc-400 truncate">
                  {step.objective}
                </p>
              </div>
            </div>

            <div className="text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0">
              <ArrowRight size={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
