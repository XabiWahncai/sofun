import { useState } from 'react';
import { Music, ExternalLink, QrCode, Play, Disc3, X } from 'lucide-react';
import { GAME_METADATA } from '../data/handbookData';

export const BGMController = () => {
  const [selectedQR, setSelectedQR] = useState<'piano' | 'ink' | null>(null);

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 text-zinc-100 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-zinc-900 text-rose-400 border border-zinc-800">
              <Music size={15} />
            </span>
            <h3 className="font-bold text-sm sm:text-base text-white">
              เพลงประจำเกมและบรรยากาศเสียง (BGM)
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            เพลง ‘โลกที่ไม่มีเธอ’ คือหัวใจสำคัญในการนำพาอารมณ์ความรู้สึก
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 self-start sm:self-auto font-medium">
          <Disc3 size={13} className="animate-spin text-rose-500" />
          <span>PORTRAIT / INK WARUNTORN</span>
        </span>
      </div>

      {/* Two Song Versions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
        {/* Version 1: Piano */}
        <div className="p-3.5 rounded-xl border border-zinc-850 bg-black flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wide">
                แทร็กที่ 1 (อ่านสคริปต์)
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 font-mono">
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

          <div className="mt-3 pt-2.5 border-t border-zinc-900 flex items-center gap-2">
            <a
              href={GAME_METADATA.themeSongPianoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-9 rounded-xl text-xs font-semibold bg-zinc-900 border border-zinc-800 text-white hover:bg-zinc-850 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Play size={13} />
              <span>เปิดบน YouTube</span>
              <ExternalLink size={11} className="opacity-60" />
            </a>
            <button
              onClick={() => setSelectedQR('piano')}
              className="h-9 px-3 rounded-xl text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="ดู QR Code"
            >
              <QrCode size={14} />
            </button>
          </div>
        </div>

        {/* Version 2: Ink Waruntorn */}
        <div className="p-3.5 rounded-xl border border-zinc-850 bg-black flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wide">
                แทร็กที่ 2 (ช่วงไคลแมกซ์)
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 font-mono">
                Official
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">
              โลกที่ไม่มีเธอ (อิ้งค์ วรันธร)
            </h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              เปิดในฉากที่ 5 ช่วงเขียนโปสการ์ดของแทนใจและปิดท้ายเรื่องราว
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-zinc-900 flex items-center gap-2">
            <a
              href={GAME_METADATA.themeSongInkUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-9 rounded-xl text-xs font-semibold bg-zinc-900 border border-zinc-800 text-white hover:bg-zinc-850 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Play size={13} />
              <span>เปิดบน YouTube</span>
              <ExternalLink size={11} className="opacity-60" />
            </a>
            <button
              onClick={() => setSelectedQR('ink')}
              className="h-9 px-3 rounded-xl text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="ดู QR Code"
            >
              <QrCode size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      {selectedQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="max-w-xs w-full p-5 rounded-2xl border border-zinc-800 bg-zinc-950 text-center shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                {selectedQR === 'piano' ? 'Piano Version QR' : 'อิ้งค์ วรันธร QR'}
              </span>
              <button
                onClick={() => setSelectedQR(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-900 text-zinc-400 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-3 bg-white rounded-xl inline-block">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  selectedQR === 'piano' ? GAME_METADATA.themeSongPianoUrl : GAME_METADATA.themeSongInkUrl
                )}`}
                alt="BGM QR Code"
                className="w-48 h-48 mx-auto"
              />
            </div>

            <p className="text-[11px] text-zinc-400">
              ให้ผู้เล่นสแกนเพื่อฟังผ่านหูฟังของตนเอง
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
