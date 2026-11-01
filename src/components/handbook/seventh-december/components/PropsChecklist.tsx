import { useState, useEffect } from 'react';
import { PROPS_LIST } from '../data/handbookData';
import { CheckCircle2, Circle, RotateCcw, PackageCheck, Box } from 'lucide-react';

export const PropsChecklist = () => {
  const [checkedIds, setCheckedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dm_props_checked');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    try {
      localStorage.setItem('dm_props_checked', JSON.stringify(checkedIds));
    } catch {
      // ignore
    }
  }, [checkedIds]);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const checkAll = () => {
    setCheckedIds(PROPS_LIST.map((p) => p.id));
  };

  const resetAll = () => {
    setCheckedIds([]);
  };

  const filteredProps =
    activeCategory === 'all'
      ? PROPS_LIST
      : PROPS_LIST.filter((p) => p.category === activeCategory);

  const progress = Math.round((checkedIds.length / PROPS_LIST.length) * 100);

  const categories = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'scripts', label: 'สคริปต์' },
    { key: 'puzzles', label: 'เบาะแส & ปริศนา' },
    { key: 'props', label: 'อุปกรณ์ & กล่อง' },
    { key: 'lighting', label: 'แสงสว่าง' },
    { key: 'audio', label: 'ไฟล์เสียง' },
  ];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-900/60">
              <PackageCheck size={16} />
            </span>
            <h3 className="font-semibold text-base sm:text-lg text-white">
              อุปกรณ์ภายในเกม (Preparation Checklist)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            ตรวจเช็ก 16 รายการก่อนเริ่มเซสชัน (แตะเพื่อติ๊กถูก)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={checkAll}
            className="px-3 py-1.5 text-xs rounded-xl font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            เลือกทั้งหมด
          </button>
          <button
            onClick={resetAll}
            className="p-1.5 text-xs rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors"
            title="รีเซ็ตทั้งหมด"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-5 p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium text-zinc-300">
            ความพร้อมอุปกรณ์: {checkedIds.length} / {PROPS_LIST.length} ชิ้น
          </span>
          <span className="font-mono font-bold text-emerald-400">
            {progress}%
          </span>
        </div>
        <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Category Pills - Scrollable on mobile */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 no-scrollbar -mx-1 px-1">
        {categories.map((c) => (
          <button
            key={c.key}
            onClick={() => setActiveCategory(c.key)}
            className={`px-3 py-1.5 text-xs rounded-xl whitespace-nowrap transition-all font-medium ${
              activeCategory === c.key
                ? 'bg-sky-500 text-black font-bold shadow-md shadow-sky-500/20'
                : 'bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Items List */}
      <div className="space-y-2 mb-6">
        {filteredProps.map((item) => {
          const isChecked = checkedIds.includes(item.id);
          return (
            <div
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all active:scale-[0.99] ${
                isChecked
                  ? 'bg-emerald-950/20 border-emerald-900/40 text-zinc-400'
                  : 'bg-zinc-900/40 border-zinc-800/80 text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <button className="mt-0.5 shrink-0 text-emerald-400">
                {isChecked ? (
                  <CheckCircle2 size={19} className="text-emerald-400" />
                ) : (
                  <Circle size={19} className="text-zinc-600" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-xs sm:text-sm font-medium ${
                      isChecked ? 'line-through text-zinc-500' : 'text-zinc-100'
                    }`}
                  >
                    {item.name}
                  </span>
                  <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded font-mono bg-zinc-800 text-zinc-300 shrink-0">
                    {item.amount}
                  </span>
                </div>
                {item.note && (
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                    {item.note}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Setup Box Instructions */}
      <div className="p-4 rounded-xl border border-amber-900/50 bg-amber-950/20 text-zinc-300">
        <div className="flex items-center gap-1.5 mb-2 font-bold text-xs uppercase tracking-wide text-amber-400">
          <Box size={14} />
          <span>ขั้นตอนการบรรจุกล่องเตรียมการ:</span>
        </div>
        <ol className="text-xs space-y-1.5 list-decimal pl-4 leading-relaxed text-zinc-400">
          <li>
            นำ <strong className="text-white">สคริปต์ความทรงจำ 2 เล่ม</strong> ใส่ในกล่องเล็ก/แฟ้ม แล้วตั้งรหัสล็อกตัวเลข 3 หลัก (<span className="font-mono font-bold text-amber-400">9 4 5</span>)
          </li>
          <li>
            นำตัวต่อจิ๊กซอว์ทั้ง 5 ชุด ใส่ในกล่องเล็กสำหรับใส่จิ๊กซอว์
          </li>
          <li>
            นำ <strong className="text-white">การ์ดไดอารี่ 13 แผ่น</strong> + <strong className="text-white">เบาะแสคดี 7/12 & ชันสูตร 5 แผ่น</strong> + กล่องจิ๊กซอว์ ใส่รวมลงในกล่องเล็ก
          </li>
          <li>
            นำกล่องเล็กทั้งหมดใส่ใน <strong className="text-white">กล่องใหญ่ (ไม่มีตัวล็อก)</strong>
          </li>
          <li>
            เตรียมกระดาษและปากกา 2 ชุด สำหรับให้ผู้เล่นจด
          </li>
        </ol>
      </div>
    </div>
  );
};
