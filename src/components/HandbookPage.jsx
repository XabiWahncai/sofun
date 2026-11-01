import { useState, useMemo, useEffect, useCallback } from 'react'
import DecemberSeventhHandbook from './handbook/seventh-december/DecemberSeventhApp'
import { convertImageUrl } from '../utils/imageUrl'
import {
  BookOpen,
  Shield,
  Lock,
  ArrowLeft,
  Search,
  Timer,
  CheckSquare,
  Sparkles,
  Users,
  Clock,
  Flame,
  MapPin,
  ExternalLink,
  Copy,
  RotateCcw,
  FileText,
  Check,
  AlertCircle,
  Play,
  Pause,
  RefreshCw,
  Eye,
} from 'lucide-react'

function normalizeSlug(str) {
  if (!str) return ''
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0E00-\u0E7F-]/g, '')
}

function isSeventhDecember(slug, game) {
  if (game) {
    const gid = game.id || game._id
    const title = game.title || game.name || ''
    if (gid === 'AMy2jBa11D7Vr1mPLgA3' || title.includes('7 ธันวาคม')) return true
  }
  if (!slug) return false
  const s = decodeURIComponent(String(slug)).trim().toLowerCase()
  return (
    s === '7th-december' ||
    s === 'seventh-december' ||
    s === 'the-seventh-of-december' ||
    s === 'amy2jba11d7vr1mplga3' ||
    s.includes('ความลับของวันที่ 7') ||
    s.includes('7 ธันวาคม') ||
    s.includes('7th')
  )
}

function findGameBySlug(slug, allGames = []) {
  if (!slug || !Array.isArray(allGames) || allGames.length === 0) return null
  const decoded = decodeURIComponent(String(slug)).trim()
  const lower = decoded.toLowerCase()
  const norm = normalizeSlug(decoded)

  // Direct ID
  const byId = allGames.find((g) => (g.id || g._id) === decoded)
  if (byId) return byId

  // Direct Title
  const byTitle = allGames.find(
    (g) => (g.title || g.name || '').trim().toLowerCase() === lower
  )
  if (byTitle) return byTitle

  // Normalized
  const byNorm = allGames.find((g) => {
    const t = g.title || g.name || ''
    const en = g.nameEn || g.titleEn || ''
    return normalizeSlug(t) === norm || (en && normalizeSlug(en) === norm)
  })
  if (byNorm) return byNorm

  // Partial match
  return (
    allGames.find((g) => {
      const t = (g.title || g.name || '').toLowerCase()
      return t.includes(lower) || lower.includes(t)
    }) || null
  )
}

// ── Admin Lock Screen ────────────────────────────────────────────────
function AdminLockScreen({ onLogin, showPage }) {
  return (
    <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 text-center shadow-2xl space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-sky-400">
          <Shield size={32} />
        </div>
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-red-950/80 text-red-400 border border-red-800/60">
            <Lock size={12} />
            Staff & DM Only
          </span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            คู่มือ Game Master (DM Handbook)
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            เอกสารในส่วนนี้บรรจุเฉลยคดี ลำดับขั้นตอน ปริศนา และคำแนะนำลับเฉพาะ
            Game Master ประจำร้าน Sofun Club เท่านั้น
            กรุณาเข้าสู่ระบบด้วยบัญชีแอดมินหรือพนักงาน
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2.5">
          {onLogin && (
            <button
              onClick={onLogin}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-black transition-all flex items-center justify-center gap-2 active:scale-98 shadow-lg shadow-sky-500/20"
            >
              <span>เข้าสู่ระบบพนักงาน (LINE Login)</span>
            </button>
          )}
          <button
            onClick={() => showPage('home')}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft size={14} />
            <span>กลับสู่หน้าหลัก</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Generic Game Handbook View ──────────────────────────────────────
function GameHandbookDetail({ game, onBack, showDetail }) {
  const gameId = game.id || game._id || 'unknown'
  const title = game.title || game.name || 'ไม่มีชื่อเกม'
  const nameEn = game.nameEn || game.titleEn || ''
  const coverUrl = game.image || game.coverUrl || '/logo.jpg'
  const players = game.players || game.playerCount || '2-6'
  const time = game.time || game.duration || '3-4 ชั่วโมง'
  const difficulty = game.difficulty || 'Intermediate'
  const room = game.mainRoom || (Array.isArray(game.rooms) ? game.rooms[0] : null) || 'Main Studio'
  const synopsis = game.synopsis || game.description || 'ไม่มีข้อมูลเรื่องย่อ'
  const characters = Array.isArray(game.characters) ? game.characters : []

  // DM Timer
  const [timerSeconds, setTimerSeconds] = useState(60 * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  useEffect(() => {
    let interval = null
    if (timerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0))
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [timerRunning])

  const setTimerPreset = (minutes) => {
    setTimerRunning(false)
    setTimerSeconds(minutes * 60)
  }

  // DM Notes (localStorage)
  const noteKey = `sofun_dm_notes_${gameId}`
  const [notes, setNotes] = useState(() => {
    try {
      return localStorage.getItem(noteKey) || ''
    } catch {
      return ''
    }
  })
  const [copied, setCopied] = useState(false)

  const handleNotesChange = (val) => {
    setNotes(val)
    try {
      localStorage.setItem(noteKey, val)
    } catch {}
  }

  const copyNotes = () => {
    if (!notes) return
    navigator.clipboard?.writeText(notes)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // Staging checklist state
  const checklistKey = `sofun_dm_checklist_${gameId}`
  const defaultChecklist = [
    { id: 'scripts', text: 'แจกสมุดบทละครและแฟ้มประจำตัวผู้เล่นครบทุกคน' },
    { id: 'props', text: 'ตรวจนับพร็อพและเบาะแสในกล่อง/ห้องปริศนา' },
    { id: 'bgm', text: 'เปิดเพลงบรรยากาศ (BGM) และปรับระดับเสียงตามความเหมาะสม' },
    { id: 'lighting', text: 'ปรับไฟห้องให้เข้ากับโทนเรื่องตามมาตรฐานร้าน' },
    { id: 'rule_brief', text: 'บรีฟกติกา ห้ามใช้มือถือ และขั้นตอนการขอเบาะแส' },
    { id: 'timer_start', text: 'เริ่มจับเวลาเฟสแรกของเกม' },
  ]
  const [checkedItems, setCheckedItems] = useState(() => {
    try {
      const saved = localStorage.getItem(checklistKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const toggleChecklist = (id) => {
    setCheckedItems((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(checklistKey, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const timerMins = Math.floor(timerSeconds / 60)
  const timerSecs = timerSeconds % 60

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-16">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-black/95 backdrop-blur-xl border-b border-zinc-800 px-4 h-14 sm:h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors"
            title="กลับหน้ารวมคู่มือ DM"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-sm text-white truncate">{title}</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-sky-950 text-sky-400 border border-sky-800/60 shrink-0">
                DM Briefing
              </span>
            </div>
            {nameEn && (
              <div className="text-[10px] text-zinc-500 truncate">{nameEn}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showDetail && (
            <button
              onClick={() => showDetail(gameId)}
              className="h-8 px-2.5 rounded-xl text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center gap-1.5 transition-colors"
              title="ดูหน้ารายละเอียดเกมสำหรับลูกค้า"
            >
              <Eye size={13} />
              <span className="hidden sm:inline">ดูหน้าร้าน</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Info (Col 8) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Hero Card */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div className="w-28 sm:w-36 aspect-[3/4] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0 shadow-lg">
                  <img
                    src={convertImageUrl(coverUrl, 400)}
                    alt={title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      {title}
                    </h1>
                    {nameEn && (
                      <p className="text-xs text-zinc-400 mt-0.5">{nameEn}</p>
                    )}
                  </div>

                  {/* Meta Chips */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                      <Users size={12} className="text-sky-400" />
                      {players} คน
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                      <Clock size={12} className="text-sky-400" />
                      {time}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                      <Flame size={12} className="text-amber-400" />
                      {difficulty}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                      <MapPin size={12} className="text-emerald-400" />
                      {room}
                    </span>
                  </div>

                  {/* Tags */}
                  {Array.isArray(game.tags) && game.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {game.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800/80 font-mono"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Story & DM Briefing */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <BookOpen size={16} className="text-sky-400" />
                <span>เรื่องย่อและภูมิหลังคดี (Story Synopsis)</span>
              </div>
              <div className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line bg-zinc-900/50 p-4 rounded-xl border border-zinc-900">
                {synopsis}
              </div>
            </div>

            {/* Characters Section */}
            {characters.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Users size={16} className="text-sky-400" />
                    <span>บทตัวละครในคดี ({characters.length} คน)</span>
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    Character Cast
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {characters.map((char, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80"
                    >
                      <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700/60">
                        {char.image ? (
                          <img
                            src={convertImageUrl(char.image, 160)}
                            alt={char.name || `ตัวละคร ${idx + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold text-xs">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-white truncate">
                          {char.name || `ตัวละคร ${idx + 1}`}
                        </div>
                        {char.role && (
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {char.role}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DM Staging Checklist */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <CheckSquare size={16} className="text-emerald-400" />
                  <span>Checklist ก่อนปล่อยผู้เล่นเข้าห้อง</span>
                </div>
                <button
                  onClick={() => {
                    setCheckedItems({})
                    try {
                      localStorage.removeItem(checklistKey)
                    } catch {}
                  }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 font-mono flex items-center gap-1"
                >
                  <RotateCcw size={11} />
                  รีเซ็ต
                </button>
              </div>

              <div className="space-y-2">
                {defaultChecklist.map((item) => {
                  const isDone = !!checkedItems[item.id]
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleChecklist(item.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isDone
                          ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                          : 'bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-900'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-all ${
                          isDone
                            ? 'bg-emerald-500 border-emerald-500 text-black'
                            : 'border-zinc-600 bg-zinc-800'
                        }`}
                      >
                        {isDone && <Check size={12} strokeWidth={3} />}
                      </div>
                      <span
                        className={`text-xs leading-relaxed ${
                          isDone ? 'line-through text-zinc-500' : ''
                        }`}
                      >
                        {item.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* DM Live Tools (Col 4) */}
          <div className="lg:col-span-4 space-y-6">
            {/* DM Live Timer */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 space-y-4 sticky top-20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                  <Timer size={14} className="text-sky-400" />
                  <span>DM Live Timer</span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500">
                  {timerRunning ? 'RUNNING' : 'PAUSED'}
                </div>
              </div>

              {/* Timer Display */}
              <div className="bg-black border border-zinc-900 rounded-xl p-4 text-center">
                <div className="font-mono text-4xl font-extrabold text-white tracking-widest">
                  {String(timerMins).padStart(2, '0')}:
                  {String(timerSecs).padStart(2, '0')}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">เวลาในฉากปัจจุบัน</div>
              </div>

              {/* Timer Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTimerRunning(!timerRunning)}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    timerRunning
                      ? 'bg-amber-500 hover:bg-amber-400 text-black'
                      : 'bg-sky-500 hover:bg-sky-400 text-black'
                  }`}
                >
                  {timerRunning ? <Pause size={14} /> : <Play size={14} />}
                  <span>{timerRunning ? 'พักเวลา' : 'เริ่มจับเวลา'}</span>
                </button>
                <button
                  onClick={() => {
                    setTimerRunning(false)
                    setTimerSeconds(60 * 60)
                  }}
                  className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all"
                  title="รีเซ็ตเวลา"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-3 gap-1.5">
                {[30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setTimerPreset(mins)}
                    className="py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[11px] font-mono text-zinc-400 hover:text-white border border-zinc-800"
                  >
                    {mins} น.
                  </button>
                ))}
              </div>

              {/* DM Live Scratchpad */}
              <div className="pt-3 border-t border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileText size={13} className="text-sky-400" />
                    โน้ตสดย่อหน้าโต๊ะ
                  </span>
                  <button
                    onClick={copyNotes}
                    className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 font-mono"
                  >
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="จดเวลาที่ผู้เล่นขอเบาะแส พฤติกรรม หรือสถิติรอบนี้..."
                  rows={4}
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

// ── Main Handbook Hub / Directory ───────────────────────────────────
function HandbookHub({ allGames = [], onSelectGame, showDetail }) {
  const [search, setSearch] = useState('')
  const [playerFilter, setPlayerFilter] = useState('all')

  const seventhGame = useMemo(() => {
    return allGames.find(
      (g) => (g.id || g._id) === 'AMy2jBa11D7Vr1mPLgA3' || (g.title || g.name || '').includes('7 ธันวาคม')
    )
  }, [allGames])

  const filteredGames = useMemo(() => {
    return allGames.filter((g) => {
      const title = (g.title || g.name || '').toLowerCase()
      const titleEn = (g.titleEn || g.nameEn || '').toLowerCase()
      const s = search.trim().toLowerCase()
      const matchesSearch = !s || title.includes(s) || titleEn.includes(s)

      if (!matchesSearch) return false

      if (playerFilter === '2') {
        const p = String(g.players || g.playerCount || '')
        return p.includes('2') && !p.includes('5') && !p.includes('6')
      }
      if (playerFilter === '3-5') {
        const p = String(g.players || g.playerCount || '')
        return p.includes('3') || p.includes('4') || p.includes('5')
      }
      if (playerFilter === '6+') {
        const p = String(g.players || g.playerCount || '')
        return p.includes('6') || p.includes('7') || p.includes('8') || p.includes('9')
      }
      return true
    })
  }, [allGames, search, playerFilter])

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-20">
      {/* Header Banner */}
      <div className="border-b border-zinc-900 bg-gradient-to-b from-zinc-950 to-black py-8 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-sky-950 text-sky-400 border border-sky-800/60">
              <Shield size={12} />
              DM Internal System
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              คลังคู่มือ {allGames.length} เกม
            </span>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <BookOpen size={26} className="text-sky-400" />
              <span>คู่มือ Game Master (DM Handbook)</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              ศูนย์รวมบทและแอปพลิเคชันช่วยรันเกม ผังขั้นตอน ปริศนา
              และการควบคุมเสียงประกอบสำหรับ Game Master ประจำร้าน Sofun Club
            </p>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อเกม ภาษาไทย / English / แท็ก..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'ทั้งหมด' },
                { id: '2', label: '2 คน' },
                { id: '3-5', label: '3-5 คน' },
                { id: '6+', label: '6+ คน' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setPlayerFilter(tab.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    playerFilter === tab.id
                      ? 'bg-zinc-800 text-sky-400 border border-zinc-700 font-bold'
                      : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Featured Card: ความลับของวันที่ 7 ธันวาคม */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} />
              Interactive DM Companion • มีแอปช่วยรันเต็มรูปแบบ
            </span>
            <span className="text-[11px] text-zinc-500 font-mono">Ver 1.0</span>
          </div>

          <div
            onClick={() => onSelectGame('7th-december')}
            className="group relative bg-gradient-to-br from-zinc-950 via-zinc-900 to-black border border-sky-900/40 hover:border-sky-500/60 rounded-2xl p-5 sm:p-6 cursor-pointer transition-all shadow-xl hover:shadow-sky-500/10"
          >
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <div className="w-24 sm:w-32 aspect-[3/4] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0 shadow-md">
                <img
                  src="/cover.jpg"
                  alt="ความลับของวันที่ 7 ธันวาคม"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-sky-950 text-sky-300 border border-sky-800/80">
                    Full Companion App
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                    2 Players • 3-4 Hours
                  </span>
                </div>

                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white group-hover:text-sky-300 transition-colors">
                    ความลับของวันที่ 7 ธันวาคม
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    The Seventh of December • 7/12 Mystery
                  </p>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                  เรื่องราวของคนแปลกหน้าสองคนที่ถูกโชคชะตานำพามาสู่ห้องปริศนา
                  พร้อมแฟ้มคดี 7/12 และกล่องแห่งความทรงจำ
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <div className="text-[11px] text-zinc-400 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-sky-400">
                      <CheckSquare size={13} /> ผัง 10 ขั้น
                    </span>
                    <span className="flex items-center gap-1 text-sky-400">
                      <Sparkles size={13} /> จำลองไฟ Blacklight
                    </span>
                    <span className="flex items-center gap-1 text-sky-400">
                      <Timer size={13} /> BGM & Timer
                    </span>
                  </div>
                </div>
              </div>

              <div className="sm:self-center shrink-0">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-sky-500 group-hover:bg-sky-400 text-black flex items-center gap-1.5 transition-all shadow-md"
                >
                  <span>เปิดคู่มือรันเกม</span>
                  <ArrowLeft size={13} className="rotate-180" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* All Games Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <BookOpen size={16} className="text-zinc-400" />
              <span>คู่มือและข้อมูลสรุปคดีประจำร้าน ({filteredGames.length})</span>
            </h3>
          </div>

          {filteredGames.length === 0 ? (
            <div className="text-center py-12 bg-zinc-950 border border-zinc-900 rounded-2xl p-6 space-y-2">
              <AlertCircle size={24} className="mx-auto text-zinc-600" />
              <div className="text-xs text-zinc-400 font-medium">
                ไม่พบเกมที่ค้นหา
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGames.map((game) => {
                const gid = game.id || game._id
                const title = game.title || game.name || 'ไม่มีชื่อเกม'
                const nameEn = game.nameEn || game.titleEn || ''
                const cover = game.image || game.coverUrl || '/logo.jpg'
                const players = game.players || game.playerCount || '2-6'
                const time = game.time || game.duration || '3-4 ชม.'
                const is7th = isSeventhDecember(null, game)

                return (
                  <div
                    key={gid}
                    onClick={() =>
                      is7th
                        ? onSelectGame('7th-december')
                        : onSelectGame(gid)
                    }
                    className="group bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-3.5 flex gap-3 cursor-pointer transition-all hover:bg-zinc-900/50"
                  >
                    <div className="w-16 h-22 rounded-xl bg-zinc-900 overflow-hidden shrink-0 border border-zinc-800">
                      <img
                        src={convertImageUrl(cover, 240)}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          {is7th ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-sky-950 text-sky-400 border border-sky-800/60">
                              Companion App
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                              DM Briefing
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-xs text-white truncate group-hover:text-sky-300 transition-colors">
                          {title}
                        </h4>
                        {nameEn && (
                          <div className="text-[10px] text-zinc-500 truncate">
                            {nameEn}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-2">
                        <span className="flex items-center gap-1">
                          <Users size={11} className="text-zinc-500" />
                          {players} คน
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} className="text-zinc-500" />
                          {time}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// ── Root HandbookPage Export ─────────────────────────────────────────
export default function HandbookPage({
  lineUser,
  isEffectiveAdmin,
  allGames = [],
  handbookSlug = null,
  showPage,
  showDetail,
  onLogin,
  showToast,
}) {
  // Check authorization
  if (!isEffectiveAdmin) {
    return <AdminLockScreen onLogin={onLogin} showPage={showPage} />
  }

  // Check if specific game slug is requested
  const matchedGame = useMemo(() => {
    return findGameBySlug(handbookSlug, allGames)
  }, [handbookSlug, allGames])

  const is7th = useMemo(() => {
    return isSeventhDecember(handbookSlug, matchedGame)
  }, [handbookSlug, matchedGame])

  // Case 1: 7th December interactive handbook app
  if (is7th) {
    return (
      <DecemberSeventhHandbook
        onBack={() => showPage('handbook')}
      />
    )
  }

  // Case 2: Specific game briefing for any other store game
  if (handbookSlug && matchedGame) {
    return (
      <GameHandbookDetail
        game={matchedGame}
        onBack={() => showPage('handbook')}
        showDetail={showDetail}
      />
    )
  }

  // Case 3: Slug requested but game not found
  if (handbookSlug && !matchedGame) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-amber-400">
            <AlertCircle size={24} />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">ไม่พบคู่มือเกมที่ระบุ</h2>
            <p className="text-xs text-zinc-400">
              ไม่พบเกมรหัส "{handbookSlug}" ในระบบฐานข้อมูลของร้าน Sofun Club
            </p>
          </div>
          <button
            onClick={() => showPage('handbook')}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center justify-center gap-2"
          >
            <ArrowLeft size={14} />
            <span>กลับสู่หน้ารวมคู่มือ DM</span>
          </button>
        </div>
      </div>
    )
  }

  // Case 4: Default Handbook Hub / Directory
  return (
    <HandbookHub
      allGames={allGames}
      onSelectGame={(slugOrId) => showPage('handbook', slugOrId)}
      showDetail={showDetail}
    />
  )
}
