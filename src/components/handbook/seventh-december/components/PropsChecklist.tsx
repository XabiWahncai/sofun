import { useState, useEffect } from 'react';
import { PROPS_LIST } from '../data/handbookData';
import { CheckCircle2, Circle, RotateCcw, PackageCheck } from 'lucide-react';

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
    <div className="rounded-2xl border border-zinc-900 bg-black text-zinc-100 p-4 sm:p-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-zinc-900 text-emerald-400 border border-zinc-800">
              <PackageCheck size={16} />
            </span>
            <h3 className="font-bold text-sm sm:text-base text-white">
              อุปกรณ์และการจัดเตรียม (16 รายการ)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            แตะรายการเพื่อติ๊กเครื่องหมายว่าจัดเตรียมเรียบร้อยแล้ว
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={checkAll}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-850 text-zinc-300 hover:text-white active:scale-95 transition-all"
          >
            เลือกทั้งหมด
          </button>
          <button
            onClick={resetAll}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-850 text-zinc-400 hover:text-rose-400 active:scale-95 transition-all flex items-center gap-1"
            title="ล้างทั้งหมด"
          >
            <RotateCcw size={12} />
            <span>รีเซ็ต</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4 p-3 rounded-xl bg-zinc-950 border border-zinc-850">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-zinc-400">ความพร้อมของอุปกรณ์ในห้อง:</span>
          <span className="font-mono font-bold text-emerald-400">
            {checkedIds.length} / {PROPS_LIST.length} ชิ้น ({progress}%)
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeCategory === cat.key
                ? 'bg-zinc-800 text-white font-bold border border-zinc-700'
                : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Checklist Grid */}
      <div className="space-y-1.5">
        {filteredProps.map((prop) => {
          const isDone = checkedIds.includes(prop.id);
          return (
            <div
              key={prop.id}
              onClick={() => toggleCheck(prop.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none active:scale-[0.99] ${
                isDone
                  ? 'bg-zinc-950 border-emerald-950/70 text-zinc-400'
                  : 'bg-black border-zinc-900 hover:border-zinc-800 text-zinc-200'
              }`}
            >
              <div className="pt-0.5 shrink-0 text-emerald-400">
                {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} className="text-zinc-600" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span
                    className={`text-xs sm:text-sm font-semibold truncate ${
                      isDone ? 'line-through text-zinc-500' : 'text-white'
                    }`}
                  >
                    {prop.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 shrink-0">
                    {prop.amount}
                  </span>
                </div>

                {prop.note && (
                  <p className="text-[11px] text-zinc-500 leading-snug">
                    {prop.note}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
