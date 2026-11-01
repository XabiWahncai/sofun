import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Minus, Bell } from 'lucide-react';

interface DMTimerProps {
  onTimeUpdate?: (secondsLeft: number, isRunning: boolean) => void;
  compact?: boolean;
}

export const DMTimer = ({ onTimeUpdate, compact = false }: DMTimerProps) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(30 * 60);
  const [initialSeconds, setInitialSeconds] = useState<number>(30 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const timerRef = useRef<number | null>(null);

  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch {
      // AudioContext unavailable
    }
  };

  useEffect(() => {
    if (isRunning) {
      timerRef.current = window.setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsRunning(false);
            playBeep();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, soundEnabled]);

  useEffect(() => {
    if (onTimeUpdate) {
      onTimeUpdate(secondsLeft, isRunning);
    }
  }, [secondsLeft, isRunning, onTimeUpdate]);

  const setPreset = (minutes: number) => {
    setIsRunning(false);
    setInitialSeconds(minutes * 60);
    setSecondsLeft(minutes * 60);
  };

  const adjustMinutes = (delta: number) => {
    setSecondsLeft((prev) => Math.max(0, prev + delta * 60));
  };

  const resetTimer = () => {
    setIsRunning(false);
    setSecondsLeft(initialSeconds);
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const progress = initialSeconds > 0 ? ((initialSeconds - secondsLeft) / initialSeconds) * 100 : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-full">
        <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
        <span className="font-mono text-xs font-bold text-white tracking-wider">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="p-1 rounded-full text-zinc-300 hover:text-white transition-colors"
        >
          {isRunning ? <Pause size={12} /> : <Play size={12} />}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-5 shadow-2xl relative overflow-hidden">
      {/* Background glow when running */}
      {isRunning && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-sky-400 animate-ping' : 'bg-zinc-600'}`} />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <Bell size={13} />
            <span>DM Stage Timer</span>
          </h4>
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-1.5 rounded-lg text-xs hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title={soundEnabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
        >
          {soundEnabled ? <Volume2 size={15} className="text-emerald-400" /> : <VolumeX size={15} />}
        </button>
      </div>

      {/* Digits Display */}
      <div className="text-center my-3">
        <div className="font-mono text-4xl sm:text-5xl font-light tracking-wider text-white drop-shadow-[0_0_12px_rgba(56,189,248,0.25)]">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
        <div className="w-full bg-zinc-800/80 h-1.5 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-amber-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Main Touch Controls */}
      <div className="grid grid-cols-4 gap-2 my-4">
        <button
          onClick={() => adjustMinutes(-1)}
          className="h-11 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 active:scale-95 text-zinc-300 flex items-center justify-center transition-all"
          title="-1 นาที"
        >
          <Minus size={16} />
        </button>

        <button
          onClick={() => setIsRunning(!isRunning)}
          className={`col-span-2 h-11 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg ${
            isRunning
              ? 'bg-amber-500 hover:bg-amber-600 text-black font-bold shadow-amber-500/20'
              : 'bg-sky-500 hover:bg-sky-600 text-black font-bold shadow-sky-500/20'
          }`}
        >
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
          <span>{isRunning ? 'หยุดชั่วคราว' : 'เริ่มจับเวลา'}</span>
        </button>

        <button
          onClick={resetTimer}
          className="h-11 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 active:scale-95 text-zinc-300 flex items-center justify-center transition-all"
          title="รีเซ็ต"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Quick Presets Grid (Mobile Touch Friendly) */}
      <div className="grid grid-cols-4 gap-1.5 pt-3 border-t border-zinc-800/80">
        {[
          { label: '30 นาที', m: 30, desc: 'ฉาก 1' },
          { label: '20 นาที', m: 20, desc: 'ฉาก 2' },
          { label: '20 นาที', m: 20, desc: 'ฉาก 3' },
          { label: '10 นาที', m: 10, desc: 'ฉาก 4' },
        ].map((item, idx) => (
          <button
            key={idx}
            onClick={() => setPreset(item.m)}
            className={`py-2 px-1 rounded-xl text-center transition-all active:scale-95 border ${
              initialSeconds === item.m * 60
                ? 'bg-sky-950/80 border-sky-600 text-sky-300 font-semibold shadow-inner'
                : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <div className="text-xs font-mono font-medium">{item.label}</div>
            <div className="text-[10px] text-zinc-500">{item.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
