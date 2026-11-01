import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HeroOverview } from './components/HeroOverview';
import { PropsChecklist } from './components/PropsChecklist';
import { FlowBlueprint } from './components/FlowBlueprint';
import { SceneWalkthrough } from './components/SceneWalkthrough';
import { DMTimer } from './components/DMTimer';
import { DMNotes } from './components/DMNotes';
import { BGMController } from './components/BGMController';
import { GAME_METADATA } from './data/handbookData';
import {
  Compass,
  Package,
  Layers,
  BookOpen,
  Timer as TimerIcon,
  Wrench,
  ChevronUp,
  X
} from 'lucide-react';

interface DecemberSeventhHandbookProps {
  onBack?: () => void;
}

export function DecemberSeventhHandbook({ onBack }: DecemberSeventhHandbookProps) {
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [mobileToolsModalOpen, setMobileToolsModalOpen] = useState<boolean>(false);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(30 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const timerMins = Math.floor(timerSecondsLeft / 60);
  const timerSecs = timerSecondsLeft % 60;

  return (
    <div
      className={`min-h-screen bg-black text-zinc-100 flex flex-col transition-all duration-300 ${
        fontSize === 'large' ? 'text-[17px]' : 'text-[15px]'
      }`}
    >
      {/* Sticky Top Bar with brand & compact timer */}
      <Navbar
        fontSize={fontSize}
        setFontSize={setFontSize}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onBack={onBack}
        timerCompactDisplay={
          <button
            onClick={() => setMobileToolsModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 hover:border-sky-500/50 active:scale-95 transition-all"
            title="เปิดเครื่องมือจับเวลา DM"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isTimerRunning ? 'bg-sky-400 animate-ping' : 'bg-zinc-600'
              }`}
            />
            <span className="font-mono text-xs font-bold text-white tracking-wider">
              {String(timerMins).padStart(2, '0')}:{String(timerSecs).padStart(2, '0')}
            </span>
          </button>
        }
      />

      {/* Main Container - with pb-24 on mobile so bottom bar doesn't obscure content */}
      <main className="max-w-5xl mx-auto px-4 py-5 sm:py-8 flex-1 w-full pb-28 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Content Area */}
          <div className="lg:col-span-8 space-y-6 min-w-0">
            {activeSection === 'overview' && (
              <HeroOverview
                onNavigate={(sec) => {
                  setActiveSection(sec);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {activeSection === 'checklist' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                    <Package size={18} className="text-sky-400" />
                    <span>เตรียมอุปกรณ์และการเซ็ตติ้ง</span>
                  </h2>
                  <button
                    onClick={() => {
                      setActiveSection('blueprint');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-xs text-sky-400 hover:underline"
                  >
                    ดูผัง 10 ขั้นถัดไป →
                  </button>
                </div>
                <PropsChecklist />
              </div>
            )}

            {activeSection === 'blueprint' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                    <Layers size={18} className="text-sky-400" />
                    <span>ผังขั้นตอนการดำเนินเกม 10 ขั้นตอน</span>
                  </h2>
                  <button
                    onClick={() => {
                      setActiveSection('walkthrough');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-xs text-sky-400 hover:underline"
                  >
                    เปิดบทรายฉาก →
                  </button>
                </div>
                <FlowBlueprint
                  onSelectScene={() => {
                    setActiveSection('walkthrough');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            )}

            {activeSection === 'walkthrough' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                    <BookOpen size={18} className="text-sky-400" />
                    <span>คู่มือดำเนินเกมรายฉาก (Walkthrough)</span>
                  </h2>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    ฉาก 1 - 5 + เฉลย
                  </span>
                </div>
                <SceneWalkthrough />
              </div>
            )}

            {activeSection === 'tools' && (
              <div className="space-y-5 lg:hidden">
                <div className="pb-2 border-b border-zinc-800">
                  <h2 className="text-base font-bold flex items-center gap-2 text-white">
                    <Wrench size={18} className="text-sky-400" />
                    <span>เครื่องมือผู้ดำเนินเกม (DM Toolkit)</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    ตัวจับเวลา BGM และสมุดจดบันทึก
                  </p>
                </div>
                <DMTimer
                  onTimeUpdate={(sec, running) => {
                    setTimerSecondsLeft(sec);
                    setIsTimerRunning(running);
                  }}
                />
                <BGMController />
                <DMNotes />
              </div>
            )}
          </div>

          {/* Desktop Right Sidebar (Persistent DM Companion on large screens) */}
          <aside className="hidden lg:block lg:col-span-4 sticky top-20 space-y-5">
            <DMTimer
              onTimeUpdate={(sec, running) => {
                setTimerSecondsLeft(sec);
                setIsTimerRunning(running);
              }}
            />
            <DMNotes />

            {/* Quick Scene Shortcuts */}
            <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0f12]">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                <Compass size={13} />
                <span>ทางลัดส่วนสำคัญ</span>
              </h4>
              <div className="space-y-1">
                {[
                  { id: 'overview', label: 'หน้าแรก & ตัวละคร' },
                  { id: 'checklist', label: 'เช็คอุปกรณ์ (16 ชิ้น)' },
                  { id: 'blueprint', label: 'ผัง 10 ขั้นตอน' },
                  { id: 'walkthrough', label: 'บทพูด & คดีรายฉาก' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all ${
                      activeSection === item.id
                        ? 'bg-sky-950 text-sky-300 font-bold border border-sky-800/60'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                    }`}
                  >
                    • {item.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Floating Scroll To Top */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-30 p-2.5 rounded-full border border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:text-white shadow-xl active:scale-95 transition-all"
          title="เลื่อนขึ้นบนสุด"
        >
          <ChevronUp size={16} />
        </button>
      )}

      {/* Mobile Tools Modal / Drawer (when clicking timer badge) */}
      {mobileToolsModalOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-md p-3 animate-in fade-in duration-200">
          <div className="w-full max-h-[85vh] overflow-y-auto rounded-3xl p-4 sm:p-5 border border-zinc-800 bg-[#0d0f12] text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-sky-950 text-sky-400">
                  <TimerIcon size={16} />
                </span>
                <h3 className="font-bold text-sm text-white">DM Toolkit</h3>
              </div>
              <button
                onClick={() => setMobileToolsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <DMTimer
              onTimeUpdate={(sec, running) => {
                setTimerSecondsLeft(sec);
                setIsTimerRunning(running);
              }}
            />
            <DMNotes />

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setMobileToolsModalOpen(false)}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-sky-500 text-black hover:bg-sky-400"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile App Bottom Bar (Fixed iOS/Android App Style) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-xl border-t border-zinc-800/90 pb-safe">
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {[
            { id: 'overview', label: 'หน้าแรก', icon: Compass },
            { id: 'checklist', label: 'อุปกรณ์', icon: Package },
            { id: 'blueprint', label: 'ผัง 10 ขั้น', icon: Layers },
            { id: 'walkthrough', label: 'บทรายฉาก', icon: BookOpen },
            { id: 'tools', label: 'เครื่องมือ', icon: Wrench },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSection(tab.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex flex-col items-center justify-center gap-1 h-full py-1 transition-all active:scale-95 ${
                  isActive
                    ? 'text-sky-400 font-bold'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <div
                  className={`p-1 rounded-xl transition-all ${
                    isActive ? 'bg-sky-950/80 text-sky-400' : ''
                  }`}
                >
                  <Icon size={18} />
                </div>
                <span className="text-[10px] tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Minimal Footer */}
      <footer className="mt-auto border-t border-zinc-900 bg-black py-6 text-center text-xs text-zinc-600 no-print">
        <div className="max-w-5xl mx-auto px-4">
          <p className="font-medium text-zinc-500">
            {GAME_METADATA.title} — {GAME_METADATA.subtitle}
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            Minimal OLED Black Edition • Optimized for Mobile DM Hosting
          </p>
        </div>
      </footer>
    </div>
  );
}

export default DecemberSeventhHandbook;
