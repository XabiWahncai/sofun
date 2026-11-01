import { useState } from 'react';
import { PUZZLE_DATA } from '../data/handbookData';
import { KeyRound, Eye, Lightbulb, Sparkles } from 'lucide-react';

export const PuzzleSolver = () => {
  const [blackLightOn, setBlackLightOn] = useState(false);
  const [showFormula, setShowFormula] = useState(true);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-950/80 text-indigo-400 border border-indigo-900/60">
              <KeyRound size={16} />
            </span>
            <h3 className="font-semibold text-base sm:text-lg text-white">
              ซ่อมแซมเอกสาร & ถอดรหัส 3 หลัก
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            ฉากที่ 4: ถอดรหัสกล่อง/แฟ้มเก็บสคริปต์ความทรงจำ
          </p>
        </div>

        {/* Black Light Toggle */}
        <button
          onClick={() => setBlackLightOn(!blackLightOn)}
          className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
            blackLightOn
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40 ring-2 ring-purple-400'
              : 'bg-zinc-900 border border-zinc-800 text-purple-300 hover:bg-zinc-800'
          }`}
        >
          <Sparkles size={14} className={blackLightOn ? 'animate-spin' : ''} />
          <span>{blackLightOn ? 'ส่อง Black Light แล้ว (เปิด)' : 'จำลองส่อง Black Light'}</span>
        </button>
      </div>

      {/* Riddle Verse */}
      <div
        className={`p-4 rounded-xl mb-5 border text-center transition-all ${
          blackLightOn
            ? 'bg-purple-950/30 border-purple-800/80 text-purple-200'
            : 'bg-zinc-900/70 border-zinc-800 text-amber-200/90'
        }`}
      >
        <div className="text-[10px] font-semibold tracking-wider uppercase mb-1 opacity-75">
          คำใบ้ปริศนาบนกล่องล็อกรหัส
        </div>
        <p className="font-serif italic text-xs sm:text-sm tracking-wide leading-relaxed">
          “{PUZZLE_DATA.riddle}”
        </p>
      </div>

      {/* 5 Clue Items - 2 cols on mobile, 5 cols on lg */}
      <div className="mb-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
          <Eye size={13} />
          <span>เอกสารสำคัญ 5 ชิ้น (จิ๊กซอว์)</span>
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {PUZZLE_DATA.items.map((item, index) => (
            <div
              key={index}
              className={`p-3 rounded-xl border text-center transition-all duration-300 ${
                blackLightOn
                  ? 'bg-purple-950/20 border-purple-500/50 shadow-md shadow-purple-950/40'
                  : 'bg-zinc-900/50 border-zinc-800/80'
              }`}
            >
              <div className="text-[11px] text-zinc-400 min-h-[32px] flex items-center justify-center leading-snug">
                {item.name}
              </div>

              {/* Secret number */}
              <div className="mt-2 flex items-center justify-center">
                <span
                  className={`text-2xl font-mono font-bold transition-all duration-300 px-3 py-1 rounded-lg ${
                    blackLightOn
                      ? 'bg-purple-500/20 text-purple-300 ring-2 ring-purple-400 scale-110 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]'
                      : 'bg-zinc-800/50 text-zinc-600 text-sm'
                  }`}
                >
                  {blackLightOn ? item.number : '???'}
                </span>
              </div>

              <div className="text-[10px] text-zinc-500 mt-2 truncate">
                {item.clueType}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step by step decoding */}
      <div className="pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Lightbulb size={13} />
            <span>การถอดรหัสทีละหลัก (DM เฉลย)</span>
          </h4>
          <button
            onClick={() => setShowFormula(!showFormula)}
            className="text-xs text-sky-400 hover:underline"
          >
            {showFormula ? 'ย่อคำอธิบาย' : 'แสดงรายละเอียด'}
          </button>
        </div>

        {showFormula && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5">
            {PUZZLE_DATA.decoding.map((dec) => (
              <div
                key={dec.digitPosition}
                className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-indigo-400">
                    {dec.name}
                  </span>
                  <span className="text-base font-mono font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-900/60">
                    {dec.result}
                  </span>
                </div>
                <div className="text-xs font-serif italic text-zinc-300 mb-1">
                  “{dec.riddlePhrase}”
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  {dec.explanation}
                </p>
                <div className="mt-2 text-xs font-mono font-medium text-zinc-300 bg-black/60 border border-zinc-800/80 p-1.5 rounded-lg text-center">
                  {dec.formula} = {dec.result}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Final Lock Output */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-zinc-900 to-indigo-500/10 border border-amber-500/30">
          <div className="text-center sm:text-left">
            <div className="text-xs font-semibold text-amber-300">
              รหัสปลดล็อกกล่อง/แฟ้ม 3 หลัก:
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              ตั้งรหัสนี้ไว้ที่แม่กุญแจก่อนเริ่มเซสชัน
            </div>
          </div>
          <div className="flex items-center gap-2">
            {PUZZLE_DATA.finalCode.split('').map((char, i) => (
              <div
                key={i}
                className="w-12 h-14 flex items-center justify-center font-mono text-2xl font-bold rounded-xl bg-black text-amber-300 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
              >
                {char}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
