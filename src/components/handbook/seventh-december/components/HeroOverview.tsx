import { GAME_METADATA, CHARACTERS } from '../data/handbookData';
import { Users, Clock, Shield, Heart, ArrowRight } from 'lucide-react';

interface HeroOverviewProps {
  onNavigate: (section: string) => void;
}

export const HeroOverview = ({ onNavigate }: HeroOverviewProps) => {
  return (
    <div className="space-y-4">
      {/* Editorial Minimal Hero Card */}
      <div className="rounded-2xl border border-zinc-900 bg-black text-white p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
          {/* Cover Artwork */}
          <div className="sm:col-span-4 flex justify-center">
            <div className="relative max-w-[200px] sm:max-w-[240px] rounded-xl overflow-hidden border border-zinc-800 shadow-2xl">
              <img
                src="/cover.jpg"
                alt="The Secret of 7th December - DM Handbook"
                className="w-full h-auto object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
              <div className="absolute bottom-2 left-2 right-2 text-white">
                <span className="text-[9px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-black/80 border border-white/20">
                  Official DM Handbook
                </span>
              </div>
            </div>
          </div>

          {/* Title & Metadata */}
          <div className="sm:col-span-8 space-y-3">
            <div>
              <div className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-rose-400 border border-zinc-800 mb-1.5">
                MURDER MYSTERY • 2 PLAYERS
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight">
                {GAME_METADATA.title}
              </h1>
              <p className="text-xs font-serif italic text-zinc-400 mt-0.5">
                {GAME_METADATA.englishTitle}
              </p>
            </div>

            <p className="text-xs leading-relaxed text-zinc-300">
              {GAME_METADATA.welcomeText}
            </p>

            {/* Quick Meta Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="p-2.5 rounded-xl border border-zinc-850 bg-zinc-950 text-center">
                <div className="flex justify-center text-zinc-400 mb-0.5">
                  <Users size={14} />
                </div>
                <div className="text-[10px] text-zinc-500">จำนวนผู้เล่น</div>
                <div className="text-xs font-bold text-white mt-0.5">{GAME_METADATA.players}</div>
              </div>

              <div className="p-2.5 rounded-xl border border-zinc-850 bg-zinc-950 text-center">
                <div className="flex justify-center text-amber-400 mb-0.5">
                  <Clock size={14} />
                </div>
                <div className="text-[10px] text-zinc-500">เวลาการเล่น</div>
                <div className="text-xs font-bold text-white mt-0.5">{GAME_METADATA.duration}</div>
              </div>

              <div className="p-2.5 rounded-xl border border-zinc-850 bg-zinc-950 text-center">
                <div className="flex justify-center text-rose-400 mb-0.5">
                  <Shield size={14} />
                </div>
                <div className="text-[10px] text-zinc-500">บทบาท DM</div>
                <div className="text-xs font-bold text-white mt-0.5 truncate">{GAME_METADATA.dmRole}</div>
              </div>

              <div className="p-2.5 rounded-xl border border-zinc-850 bg-zinc-950 text-center">
                <div className="flex justify-center text-rose-400 mb-0.5">
                  <Heart size={14} />
                </div>
                <div className="text-[10px] text-zinc-500">เพลงประจำเรื่อง</div>
                <div className="text-xs font-bold text-white mt-0.5 truncate">โลกที่ไม่มีเธอ</div>
              </div>
            </div>

            {/* CTA Navigation Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => onNavigate('walkthrough')}
                className="h-10 px-4 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5 active:scale-95"
              >
                <span>เริ่มดำเนินเกม (เปิดบทรายฉาก)</span>
                <ArrowRight size={14} />
              </button>
              <button
                onClick={() => onNavigate('checklist')}
                className="h-10 px-3.5 rounded-xl text-xs font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors flex items-center justify-center"
              >
                เช็คอุปกรณ์ (16 ชิ้น)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Characters Briefing */}
      <div className="rounded-2xl border border-zinc-900 bg-black text-white p-4 sm:p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
          ข้อมูลตัวละครสำหรับ DM (2 ผู้เล่น)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CHARACTERS.map((char) => (
            <div
              key={char.id}
              className="p-3.5 rounded-xl border border-zinc-850 bg-zinc-950 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">{char.name}</h4>
                  <p className="text-xs text-zinc-400">{char.role} ({char.age} ปี)</p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                  {char.id === 'trin' ? 'ชาย' : 'หญิง'}
                </span>
              </div>
              <div className="text-xs text-zinc-300 space-y-1">
                <p><span className="text-zinc-500">รูปลักษณ์:</span> {char.appearance}</p>
                <p><span className="text-zinc-500">บุคลิก:</span> {char.personality}</p>
                <p className="text-amber-400 pt-1 font-medium bg-black/60 p-2 rounded-lg border border-zinc-900">
                  ★ กฎ DM: {char.notes}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
