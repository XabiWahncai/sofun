import { GAME_METADATA, CHARACTERS } from '../data/handbookData';
import { Sparkles, Users, Clock, Shield, Feather, Heart, ArrowDown, BookOpen } from 'lucide-react';

interface HeroOverviewProps {
  onNavigate: (section: string) => void;
}

export const HeroOverview = ({ onNavigate }: HeroOverviewProps) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Editorial Minimal Hero Card */}
      <div className="rounded-3xl border border-zinc-800 bg-[#0d0f12] text-white p-5 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle atmospheric ambient glow */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Cover Artwork */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative group max-w-[240px] sm:max-w-[280px] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-zinc-700/60">
              <img
                src="/cover.jpg"
                alt="The Secret of 7th December - DM Handbook"
                className="w-full h-auto object-cover transform group-hover:scale-[1.02] transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-70" />
              <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20">
                  Official DM Playbook
                </span>
              </div>
            </div>
          </div>

          {/* Title & Metadata */}
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-950/80 text-sky-400 border border-sky-800/60">
              <Sparkles size={13} />
              <span>คู่มือผู้ดำเนินเกม (DM Handbook)</span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                {GAME_METADATA.title}
              </h1>
              <p className="text-xs sm:text-sm font-serif italic text-zinc-400 mt-1">
                {GAME_METADATA.englishTitle}
              </p>
            </div>

            <p className="text-xs leading-relaxed text-zinc-300">
              {GAME_METADATA.welcomeText}
            </p>

            {/* Quick Meta Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center">
                <div className="flex justify-center text-sky-400 mb-1">
                  <Users size={15} />
                </div>
                <div className="text-[10px] text-zinc-500">จำนวนผู้เล่น</div>
                <div className="text-xs font-bold mt-0.5 text-white">{GAME_METADATA.players}</div>
              </div>

              <div className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center">
                <div className="flex justify-center text-amber-400 mb-1">
                  <Clock size={15} />
                </div>
                <div className="text-[10px] text-zinc-500">เวลาการเล่น</div>
                <div className="text-xs font-bold mt-0.5 text-white">{GAME_METADATA.duration}</div>
              </div>

              <div className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center">
                <div className="flex justify-center text-indigo-400 mb-1">
                  <Shield size={15} />
                </div>
                <div className="text-[10px] text-zinc-500">บทบาท DM</div>
                <div className="text-xs font-bold mt-0.5 truncate text-white">{GAME_METADATA.dmRole}</div>
              </div>

              <div className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center">
                <div className="flex justify-center text-rose-400 mb-1">
                  <Heart size={15} />
                </div>
                <div className="text-[10px] text-zinc-500">เพลงประจำเรื่อง</div>
                <div className="text-xs font-bold mt-0.5 truncate text-white">โลกที่ไม่มีเธอ</div>
              </div>
            </div>

            {/* CTA Navigation Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={() => onNavigate('checklist')}
                className="flex-1 sm:flex-none h-10 px-4 rounded-xl text-xs font-bold bg-sky-500 text-black hover:bg-sky-400 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/20"
              >
                <span>ตรวจเช็กอุปกรณ์ (16 ชิ้น)</span>
                <ArrowDown size={14} />
              </button>

              <button
                onClick={() => onNavigate('walkthrough')}
                className="flex-1 sm:flex-none h-10 px-4 rounded-xl text-xs font-semibold bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <BookOpen size={14} className="text-sky-400" />
                <span>เปิดบทดำเนินเกม</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Characters Overview Section */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-white p-4 sm:p-6 shadow-2xl">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
          <span className="p-1.5 rounded-lg bg-sky-950/80 text-sky-400 border border-sky-900/60">
            <Feather size={16} />
          </span>
          <div>
            <h3 className="font-semibold text-base sm:text-lg text-white">ตัวละครทั้งสอง (The Protagonists)</h3>
            <p className="text-xs text-zinc-400">
              รายละเอียดและข้อมูลลับสำหรับผู้ดำเนินเกม
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CHARACTERS.map((char) => (
            <div
              key={char.id}
              className={`p-4 rounded-2xl border transition-all ${
                char.id === 'trin'
                  ? 'border-sky-900/50 bg-sky-950/10'
                  : 'border-rose-900/50 bg-rose-950/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h4 className="text-base font-bold text-white">
                    {char.name}
                  </h4>
                  <span className="text-xs text-zinc-400">
                    {char.role} • อายุ {char.age} ปี
                  </span>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    char.knowsOwnName
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                      : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                  }`}
                >
                  {char.knowsOwnName ? 'รู้ชื่อตัวเองตั้งแต่ต้น' : 'ยังไม่รู้ชื่อในฉาก 1'}
                </span>
              </div>

              <div className="space-y-1 text-xs text-zinc-300 mt-2 leading-relaxed">
                <div>
                  <span className="font-semibold text-zinc-200">รูปลักษณ์:</span>{' '}
                  {char.appearance}
                </div>
                <div>
                  <span className="font-semibold text-zinc-200">อุปนิสัย:</span>{' '}
                  {char.personality}
                </div>
                <div className="pt-2 text-[11px] text-amber-300/90 bg-black/60 p-2.5 rounded-xl border border-amber-900/40">
                  <strong>ข้อมูลลับสำหรับ DM:</strong> {char.notes}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
