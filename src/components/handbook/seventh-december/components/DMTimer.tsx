import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Plus, Minus, Timer } from 'lucide-react';

interface DMTimerProps {
  onTimeUpdate?: (secondsLeft: number, isRunning: boolean) => void;
  compact?: boolean;
}

export const DMTimer = ({ onTimeUpdate, compact = false }: DMTimerProps) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(30 * 60);
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

  const toggleRun = () => setIsRunning(!isRunning);

  const resetTo = (sec: number) => {
    setIsRunning(false);
    setSecondsLeft(sec);
  };

  const addMinutes = (mins: number) => {
    setSecondsLeft((prev) => Math.max(0, prev + mins * 60));
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 text-zinc-100 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded-md bg-zinc-900 text-rose-400 border border-zinc-800">
            <Timer size={14} />
          </span>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            ตัวจับเวลาคุมโต๊ะ (DM Countdown)
          </h4>
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            soundEnabled ? 'text-zinc-400 hover:text-white' : 'text-zinc-600'
          }`}
          title={soundEnabled ? 'ปิดเสียงเตือน' : 'เปิดเสียงเตือน'}
        >
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
      </div>

      {/* Big Digital Countdown */}
      <div className="flex items-center justify-center my-3">
        <div className="font-mono text-4xl sm:text-5xl font-black tracking-widest text-white px-5 py-2 rounded-2xl bg-black border border-zinc-900 shadow-inner">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
      </div>

      {/* Preset Pills */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {[
          { label: '30 นาที', sec: 30 * 60 },
          { label: '20 นาที', sec: 20 * 60 },
          { label: '10 นาที', sec: 10 * 60 },
          { label: '+5 นาที', add: 5 },
          { label: '-5 นาที', add: -5 },
        ].map((btn, i) => (
          <button
            key={i}
            onClick={() => {
              if (btn.sec !== undefined) resetTo(btn.sec);
              if (btn.add !== undefined) addMinutes(btn.add);
            }}
            className="py-1.5 rounded-lg text-[11px] font-mono font-medium bg-zinc-900 border border-zinc-850 text-zinc-300 hover:text-white hover:border-zinc-700 active:scale-95 transition-all text-center"
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleRun}
          className={`flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all ${
            isRunning
              ? 'bg-amber-500 text-black hover:bg-amber-400'
              : 'bg-white text-black hover:bg-zinc-200'
          }`}
        >
          {isRunning ? <Pause size={14} /> : <Play size={14} />}
          <span>{isRunning ? 'หยุดชั่วคราว' : 'เริ่มจับเวลา'}</span>
        </button>

        <button
          onClick={() => resetTo(30 * 60)}
          className="h-10 px-3 rounded-xl text-xs bg-zinc-900 border border-zinc-850 text-zinc-400 hover:text-white active:scale-95 transition-all flex items-center gap-1"
          title="รีเซ็ตกลับ 30 นาที"
        >
          <RotateCcw size={14} />
          <span>รีเซ็ต</span>
        </button>
      </div>
    </div>
  );
};
