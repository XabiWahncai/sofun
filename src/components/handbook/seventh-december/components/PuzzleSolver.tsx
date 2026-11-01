import { useState } from 'react';
import { PUZZLE_DATA } from '../data/handbookData';
import { KeyRound, Sparkles, Lightbulb, Lock, HelpCircle } from 'lucide-react';

export const PuzzleSolver = () => {
  const [blackLightOn, setBlackLightOn] = useState(false);
  const [showFormula, setShowFormula] = useState(true);

  return (
    <div className="rounded-2xl border border-zinc-900 bg-black text-zinc-100 p-4 sm:p-5">
      {/* Header with Black Light Simulator Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-zinc-900 text-purple-400 border border-zinc-800">
              <KeyRound size={15} />
            </span>
            <h3 className="font-bold text-sm sm:text-base text-white">
              ซ่อมแซมเอกสาร & ถอดรหัส 3 หลัก (ฉาก 4)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            รหัสเปิดกล่องเล็ก/แฟ้มเก็บสคริปต์ความทรงจำ
          </p>
        </div>

        {/* Black Light Toggle Button */}
        <button
          onClick={() => setBlackLightOn(!blackLightOn)}
          className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
            blackLightOn
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 ring-2 ring-purple-400'
              : 'bg-zinc-900 border border-zinc-800 text-purple-300 hover:bg-zinc-850'
          }`}
        >
          <Sparkles size={14} className={blackLightOn ? 'animate-spin' : ''} />
          <span>{blackLightOn ? 'เปิด Black Light (UV) อยู่' : 'แตะเพื่อจำลองส่อง Black Light'}</span>
        </button>
      </div>

      {/* Riddle Verse */}
      <div
        className={`p-3.5 rounded-xl mb-4 border text-center transition-colors ${
          blackLightOn
            ? 'bg-purple-950/30 border-purple-800/60 text-purple-200'
            : 'bg-zinc-950 border-zinc-850 text-amber-200/90'
        }`}
      >
        <div className="text-[10px] font-semibold tracking-wider uppercase mb-1 opacity-70">
          คำใบ้ปริศนาบนกล่องล็อกรหัส
        </div>
        <p className="font-serif italic text-xs sm:text-sm tracking-wide leading-relaxed">
          “{PUZZLE_DATA.riddle}”
        </p>
      </div>

      {/* 5 Clue Items - Fluorescent UV Reveal */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            เอกสารจิ๊กซอว์ 5 ชิ้น {blackLightOn ? '(ส่องพบตัวเลขเรืองแสง)' : '(ยังไม่ได้ส่องไฟ)'}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">
            {blackLightOn ? 'UV ACTIVE' : 'UV OFF'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {PUZZLE_DATA.items.map((item, index) => (
            <div
              key={index}
              className={`p-3 rounded-xl border text-center transition-all duration-200 ${
                blackLightOn
                  ? 'bg-purple-950/20 border-purple-500/50 shadow-md shadow-purple-950/30'
                  : 'bg-zinc-950 border-zinc-900'
              }`}
            >
              <div className="text-[11px] text-zinc-400 min-h-[30px] flex items-center justify-center leading-tight">
                {item.name}
              </div>

              {/* Secret number */}
              <div className="mt-1.5 flex items-center justify-center">
                <span
                  className={`font-mono font-bold transition-all px-2.5 py-0.5 rounded-md ${
                    blackLightOn
                      ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-400 text-xl drop-shadow-[0_0_8px_rgba(168,85,247,0.7)]'
                      : 'bg-zinc-900 text-zinc-600 text-xs'
                  }`}
                >
                  {blackLightOn ? item.number : '???'}
                </span>
              </div>

              <div className="text-[10px] text-zinc-500 mt-1.5 truncate">
                {item.clueType}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final Lock Output Box */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="text-center sm:text-left">
          <div className="flex items-center gap-1.5 justify-center sm:justify-start text-xs font-bold text-amber-400">
            <Lock size={13} />
            <span>รหัสเปิดกล่อง 3 หลักที่ต้องเฉลย:</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            ตั้งรหัสนี้ที่แม่กุญแจกล่องเล็กก่อนเริ่มรอบเกม
          </div>
        </div>

        <div className="flex items-center gap-2">
          {PUZZLE_DATA.finalCode.split('').map((char, i) => (
            <div
              key={i}
              className="w-12 h-13 flex items-center justify-center font-mono text-2xl font-bold rounded-xl bg-black text-amber-300 border border-amber-600/60 shadow-lg shadow-amber-950/40"
            >
              {char}
            </div>
          ))}
        </div>
      </div>

      {/* Step by step decoding */}
      <div className="pt-3 border-t border-zinc-900">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
            <Lightbulb size={13} />
            <span>หลักการคำนวณถอดรหัสทีละหลัก (DM เฉลย)</span>
          </span>
          <button
            onClick={() => setShowFormula(!showFormula)}
            className="text-xs text-zinc-400 hover:text-white"
          >
            {showFormula ? 'ย่อ' : 'ขยาย'}
          </button>
        </div>

        {showFormula && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PUZZLE_DATA.decoding.map((dec) => (
              <div
                key={dec.digitPosition}
                className="p-3 rounded-xl border border-zinc-900 bg-zinc-950"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-zinc-300">
                    {dec.name}
                  </span>
                  <span className="text-sm font-mono font-bold px-2 py-0.5 rounded bg-zinc-900 text-amber-400 border border-zinc-800">
                    = {dec.result}
                  </span>
                </div>
                <div className="text-[11px] font-serif italic text-zinc-400 mb-1">
                  “{dec.riddlePhrase}”
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  {dec.explanation}
                </p>
                <div className="mt-2 text-xs font-mono font-medium text-zinc-300 bg-black border border-zinc-850 p-1.5 rounded-lg text-center">
                  {dec.formula} = {dec.result}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
