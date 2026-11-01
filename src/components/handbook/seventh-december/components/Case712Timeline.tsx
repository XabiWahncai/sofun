import { useState } from 'react';
import { CASE_712_SOLUTION } from '../data/handbookData';
import { ShieldAlert, Eye, EyeOff, Skull, Clock } from 'lucide-react';

export const Case712Timeline = () => {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 text-zinc-100 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-2.5 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-zinc-900 text-rose-400 border border-zinc-800">
              <ShieldAlert size={15} />
            </span>
            <h3 className="font-bold text-sm sm:text-base text-white">
              เฉลยคดีเหตุการณ์ 7/12 (DM Spoiler)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            ข้อมูลลับสำหรับ DM: ตัวตนผู้ตาย ฆาตกร และกลอุบายห้องปิดตาย
          </p>
        </div>

        <button
          onClick={() => setRevealed(!revealed)}
          className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
            revealed
              ? 'bg-rose-600 text-white'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white'
          }`}
        >
          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          <span>{revealed ? 'ซ่อนเฉลยคดี' : 'แตะเพื่อเปิดเฉลยคดี'}</span>
        </button>
      </div>

      {!revealed ? (
        <div
          onClick={() => setRevealed(true)}
          className="p-5 sm:p-6 rounded-xl border border-dashed border-zinc-850 bg-black text-center cursor-pointer hover:border-zinc-700 transition-all active:scale-[0.99]"
        >
          <div className="inline-flex p-2.5 rounded-full bg-zinc-900 text-rose-400 mb-2 border border-zinc-800">
            <ShieldAlert size={20} />
          </div>
          <div className="text-xs sm:text-sm font-semibold text-zinc-200">
            แตะเพื่อเปิดเผยเฉลยคดี (ป้องกันการเปิดเผยก่อนเวลา)
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            รวมลำดับเหตุการณ์ 8 ขั้นตอนและการจัดฉากห้องปิดตาย
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Key Facts Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3.5 rounded-xl border border-zinc-850 bg-black">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 uppercase tracking-wide mb-1">
                <Skull size={14} />
                <span>ผู้เสียชีวิตในคดี</span>
              </div>
              <div className="text-sm font-bold text-white mb-1">
                {CASE_712_SOLUTION.victim.name}
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {CASE_712_SOLUTION.victim.causeOfDeath}
              </p>
              <div className="mt-2 text-[10px] text-zinc-500 font-mono">
                บาดแผล: {CASE_712_SOLUTION.victim.wound}
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-850 bg-black">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 uppercase tracking-wide mb-1">
                <ShieldAlert size={14} />
                <span>ตัวจริงของฆาตกร</span>
              </div>
              <div className="text-sm font-bold text-white mb-1">
                {CASE_712_SOLUTION.killer.name}
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                แรงจูงใจ: {CASE_712_SOLUTION.killer.motive}
              </p>
              <div className="mt-2 text-[10px] text-rose-300 font-mono">
                กลอุบาย: {CASE_712_SOLUTION.killer.trick}
              </div>
            </div>
          </div>

          {/* Locked Room Trick Explanation */}
          <div className="p-3.5 rounded-xl border border-zinc-850 bg-black">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wide mb-1.5">
              กลอุบายห้องปิดตาย (Locked Room Mystery):
            </h4>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {CASE_712_SOLUTION.lockedRoomTrick}
            </p>
          </div>

          {/* Timeline of 8 Steps */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
              <Clock size={13} />
              <span>ลำดับเหตุการณ์จริง 8 ขั้นตอน (Timeline)</span>
            </h4>

            <div className="space-y-1.5">
              {CASE_712_SOLUTION.timeline.map((item) => (
                <div
                  key={item.step}
                  className="p-3 rounded-xl border border-zinc-850 bg-black flex items-start gap-2.5"
                >
                  <span className="w-5 h-5 rounded-md font-mono text-xs font-bold flex items-center justify-center bg-zinc-900 text-rose-400 border border-zinc-800 shrink-0">
                    {item.step}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white mb-0.5">
                      {item.title}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
