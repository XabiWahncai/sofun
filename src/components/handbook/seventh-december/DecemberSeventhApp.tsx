import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HeroOverview } from './components/HeroOverview';
import { PropsChecklist } from './components/PropsChecklist';
import { FlowBlueprint } from './components/FlowBlueprint';
import { SceneWalkthrough } from './components/SceneWalkthrough';
import { PuzzleSolver } from './components/PuzzleSolver';
import { DMTimer } from './components/DMTimer';
import { DMNotes } from './components/DMNotes';
import { BGMController } from './components/BGMController';
import { GAME_METADATA } from './data/handbookData';
import {
  PackageCheck,
  Layers,
  BookOpen,
  KeyRound,
  Wrench,
  ChevronUp,
  X,
  Timer as TimerIcon
} from 'lucide-react';

interface DecemberSeventhHandbookProps {
  onBack?: () => void;
}

export function DecemberSeventhHandbook({ onBack }: DecemberSeventhHandbookProps) {
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  // Default to 'walkthrough' for instant mobile game hosting
  const [activeSection, setActiveSection] = useState<string>('walkthrough');
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [mobileToolsModalOpen, setMobileToolsModalOpen] = useState<boolean>(false);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(30 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 280);
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
      className={`min-h-screen bg-black text-zinc-100 flex flex-col selection:bg-rose-950 selection:text-rose-200 ${
        fontSize === 'large' ? 'text-[17px]' : 'text-[15px]'
      }`}
      style={{ backgroundColor: '#000000' }}
    >
      {/* Sticky Minimal Navbar */}
      <Navbar
        fontSize={fontSize}
        setFontSize={setFontSize}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onBack={onBack}
        timerCompactDisplay={
          <button
            onClick={() => setMobileToolsModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 active:scale-95 transition-all"
            title="เปิดเครื่องมือจับเวลา DM"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isTimerRunning ? 'bg-rose-500 animate-pulse' : 'bg-zinc-600'
              }`}
            />
            <span className="font-mono text-xs font-bold text-zinc-200 tracking-wider">
              {String(timerMins).padStart(2, '0')}:{String(timerSecs).padStart(2, '0')}
            </span>
          </button>
        }
      />

      {/* Main Body */}
      <main className="max-w-4xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 flex-1 w-full pb-28 lg:pb-12">
        <div className="space-y-5">
          {/* 1. Walkthrough Tab (Primary DM Tool) */}
          {activeSection === 'walkthrough' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-600" />
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    บทพูดและขั้นตอนดำเนินเกมรายฉาก
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setActiveSection('overview');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  ข้อมูลเรื่อง & ตัวละคร →
                </button>
              </div>
              <SceneWalkthrough
                onJumpToPuzzles={() => {
                  setActiveSection('puzzles');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}

          {/* 2. Puzzles & Decoder Tab */}
          {activeSection === 'puzzles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    ปริศนา 945 & เครื่องจำลอง Black Light
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setActiveSection('walkthrough');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  กลับบทรายฉาก →
                </button>
              </div>
              <PuzzleSolver />
            </div>
          )}

          {/* 3. Props Checklist Tab */}
          {activeSection === 'checklist' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    ตรวจเช็คอุปกรณ์ก่อนเริ่มรอบ (16 รายการ)
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setActiveSection('blueprint');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  ดูผัง 10 ขั้นตอน →
                </button>
              </div>
              <PropsChecklist />
            </div>
          )}

          {/* 4. Blueprint Roadmap Tab */}
          {activeSection === 'blueprint' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    ผังขั้นตอนการดำเนินเกม 10 ขั้น
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setActiveSection('walkthrough');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  เปิดบทพูดฉาก →
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

          {/* 5. DM Tools (BGM, Sound Chimes & Notes) Tab */}
          {activeSection === 'tools' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    เครื่องมือผู้ดำเนินเกม (BGM, ตัวจับเวลา & โน้ต)
                  </h2>
                </div>
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

          {/* 6. Overview & Characters Tab */}
          {activeSection === 'overview' && (
            <div className="space-y-4">
              <HeroOverview
                onNavigate={(sec) => {
                  setActiveSection(sec);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}
        </div>
      </main>

      {/* Floating Scroll To Top */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-30 p-2.5 rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white shadow-xl active:scale-95 transition-all"
          title="เลื่อนขึ้นบนสุด"
        >
          <ChevronUp size={16} />
        </button>
      )}

      {/* Mobile Tools Drawer (Clicking Timer in Navbar) */}
      {mobileToolsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-sm p-3">
          <div className="w-full max-h-[85vh] overflow-y-auto rounded-3xl p-4 sm:p-5 border border-zinc-800 bg-zinc-950 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-zinc-900 text-rose-400">
                  <TimerIcon size={16} />
                </span>
                <h3 className="font-bold text-sm text-white">DM Live Timer & Notes</h3>
              </div>
              <button
                onClick={() => setMobileToolsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-900 text-zinc-400 hover:text-white"
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
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile App Bottom Bar (Pure Minimal OLED Black) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-zinc-900 pb-safe">
        <div className="grid grid-cols-5 h-14 items-center px-1">
          {[
            { id: 'walkthrough', label: 'บทรายฉาก', icon: BookOpen },
            { id: 'puzzles', label: 'ปริศนา 945', icon: KeyRound },
            { id: 'checklist', label: 'อุปกรณ์', icon: PackageCheck },
            { id: 'blueprint', label: 'ผัง 10 ขั้น', icon: Layers },
            { id: 'tools', label: 'เครื่องมือ DM', icon: Wrench },
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
                    ? 'text-white font-bold'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <div
                  className={`p-1 rounded-lg transition-all ${
                    isActive ? 'text-rose-500' : ''
                  }`}
                >
                  <Icon size={17} />
                </div>
                <span className="text-[10px] tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Minimal Footer */}
      <footer className="mt-auto border-t border-zinc-900 bg-black py-5 text-center text-xs text-zinc-600 no-print">
        <div className="max-w-4xl mx-auto px-4">
          <p className="font-medium text-zinc-500">
            {GAME_METADATA.title} — {GAME_METADATA.subtitle}
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            SOFUN CLUB • Minimal OLED Black DM Operating Edition
          </p>
        </div>
      </footer>
    </div>
  );
}

export default DecemberSeventhHandbook;
