import { useState } from 'react';
import { CASE_712_SOLUTION } from '../data/handbookData';
import { ShieldAlert, Eye, EyeOff, User, Skull, Clock, ChevronRight } from 'lucide-react';

export const Case712Timeline = () => {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-900/60">
              <ShieldAlert size={16} />
            </span>
            <h3 className="font-semibold text-base sm:text-lg text-white">
              เฉลยคดีเหตุการณ์ 7/12 (DM Spoiler)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            ข้อมูลลับสำหรับ DM: ตัวตนผู้ตาย ฆาตกร และกลอุบายห้องปิดตาย
          </p>
        </div>

        <button
          onClick={() => setRevealed(!revealed)}
          className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
            revealed
              ? 'bg-rose-600 text-white'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white'
          }`}
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{revealed ? 'ซ่อนเฉลยคดี' : 'แตะเพื่อเปิดเฉลยคดี'}</span>
        </button>
      </div>

      {!revealed ? (
        <div
          onClick={() => setRevealed(true)}
          className="p-6 sm:p-8 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 text-center cursor-pointer hover:border-zinc-700 transition-all active:scale-[0.99]"
        >
          <div className="inline-flex p-3 rounded-full bg-rose-950/50 text-rose-400 mb-2 border border-rose-900/50">
            <ShieldAlert size={22} />
          </div>
          <div className="text-xs sm:text-sm font-semibold text-zinc-200">
            แตะเพื่อเปิดเผยเฉลยคดี (ป้องกันการเปิดเผยก่อนเวลา)
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            รวมลำดับเหตุการณ์ 8 ขั้นตอนและการจัดฉากห้องปิดตาย
          </div>
        </div>
      ) : (
        <div className="space-y-5 animate-in fade-in duration-300">
          {/* Key Facts Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-rose-900/50 bg-rose-950/20">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 uppercase tracking-wide mb-1">
                <Skull size={14} />
                <span>ผู้เสียชีวิตในคดี</span>
              </div>
              <div className="text-base sm:text-lg font-bold text-white">
                {CASE_712_SOLUTION.victim}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                เด็กหนุ่มที่สูญเสียความทรงจำและไม่รู้ชื่อตนเองในฉากแรก
              </div>
            </div>

            <div className="p-4 rounded-xl border border-amber-900/50 bg-amber-950/20">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">
                <User size={14} />
                <span>ฆาตกรตัวจริง</span>
              </div>
              <div className="text-base sm:text-lg font-bold text-white">
                {CASE_712_SOLUTION.murderer}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                เพื่อนบ้านห้องติดกัน ผู้มีส่วนพัวพันขบวนการค้ามนุษย์
              </div>
            </div>
          </div>

          {/* Stepped Timeline */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              <Clock size={13} />
              <span>ลำดับเหตุการณ์การลงมือ 8 ขั้นตอน:</span>
            </div>

            <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
              {CASE_712_SOLUTION.timeline.map((item) => (
                <div key={item.step} className="relative">
                  <span className="absolute -left-5 top-1 flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold bg-sky-500 text-black">
                    {item.step}
                  </span>

                  <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50">
                    <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1 mb-1">
                      <span>{item.title}</span>
                      <ChevronRight size={11} className="text-zinc-500" />
                    </div>
                    <p className="text-[11px] sm:text-xs leading-relaxed text-zinc-400">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Locked Room Trick Highlight Box */}
          <div className="p-4 rounded-xl border border-amber-900/60 bg-amber-950/30 text-amber-200/90">
            <div className="text-xs font-bold uppercase tracking-wider mb-1 text-amber-400">
              ★ กลเม็ด 'ห้องปิดตาย' ที่ผู้เล่นต้องไขให้ได้:
            </div>
            <p className="text-xs leading-relaxed text-zinc-300">
              เดชาอาศัยจังหวะที่กระจกห้องตฤณถูกยิงแตก นำ <strong>เข็มขัดของพ่อเลี้ยง</strong> คล้องสลักล็อกหน้าต่าง แล้วดึงผ่านรูกระจกแตกเพื่อล็อกห้องจากภายนอก ก่อนปล่อยให้เข็มขัดหดกลับเข้าไปในห้อง ทำให้ดูเหมือนตฤณล็อกห้องจากข้างในเอง
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
