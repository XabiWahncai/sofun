import { useState, useEffect } from 'react';
import { StickyNote, Trash2, Check } from 'lucide-react';

export const DMNotes = () => {
  const [noteText, setNoteText] = useState<string>(() => {
    try {
      return localStorage.getItem('dm_quick_notes') || '';
    } catch {
      return '';
    }
  });
  const [savedStatus, setSavedStatus] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('dm_quick_notes', noteText);
      setSavedStatus(true);
      const timer = setTimeout(() => setSavedStatus(false), 1200);
      return () => clearTimeout(timer);
    } catch {
      // ignore
    }
  }, [noteText]);

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 text-zinc-100 p-4">
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded-md bg-zinc-900 text-amber-400 border border-zinc-800">
            <StickyNote size={14} />
          </span>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            สมุดจดบันทึกโต๊ะ DM (Quick Notes)
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {savedStatus && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
              <Check size={11} /> บันทึกแล้ว
            </span>
          )}
          <button
            onClick={() => setNoteText('')}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 transition-colors"
            title="ล้างข้อความ"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="จดบันทึกชื่อผู้เล่น, ทฤษฎีของผู้เล่น, ตัวเลขทด หรือคำตอบระหว่างคุมโต๊ะ..."
        rows={4}
        className="w-full p-3 rounded-xl text-xs font-mono resize-y border border-zinc-850 bg-black text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-700 transition-colors"
      />
    </div>
  );
};
