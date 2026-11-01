import { useState } from 'react';
import { Music, ExternalLink, QrCode, Play, Disc3, Sparkles } from 'lucide-react';
import { GAME_METADATA } from '../data/handbookData';

export const BGMController = () => {
  const [selectedQR, setSelectedQR] = useState<'piano' | 'ink' | null>(null);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-sky-950/80 text-sky-400 border border-sky-900/60">
              <Music size={16} />
            </span>
            <h3 className="font-semibold text-base sm:text-lg text-white">
              เพลงประจำเกมและบรรยากาศเสียง (BGM)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            เพลง ‘โลกที่ไม่มีเธอ’ คือหัวใจสำคัญในการนำพาอารมณ์ความรู้สึก
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-sky-950/60 text-sky-300 border border-sky-900/60 self-start sm:self-auto font-medium">
          <Disc3 size={13} className="animate-spin text-sky-400" />
          <span>PORTRAIT / INK WARUNTORN</span>
        </span>
      </div>

      {/* Two Song Versions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {/* Version 1: Piano */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wide">
                แทร็กที่ 1 (อ่านสคริปต์)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                Piano
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">
              โลกที่ไม่มีเธอ (Piano Version)
            </h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              เปิดคลอเบา ๆ ระหว่างที่เริ่มอ่านสคริปต์ความทรงจำในฉากที่ 4 เพื่อสร้างสมาธิ
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center gap-2">
            <a
              href={GAME_METADATA.themeSongPianoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-9 rounded-xl text-xs font-semibold bg-zinc-800 text-white hover:bg-zinc-700 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Play size={13} />
              <span>เปิดบน YouTube</span>
              <ExternalLink size={12} className="opacity-60" />
            </a>
            <button
              onClick={() => setSelectedQR('piano')}
              className="w-9 h-9 rounded-xl border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-300 hover:text-white"
              title="สแกน QR Code"
            >
              <QrCode size={16} />
            </button>
          </div>
        </div>

        {/* Version 2: INK WARUNTORN */}
        <div className="p-4 rounded-xl border border-rose-900/50 bg-rose-950/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wide">
                แทร็กที่ 2 (ไคลแมกซ์)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 font-semibold">
                แนะนำ ★
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">
              โลกที่ไม่มีเธอ (INK WARUNTORN)
            </h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              สลับมาเปิดช่วงท้ายที่ผู้เล่นอ่านสคริปต์ความทรงจำใกล้จบ เสียงร้องหญิงกระตุ้นอารมณ์ได้ลึกซึ้งที่สุด
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-rose-900/50 flex items-center gap-2">
            <a
              href={GAME_METADATA.themeSongInkUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-9 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Play size={13} />
              <span>เปิดบน YouTube</span>
              <ExternalLink size={12} className="opacity-60" />
            </a>
            <button
              onClick={() => setSelectedQR('ink')}
              className="w-9 h-9 rounded-xl border border-rose-900/60 bg-rose-950/40 flex items-center justify-center text-rose-300 hover:text-white"
              title="สแกน QR Code"
            >
              <QrCode size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Cue Instructions */}
      <div className="p-3.5 rounded-xl border border-amber-900/50 bg-amber-950/20 text-xs text-zinc-300 leading-relaxed">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-400 mb-1.5">
          <Sparkles size={13} />
          <span>จังหวะการสลับเพลงในฉากที่ 4:</span>
        </div>
        <ol className="list-decimal pl-4 space-y-1 text-zinc-400">
          <li>เปิดเพลง <strong className="text-zinc-200">Piano version</strong> ตอนผู้เล่นเริ่มอ่านสคริปต์ความทรงจำ</li>
          <li>เมื่อสังเกตว่าอ่านถึง <strong className="text-amber-300">ช่วงท้าย ๆ</strong> ให้สลับเป็น <strong className="text-zinc-200">INK WARUNTORN version</strong> ทันที</li>
          <li>เมื่อเพลงจบ ให้สลับกลับมาเป็น <strong className="text-zinc-200">Piano version</strong> คลอไปจนจบฉาก</li>
        </ol>
      </div>

      {/* QR Code Modal */}
      {selectedQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="max-w-xs w-full rounded-3xl p-6 text-center border border-zinc-800 bg-[#0d0f12] text-white">
            <h4 className="text-base font-bold mb-1">
              สแกน QR Code เพื่อเปิดเพลง
            </h4>
            <p className="text-xs text-zinc-400 mb-4">
              {selectedQR === 'piano'
                ? 'โลกที่ไม่มีเธอ (Piano Version)'
                : 'โลกที่ไม่มีเธอ (INK WARUNTORN Version)'}
            </p>

            <div className="bg-white p-3 rounded-2xl inline-block shadow-inner mx-auto mb-4 border border-zinc-700">
              <img
                src={selectedQR === 'piano' ? '/qr_piano.png' : '/qr_ink.png'}
                alt="QR Code"
                className="w-44 h-44 object-contain"
              />
            </div>

            <div className="flex gap-2 justify-center">
              <a
                href={
                  selectedQR === 'piano'
                    ? GAME_METADATA.themeSongPianoUrl
                    : GAME_METADATA.themeSongInkUrl
                }
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 text-xs font-semibold bg-sky-500 text-black rounded-xl hover:bg-sky-400"
              >
                เปิดลิงก์
              </a>
              <button
                onClick={() => setSelectedQR(null)}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
