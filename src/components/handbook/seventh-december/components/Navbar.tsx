import { useState, useEffect } from 'react';
import { Type, ArrowLeft } from 'lucide-react';
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
      setScrolled(window.scrollY > 8);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { id: 'walkthrough', label: 'บทรายฉาก' },
    { id: 'puzzles', label: 'ปริศนา 945' },
    { id: 'checklist', label: 'อุปกรณ์' },
    { id: 'blueprint', label: 'ผัง 10 ขั้น' },
    { id: 'tools', label: 'เครื่องมือ DM' },
    { id: 'overview', label: 'ข้อมูลเกม' },
  ];

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-200 border-b ${
        scrolled
          ? 'bg-black/95 backdrop-blur-md border-zinc-900 shadow-md'
          : 'bg-black border-zinc-900'
      }`}
    >
      <div className="max-w-4xl mx-auto px-3.5 sm:px-6 h-13 sm:h-14 flex items-center justify-between gap-3">
        {/* Left: Back button & Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 flex items-center justify-center shrink-0 active:scale-95 transition-all"
              title="กลับหน้ารวมคู่มือ DM"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <div
            onClick={() => setActiveSection('overview')}
            className="flex items-center gap-2 cursor-pointer min-w-0"
          >
            <div className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs sm:text-sm tracking-tight text-white truncate">
                  {GAME_METADATA.title}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-zinc-900 text-rose-400 border border-zinc-800 shrink-0">
                  DM
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Desktop Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => setActiveSection(link.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                activeSection === link.id
                  ? 'bg-zinc-900 text-white font-bold border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950'
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right: Timer pill & Font size toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {timerCompactDisplay && (
            <div className="flex items-center">
              {timerCompactDisplay}
            </div>
          )}

          <button
            onClick={() => setFontSize(fontSize === 'normal' ? 'large' : 'normal')}
            className={`h-8 px-2 rounded-lg text-xs border flex items-center gap-1 transition-all active:scale-95 ${
              fontSize === 'large'
                ? 'border-rose-800 text-rose-300 bg-rose-950/60 font-bold'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-200 bg-zinc-950'
            }`}
            title="ปรับขนาดตัวอักษรสำหรับอ่านบนโต๊ะ"
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
