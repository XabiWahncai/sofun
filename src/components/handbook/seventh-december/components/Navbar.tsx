import { useState, useEffect } from 'react';
import { BookOpen, Type, ArrowLeft } from 'lucide-react';
import { GAME_METADATA } from '../data/handbookData';

interface NavbarProps {
  fontSize: 'normal' | 'large';
  setFontSize: (val: 'normal' | 'large') => void;
  activeSection: string;
  setActiveSection: (val: string) => void;
  timerCompactDisplay?: React.ReactNode;
  onBack?: () => void;
}

export const Navbar = ({
  fontSize,
  setFontSize,
  activeSection,
  setActiveSection,
  timerCompactDisplay,
  onBack,
}: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { id: 'overview', label: 'หน้าแรก' },
    { id: 'checklist', label: 'อุปกรณ์' },
    { id: 'blueprint', label: 'ผัง 10 ขั้น' },
    { id: 'walkthrough', label: 'บทรายฉาก' },
  ];

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 border-b ${
        scrolled
          ? 'bg-black/95 backdrop-blur-xl border-zinc-800 shadow-xl'
          : 'bg-black border-zinc-900'
      }`}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-3">
        {/* Brand & Back Button */}
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors"
              title="กลับหน้ารวมคู่มือ DM"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div
            onClick={() => setActiveSection('overview')}
            className="flex items-center gap-2 cursor-pointer group min-w-0"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-black font-bold shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform shrink-0">
              <BookOpen size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-white truncate">
                  {GAME_METADATA.title}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-sky-950 text-sky-400 border border-sky-800/60 shrink-0">
                  DM
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 tracking-wide hidden sm:block truncate">
                {GAME_METADATA.subtitle}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => setActiveSection(link.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === link.id
                  ? 'bg-zinc-800 text-sky-400 font-bold border border-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Compact Timer in Navbar */}
          {timerCompactDisplay && (
            <div className="flex items-center">
              {timerCompactDisplay}
            </div>
          )}

          {/* Font Size Toggle */}
          <button
            onClick={() => setFontSize(fontSize === 'normal' ? 'large' : 'normal')}
            className={`h-9 px-2.5 rounded-xl text-xs border flex items-center gap-1 transition-all active:scale-95 ${
              fontSize === 'large'
                ? 'border-sky-500 text-sky-300 bg-sky-950/80 font-bold'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-200 bg-zinc-900/60'
            }`}
            title="ปรับขนาดตัวอักษรสำหรับอ่านหน้าโต๊ะ"
          >
            <Type size={13} />
            <span className="font-mono text-[11px]">
              {fontSize === 'large' ? 'A+' : 'A'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
