import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  doc, onSnapshot, setDoc, updateDoc, getDoc,
  collection, query, where, getDocs, serverTimestamp, deleteField,
} from 'firebase/firestore'
import { db } from '../firebase'
import { QRCodeSVG } from 'qrcode.react'
import { Html5Qrcode } from 'html5-qrcode'
import emergencyMeetingAudioUrl from '../assets/emergency-meeting.mp3'
import sabotageAlertAudioUrl from '../assets/sabotage-alert.mp3'

// ── Web Audio Sound Synthesis (Zero external dependencies) ───
let audioCtx = null
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) audioCtx = new AudioContextClass()
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

let sabotageAudio = null
function getSabotageAudio() {
  if (typeof Audio === 'undefined') return null
  if (!sabotageAudio) {
    sabotageAudio = new Audio(sabotageAlertAudioUrl)
    sabotageAudio.preload = 'auto'
    sabotageAudio.loop = true
  }
  return sabotageAudio
}

let sabotageSynthInterval = null
function playSabotageAlarmSynth() {
  stopSabotageAlarmSynth()
  const beep = () => {
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.3)
      gain.gain.setValueAtTime(0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.31)
    } catch {}
  }
  beep()
  sabotageSynthInterval = setInterval(beep, 600)
}

function stopSabotageAlarmSynth() {
  if (sabotageSynthInterval) {
    clearInterval(sabotageSynthInterval)
    sabotageSynthInterval = null
  }
}

function playSabotageAlarm() {
  try {
    const audio = getSabotageAudio()
    if (audio) {
      audio.loop = true
      audio.currentTime = 0
      audio.play().catch(() => {
        playSabotageAlarmSynth()
      })
    } else {
      playSabotageAlarmSynth()
    }
  } catch {
    playSabotageAlarmSynth()
  }
}

function stopSabotageAlarm() {
  try {
    if (sabotageAudio) {
      sabotageAudio.pause()
      sabotageAudio.currentTime = 0
    }
  } catch {}
  stopSabotageAlarmSynth()
}

function playAlarmSound() {
  playSabotageAlarm()
}

let meetingAudio = null
function getMeetingAudio() {
  if (typeof Audio === 'undefined') return null
  if (!meetingAudio) {
    meetingAudio = new Audio(emergencyMeetingAudioUrl)
    meetingAudio.preload = 'auto'
  }
  return meetingAudio
}

function playMeetingBuzzer() {
  try {
    const audio = getMeetingAudio()
    if (audio) {
      audio.currentTime = 0
      audio.play().catch(() => {
        playMeetingBuzzerSynth()
      })
    } else {
      playMeetingBuzzerSynth()
    }
  } catch {
    playMeetingBuzzerSynth()
  }
}

function stopMeetingBuzzer() {
  try {
    if (meetingAudio) {
      meetingAudio.pause()
      meetingAudio.currentTime = 0
    }
  } catch {}
}

function playMeetingBuzzerSynth() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.setValueAtTime(330, now + 0.2)
    osc.frequency.setValueAtTime(220, now + 0.4)
    gain.gain.setValueAtTime(0.4, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.72)
  } catch {}
}

function playTaskSuccessSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, now) // C5
    osc.frequency.setValueAtTime(659.25, now + 0.12) // E5
    osc.frequency.setValueAtTime(783.99, now + 0.24) // G5
    gain.gain.setValueAtTime(0.25, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.52)
  } catch {}
}

function playVictoryFanfare(isEvil) {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const notes = isEvil ? [440, 415, 392, 349] : [523.25, 659.25, 783.99, 1046.50]
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + idx * 0.18)
      gain.gain.setValueAtTime(0.25, now + idx * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + idx * 0.18)
      osc.stop(now + idx * 0.18 + 0.36)
    })
  } catch {}
}

// ── 20 Distinct Character Colors (Zero Duplicates Policy) ──
export const TWENTY_PLAYER_COLORS = [
  { id: 'red', hex: '#c62828', name: 'แดง' },
  { id: 'blue', hex: '#1565c0', name: 'น้ำเงิน' },
  { id: 'green', hex: '#2e7d32', name: 'เขียว' },
  { id: 'pink', hex: '#e91e63', name: 'ชมพู' },
  { id: 'orange', hex: '#ef6c00', name: 'ส้ม' },
  { id: 'yellow', hex: '#fbc02d', name: 'เหลือง', darkText: true },
  { id: 'black', hex: '#212121', name: 'ดำ' },
  { id: 'white', hex: '#eceff1', name: 'ขาว', darkText: true },
  { id: 'purple', hex: '#6a1b9a', name: 'ม่วง' },
  { id: 'brown', hex: '#4e342e', name: 'น้ำตาล' },
  { id: 'cyan', hex: '#00acc1', name: 'ฟ้าคราม' },
  { id: 'lime', hex: '#7cb342', name: 'เขียวมะนาว', darkText: true },
  { id: 'maroon', hex: '#880e4f', name: 'เลือดหมู' },
  { id: 'rose', hex: '#f06292', name: 'กุหลาบ' },
  { id: 'banana', hex: '#fff176', name: 'เหลืองกล้วย', darkText: true },
  { id: 'gray', hex: '#78909c', name: 'เทา' },
  { id: 'tan', hex: '#d7ccc8', name: 'เนื้อ', darkText: true },
  { id: 'coral', hex: '#ff7043', name: 'คอรัล' },
  { id: 'mint', hex: '#4db6ac', name: 'มิ้นท์' },
  { id: 'lavender', hex: '#b39ddb', name: 'ลาเวนเดอร์', darkText: true },
]

export function TwentyColorPalette({ selectedColor, players = {}, currentUid, onSelect }) {
  const takenMap = useMemo(() => {
    const map = {}
    Object.values(players || {}).forEach(p => {
      if (p.color) {
        const hex = p.color.toLowerCase()
        if (p.uid !== currentUid) {
          map[hex] = p
        }
      }
    })
    return map
  }, [players, currentUid])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10,
      }}>
        {TWENTY_PLAYER_COLORS.map(c => {
          const hex = c.hex.toLowerCase()
          const isSelected = selectedColor?.toLowerCase() === hex
          const takenBy = takenMap[hex]
          const isTaken = Boolean(takenBy)

          return (
            <button
              key={c.id}
              type="button"
              disabled={isTaken}
              onClick={() => {
                if (isTaken) return
                onSelect(c.hex)
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                padding: '9px 4px 7px',
                borderRadius: 14,
                background: isSelected
                  ? 'rgba(255, 255, 255, 0.14)'
                  : (isTaken ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.04)'),
                border: isSelected
                  ? `2.5px solid ${c.hex}`
                  : (isTaken ? '1.5px dashed rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.1)'),
                boxShadow: isSelected ? `0 0 14px ${c.hex}66` : 'none',
                cursor: isTaken ? 'not-allowed' : 'pointer',
                opacity: isTaken ? 0.45 : 1,
                position: 'relative',
                transition: 'all 0.15s ease',
              }}
              title={isTaken ? `มีคนเลือกแล้วโดย ${takenBy.name}` : c.name}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: c.hex,
                border: isSelected ? '2.5px solid #fff' : '2px solid rgba(0,0,0,0.3)',
                boxShadow: isSelected ? `0 0 10px ${c.hex}` : '0 2px 5px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isSelected && (
                  <i className="fas fa-check" style={{ color: c.darkText ? '#111' : '#fff', fontSize: 16 }} />
                )}
                {isTaken && !isSelected && (
                  <i className="fas fa-check" style={{ color: c.darkText ? '#333' : '#fff', fontSize: 14, opacity: 0.8 }} />
                )}
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: isSelected ? 800 : 600,
                color: isSelected ? '#fff' : (isTaken ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.75)'),
                textAlign: 'center',
                lineHeight: 1.1,
              }}>
                {c.name}
              </span>
              {isTaken && (
                <span style={{
                  fontSize: 8.5,
                  fontWeight: 700,
                  color: '#ff8a80',
                  lineHeight: 1,
                  maxWidth: 60,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {takenBy.name}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Among Us Visor / Crewmate Bean Component ────────────
export function AmongUsVisor({ role = 'crewmate', isAlive = true, size = 38, color = null }) {
  const visorWidth = Math.round(size * 0.95)
  const visorHeight = Math.round(size * 1.1)

  const defaultBody = !isAlive
    ? '#78909c'
    : role === 'impostor'
    ? '#c51111'
    : role === 'dodo'
    ? '#8e24aa'
    : role === 'sheriff'
    ? '#fbc02d'
    : '#0288d1'

  const bodyColor = color || defaultBody

  const shadowColor = !isAlive
    ? '#455a64'
    : color
    ? '#000000'
    : role === 'impostor'
    ? '#7a0813'
    : role === 'dodo'
    ? '#4a148c'
    : role === 'sheriff'
    ? '#f57f17'
    : '#01579b'

  return (
    <div
      style={{
        width: visorWidth,
        height: visorHeight,
        borderRadius: '45% 45% 40% 40%',
        background: `radial-gradient(circle at 40% 30%, ${bodyColor} 60%, ${shadowColor} 100%)`,
        border: '2.5px solid #0a0e17',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        boxShadow: 'inset -2px -4px 0 rgba(0,0,0,0.35), 0 3px 6px rgba(0,0,0,0.4)',
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    >
      {isAlive ? (
        // Glass Visor with Specular Highlight
        <div
          style={{
            width: '68%',
            height: '42%',
            borderRadius: 14,
            background: 'linear-gradient(180deg, #b2fcf3 0%, #38fedc 45%, #00838f 100%)',
            border: '2px solid #0a0e17',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.9)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 1,
              left: 2,
              width: '50%',
              height: '38%',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.9)',
            }}
          />
        </div>
      ) : (
        // Ghost Mode Icon
        <div style={{ color: '#eceff1', fontSize: Math.round(size * 0.45) }}>
          <i className="fas fa-ghost" />
        </div>
      )}

      {/* Sheriff Golden Star Pin */}
      {isAlive && role === 'sheriff' && (
        <i
          className="fas fa-star"
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            fontSize: Math.max(9, Math.round(size * 0.3)),
            color: '#ffd54f',
            textShadow: '0 0 3px rgba(0,0,0,0.8)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}

// ── Building Floors and Room Locations ─────────────────
export const BUILDING_FLOORS = [
  { floor: 1, label: 'ชั้น 1', rooms: ['โซนหน้า', 'ห้องแต่งตัว', 'โซนหลัง'] },
  { floor: 2, label: 'ชั้น 2', rooms: ['โถงทางเดิน', 'ห้องญี่ปุ่น'] },
  { floor: 3, label: 'ชั้น 3', rooms: ['ห้องจีน', 'โถงทางเดิน', 'ห้องยุโรป'] },
  { floor: 4, label: 'ชั้น 4', rooms: ['ห้องผี', 'โถงทางเดิน', 'ห้องแคบ'] },
  { floor: 5, label: 'ชั้น 5', rooms: ['ห้องวินเทจ', 'ห้องโปรเจคเตอร์'] },
]

// ── Default Sabotages Pool ─────────────────────────────
export const DEFAULT_SABOTAGE_POOL = [
  { id: 'sab_lights', title: 'ไฟดับ (Lights Out)', desc: 'ลดการมองเห็น คนดีต้องรีบไปแก้ปัญหากับแอดมินที่เคาน์เตอร์', countdownSeconds: 90, timeoutAction: 'continue' },
  { id: 'sab_o2', title: 'อากาศรั่ว (O2 Depletion)', desc: 'มีเวลานับถอยหลัง คนดีต้องรีบไปกู้สถานการณ์กับแอดมิน', countdownSeconds: 90, timeoutAction: 'end_game' },
  { id: 'sab_doors', title: 'ประตูล็อค (Doors Locked)', desc: 'ประตูปิดกั้น คนดีต้องช่วยกันเคลียร์ทางกับแอดมิน', countdownSeconds: 90, timeoutAction: 'continue' },
  { id: 'sab_comms', title: 'ป่วนระบบสื่อสาร (Comms Jammed)', desc: 'แถบความคืบหน้าภารกิจจะถูกซ่อนชั่วคราว', countdownSeconds: 90, timeoutAction: 'continue' },
]

// ── Default Tasks Pool for Real Life Boardgame Cafe ───
export const DEFAULT_TASKS_POOL = [
  // Floor 1 (4 tasks)
  { id: 't_1792141608337', title: 'เรียงเกม', desc: 'เรียงเกมตามหลักพจนานุกรมให้หน่อยนะ', floor: 1, room: 'โซนหน้า', maxAssignedCount: 1 },
  { id: 't_1792141723910', title: 'india game', desc: 'เรียงป๋อง', floor: 1, room: 'โซนหน้า', maxAssignedCount: 3 },
  { id: 't_1792405836582', title: 'dress impress', desc: 'แต่งตัวตามใจฉัน', floor: 1, room: 'ห้องแต่งตัว', maxAssignedCount: 3 },
  { id: 't_1792406781996', title: 'เกมนี้ใช้หัวเล่น', desc: 'ทำภารกิจให้สำเร็จและให้แอดมินสแกนยืนยัน', floor: 1, room: 'โซนหน้า', maxAssignedCount: 3 },

  // Floor 2 (4 tasks)
  { id: 't_1792140868891', title: 'Dice ไหม', desc: 'ทอยลูกเต๋า ให้ได้ผลรวมมากกว่า 10 แต้ม', floor: 2, room: 'ห้องญี่ปุ่น', maxAssignedCount: 3 },
  { id: 't_1792141070591', title: 'Nut\'s Yes', desc: 'แยกถั่วเขียวออกจากถั่วดำ', floor: 2, room: 'ห้องญี่ปุ่น', maxAssignedCount: 3 },
  { id: 't_1792141159126', title: 'โกโกวาหมากเก็บ', desc: 'ลุ้นเอา555', floor: 2, room: 'ห้องญี่ปุ่น', maxAssignedCount: 3 },
  { id: 't_1792413517992', title: 'Titanic', desc: 'แช่น้ำเย็นๆ ชื่นใจ', floor: 2, room: 'โถงทางเดิน', maxAssignedCount: 3 },

  // Floor 3 (5 tasks)
  { id: 't_1792141131072', title: 'Rubik', desc: 'แก้ รูบิค', floor: 3, room: 'ห้องจีน', maxAssignedCount: 1 },
  { id: 't_1792141204443', title: 'สีสันบันเทิง', desc: 'ทายสีให้ถูก', floor: 3, room: 'ห้องจีน', maxAssignedCount: 3 },
  { id: 't_1792141452064', title: 'Davinci Code', desc: 'ถอดรหัสลับ อัจฉริยะ', floor: 3, room: 'ห้องจีน', maxAssignedCount: 3 },
  { id: 't_1792307270299', title: 'ขวดหกคะเมนตีลังกา', desc: 'ทำภารกิจให้สำเร็จและให้แอดมินสแกนยืนยัน', floor: 3, room: 'โถงทางเดิน', maxAssignedCount: 3 },
  { id: 't_1792406727706', title: 'ไม่นะ! ซีอิ๋วหายไป!', desc: 'ไปรับภารกิจจาก Dm AJ', floor: 3, room: 'ห้องยุโรป', maxAssignedCount: 3 },

  // Floor 4 (4 tasks)
  { id: 't_1792310392031', title: 'ดนตรีนั้นคือชีวิต', desc: 'ทดสอบจังหวะในหัวใจ', floor: 4, room: 'ห้องผี', maxAssignedCount: 3 },
  { id: 't_1792310774935', title: 'สืบสัตว์', desc: 'หาคนร้ายจาเหล่าเฟอร์รี่หน้าขน', floor: 4, room: 'ห้องผี', maxAssignedCount: 3 },
  { id: 't_1792311172049', title: 'หรีเสียง', desc: 'จัดเรียงและแยกสีชิปจากในกองให้ครบ', floor: 4, room: 'โถงทางเดิน', maxAssignedCount: 3 },
  { id: 't_1792406637497', title: 'Shot me if you can', desc: 'รับโจทย์จาก DM Fune และกลับมาส่งภารกิจ', floor: 4, room: 'ห้องผี', maxAssignedCount: 3 },

  // Floor 5 (4 tasks)
  { id: 't_1792141240476', title: 'แคทเทอรีนยิงมัน', desc: 'ยิงพี่ฟินิกซ์ให้ร่วง', floor: 5, room: 'ห้องวินเทจ', maxAssignedCount: 3 },
  { id: 't_1792141535726', title: 'เกมนี้เราใช้หัวเล่น', desc: 'เกมใช้หัว', floor: 5, room: 'ห้องวินเทจ', maxAssignedCount: 3 },
  { id: 't_1792307316696', title: 'อวัยวะที่หายไป', desc: 'ทำภารกิจให้สำเร็จและให้แอดมินสแกนยืนยัน', floor: 5, room: 'ห้องโปรเจคเตอร์', maxAssignedCount: 3 },
  { id: 't_1792397757958', title: 'ไม่นะ! ต๋งหายไป!', desc: 'รับภารกิจจาก DM. Smooth Imposter', floor: 5, room: 'ห้องวินเทจ', maxAssignedCount: 3 },
]

export default function AllOfUsWillDiePage({ lineUser, firebaseUser, isAdmin: isAppAdmin, showToast, showPage }) {
  const [selectedJoinColor, setSelectedJoinColor] = useState('#c62828')
  const [gameDoc, setGameDoc] = useState(() => ({
    status: 'waiting',
    gameDurationMinutes: 20,
    gameSecondsRemaining: 1200,
    gameTimerRunning: false,
    timerUpdatedAt: Date.now(),
    players: {},
    taskPool: DEFAULT_TASKS_POOL,
    sabotagePool: DEFAULT_SABOTAGE_POOL,
    sabotage: { active: false, id: '', title: '', status: 'idle', countdownSeconds: 90, startedAt: 0 },
    meeting: null,
    winner: null,
    winReason: '',
  }))
  const [myUid, setMyUid] = useState(() => {
    return localStorage.getItem('allofus_player_uid') || ''
  })
  const [myName, setMyName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [directJoinName, setDirectJoinName] = useState('')
  const [isAdminView, setIsAdminView] = useState(false)
  const [adminTab, setAdminTab] = useState('control') // 'control' | 'players' | 'tasks' | 'sabotage'
  const [holdRevealed, setHoldRevealed] = useState(false)
  const [activeTaskModal, setActiveTaskModal] = useState(null)
  const [showSabotageModal, setShowSabotageModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [selectedReportVictim, setSelectedReportVictim] = useState(null)
  const [showSelfDeathConfirm, setShowSelfDeathConfirm] = useState(false)
  const [showSheriffKillModal, setShowSheriffKillModal] = useState(false)
  const [selectedSheriffTarget, setSelectedSheriffTarget] = useState(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskFloor, setNewTaskFloor] = useState(1)
  const [newTaskRoom, setNewTaskRoom] = useState(BUILDING_FLOORS[0].rooms[0])
  const [newTaskMaxAssignedCount, setNewTaskMaxAssignedCount] = useState(3)
  const [taskFloorFilter, setTaskFloorFilter] = useState('all')
  const [editingTask, setEditingTask] = useState(null)

  const [newSabTitle, setNewSabTitle] = useState('')
  const [newSabDesc, setNewSabDesc] = useState('')
  const [newSabCountdown, setNewSabCountdown] = useState(90)
  const [editingSabotage, setEditingSabotage] = useState(null)
  const [newSabTimeoutAction, setNewSabTimeoutAction] = useState('continue')
  const [adminMeetingMinimized, setAdminMeetingMinimized] = useState(false)

  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [meetingTimeSec, setMeetingTimeSec] = useState(0)
  const [sabotageTimeSec, setSabotageTimeSec] = useState(0)
  const [killCooldownSec, setKillCooldownSec] = useState(0)
  const [emergencyCooldownSec, setEmergencyCooldownSec] = useState(0)
  const [selectedVoteTarget, setSelectedVoteTarget] = useState(null)
  const [showRolePicker, setShowRolePicker] = useState(false)
  const [revealedRole, setRevealedRole] = useState(false)
  const revealRoleTimeoutRef = useRef(null)

  const handleToggleRevealRole = () => {
    if (revealedRole) {
      setRevealedRole(false)
      if (revealRoleTimeoutRef.current) clearTimeout(revealRoleTimeoutRef.current)
    } else {
      setRevealedRole(true)
      if (revealRoleTimeoutRef.current) clearTimeout(revealRoleTimeoutRef.current)
      revealRoleTimeoutRef.current = setTimeout(() => {
        setRevealedRole(false)
      }, 5000)
    }
  }

  // Determine effective admin permission
  const hasAdminPerm = isAppAdmin || lineUser?.role === 'admin' || !!firebaseUser
  const qrScannerRef = useRef(null)
  const initialAdminSetRef = useRef(false)

  useEffect(() => {
    if (hasAdminPerm && !initialAdminSetRef.current) {
      initialAdminSetRef.current = true
      setIsAdminView(true)
    }
  }, [hasAdminPerm])

  // ── 1. Listen to Game State Document in Realtime ─────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'all_of_us_games', 'active_game'), snap => {
      if (snap.exists()) {
        const data = snap.data()
        setGameDoc({
          ...data,
          taskPool: data.taskPool || DEFAULT_TASKS_POOL,
          sabotagePool: data.sabotagePool || DEFAULT_SABOTAGE_POOL,
        })
      } else {
        // Initialize active_game document if not yet created
        const initData = {
          status: 'waiting',
          gameDurationMinutes: 20,
          gameSecondsRemaining: 1200,
          gameTimerRunning: false,
          timerUpdatedAt: Date.now(),
          killCooldownSeconds: 30,
          emergencyCooldownSeconds: 60,
          killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
          players: {},
          taskPool: DEFAULT_TASKS_POOL,
          sabotagePool: DEFAULT_SABOTAGE_POOL,
          sabotage: { active: false, id: '', title: '', status: 'idle', countdownSeconds: 90, startedAt: 0 },
          meeting: null,
          winner: null,
          winReason: '',
          updatedAt: serverTimestamp(),
        }
        setDoc(doc(db, 'all_of_us_games', 'active_game'), initData).catch(() => {})
      }
    }, err => console.warn('Game doc sync error:', err))
    return unsub
  }, [])

  // Sync current user's player name
  useEffect(() => {
    if (gameDoc?.players && myUid && gameDoc.players[myUid]) {
      setMyName(gameDoc.players[myUid].name || '')
    }
  }, [gameDoc?.players, myUid])

  // ── 4. High-Precision Local Countdown Timers ─────────────
  useEffect(() => {
    if (!gameDoc) return
    const interval = setInterval(() => {
      const now = Date.now()

      // Main Game Timer
      if (gameDoc.status === 'playing' && gameDoc.gameTimerRunning) {
        const elapsedSec = Math.floor((now - (gameDoc.timerUpdatedAt || now)) / 1000)
        const rem = Math.max(0, (gameDoc.gameSecondsRemaining || 0) - elapsedSec)
        setCurrentTimeSec(rem)
        const isMasterTimerWriter = hasAdminPerm || (allPlayersList.length > 0 && allPlayersList[0].uid === myUid)
        if (rem === 0 && isMasterTimerWriter && gameDoc.gameTimerRunning) {
          updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'ended',
            winner: 'impostor',
            winReason: 'หมดเวลาการเล่นหลัก (00:00) แล้ว! ฝ่ายคนดีไม่สามารถทำภารกิจกู้ยานได้ทันเวลา ทำให้ฝ่ายคนร้ายชนะเกมทันที!',
            gameTimerRunning: false,
            gameSecondsRemaining: 0,
            killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
            timerUpdatedAt: now,
          }).catch(() => {})
        }
      } else {
        setCurrentTimeSec(gameDoc.gameSecondsRemaining || 0)
      }

      // Sabotage Timer
      if (gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active') {
        const sabElapsed = Math.floor((now - (gameDoc.sabotage.startedAt || now)) / 1000)
        const sabRem = Math.max(0, (gameDoc.sabotage.countdownSeconds || 90) - sabElapsed)
        setSabotageTimeSec(sabRem)

        // Check timeout action when countdown reaches 0
        if (sabRem === 0 && hasAdminPerm) {
          if (gameDoc.sabotage.timeoutAction === 'end_game') {
            handleEndGame('impostor', `กู้สถานการณ์ Sabotage ไม่ทัน! ${gameDoc.sabotage.title} ทำให้ฝ่ายคนร้ายชนะ!`)
          } else {
            resolveSabotage()
            showToast(`หมดเวลา Sabotage (${gameDoc.sabotage.title}) แล้ว! ระบบเคลียร์สถานะคืนปกติและเกมดำเนินต่อไป`)
          }
        }
      }

      // Kill Cooldown / Peace Period Timer (No kills allowed after game start or meetings)
      if (gameDoc.status === 'playing' && gameDoc.killCooldownUntil && gameDoc.killCooldownUntil > now) {
        const cdRem = Math.max(0, Math.ceil((gameDoc.killCooldownUntil - now) / 1000))
        setKillCooldownSec(cdRem)
      } else {
        setKillCooldownSec(0)
      }

      // Emergency Meeting Cooldown Timer (No emergency meetings allowed right after game start or meetings)
      if (gameDoc.status === 'playing' && gameDoc.emergencyCooldownUntil && gameDoc.emergencyCooldownUntil > now) {
        const emCdRem = Math.max(0, Math.ceil((gameDoc.emergencyCooldownUntil - now) / 1000))
        setEmergencyCooldownSec(emCdRem)
      } else {
        setEmergencyCooldownSec(0)
      }

      // Meeting Discussion / Voting Timer
      if (gameDoc.meeting && (gameDoc.status === 'meeting_discussion' || gameDoc.status === 'meeting_voting')) {
        const meetElapsed = Math.floor((now - (gameDoc.meeting.startTime || now)) / 1000)
        const totalDuration = gameDoc.meeting.durationSeconds || 210 // 3 minutes 30 seconds total (210s)
        const meetRem = Math.max(0, totalDuration - meetElapsed)
        setMeetingTimeSec(meetRem)

        // Automatically switch from discussion to voting in last 60 seconds
        if (meetRem <= 60 && gameDoc.status === 'meeting_discussion' && hasAdminPerm) {
          updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'meeting_voting',
          }).catch(() => {})
        }

        // Conclude votes when time hits 0 OR when all living players have cast their votes
        if (gameDoc.status === 'meeting_voting' && hasAdminPerm) {
          const livingPlayers = Object.values(gameDoc.players || {}).filter(p => p.isAlive)
          const allVoted = livingPlayers.length > 0 && livingPlayers.every(p => Boolean(gameDoc.meeting?.votes?.[p.uid]))
          if (meetRem === 0 || allVoted) {
            concludeVoting()
          }
        }
      }
    }, 500)

    return () => clearInterval(interval)
  }, [gameDoc, hasAdminPerm])

  // Play audio alerts on meeting call or sabotage
  const prevStatusRef = useRef(gameDoc?.status)
  const prevSabotageActiveRef = useRef(false)
  useEffect(() => {
    if (!gameDoc) return
    const isSabotageActive = Boolean(
      gameDoc.status === 'playing' &&
      gameDoc.sabotage?.active &&
      gameDoc.sabotage?.status === 'active'
    )

    // Meeting buzzer alert
    if (prevStatusRef.current !== 'meeting_called' && gameDoc.status === 'meeting_called') {
      playMeetingBuzzer()
    }
    if (prevStatusRef.current === 'meeting_called' && gameDoc.status !== 'meeting_called') {
      stopMeetingBuzzer()
    }

    // Sabotage siren alert - loops continuously while sabotage is active
    if (!prevSabotageActiveRef.current && isSabotageActive) {
      playSabotageAlarm()
    }
    if (prevSabotageActiveRef.current && !isSabotageActive) {
      stopSabotageAlarm()
    }

    // If game ended or returned to lobby, ensure all alarms are stopped
    if (gameDoc.status === 'ended' || gameDoc.status === 'lobby') {
      stopMeetingBuzzer()
      stopSabotageAlarm()
      if (prevStatusRef.current !== 'ended' && gameDoc.status === 'ended') {
        playVictoryFanfare(gameDoc.winner === 'impostor')
      }
    }

    prevStatusRef.current = gameDoc.status
    prevSabotageActiveRef.current = isSabotageActive
  }, [gameDoc?.status, gameDoc?.sabotage?.active, gameDoc?.sabotage?.status])

  // Pre-unlock audio on user touch or click so mobile browsers allow background alarms
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const mAudio = getMeetingAudio()
        if (mAudio && mAudio.paused && mAudio.currentTime === 0) {
          mAudio.load()
        }
        const sAudio = getSabotageAudio()
        if (sAudio && sAudio.paused && sAudio.currentTime === 0) {
          sAudio.load()
        }
        const ctx = getAudioContext()
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {})
        }
      } catch {}
    }
    window.addEventListener('click', unlockAudio, { passive: true })
    window.addEventListener('touchstart', unlockAudio, { passive: true })
    return () => {
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
      stopMeetingBuzzer()
      stopSabotageAlarm()
    }
  }, [])

  // ── Derived Player Information ──────────────────────────
  const me = (gameDoc?.players && myUid) ? gameDoc.players[myUid] : null
  const myRole = me?.role || 'crewmate'
  const isAlive = me?.isAlive !== false
  const allPlayersList = useMemo(() => {
    return Object.entries(gameDoc?.players || {}).map(([key, val]) => ({
      uid: val.uid || key,
      ...val,
    }))
  }, [gameDoc?.players])

  // Total Task Progress Calculation (Impostor and Dodo tasks are excluded from progress)
  const { totalTasksCount, completedTasksCount, progressPercent } = useMemo(() => {
    let total = 0
    let completed = 0
    allPlayersList.forEach(p => {
      // Exclude Impostor and Dodo tasks from progress and victory condition
      if (p.role === 'impostor' || p.role === 'dodo') return
      (p.tasks || []).forEach(t => {
        total++
        if (t.verified) completed++
      })
    })
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return { totalTasksCount: total, completedTasksCount: completed, progressPercent: pct }
  }, [allPlayersList])

  // Auto-check Crewmate win condition on 100% tasks before time runs out
  useEffect(() => {
    if (hasAdminPerm && gameDoc?.status === 'playing' && totalTasksCount > 0 && completedTasksCount >= totalTasksCount && !gameDoc.winner) {
      handleEndGame('crewmate', 'ฝ่ายคนดีทำภารกิจครบ 100% สำเร็จก่อนหมดเวลา! ฝ่ายคนดีชนะ!')
    }
  }, [hasAdminPerm, gameDoc?.status, totalTasksCount, completedTasksCount, gameDoc?.winner])

  // Real-time Parity Check: If living Impostors >= living Non-Impostors (Crewmates + Dodo + Sheriff), Impostors win immediately
  useEffect(() => {
    const isMasterWriter = hasAdminPerm || (allPlayersList.length > 0 && allPlayersList[0].uid === myUid)
    if (isMasterWriter && gameDoc?.status === 'playing' && !gameDoc.winner) {
      const allImpostors = allPlayersList.filter(p => p.role === 'impostor')
      const livingImpostors = allImpostors.filter(p => p.isAlive)
      const livingNonImpostors = allPlayersList.filter(p => p.role !== 'impostor' && p.isAlive)

      if (livingImpostors.length > 0 && livingImpostors.length >= livingNonImpostors.length) {
        handleEndGame(
          'impostor',
          `จำนวนคนร้าย (${livingImpostors.length} คน) เท่ากับหรือมากกว่าฝ่ายคนดีและโดโด้ (${livingNonImpostors.length} คน) แล้ว! ฝ่ายคนร้ายชนะทันที!`
        )
      } else if (allImpostors.length > 0 && livingImpostors.length === 0) {
        handleEndGame(
          'crewmate',
          'คนร้ายถูกกำจัดหมดทุกคนแล้ว! ฝ่ายคนดีเป็นผู้ชนะ!'
        )
      }
    }
  }, [hasAdminPerm, myUid, gameDoc?.status, allPlayersList, gameDoc?.winner])

  // Format MM:SS
  const fmtTime = (secs) => {
    const s = Math.max(0, secs)
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
  }

  // ── Game Flow Actions ───────────────────────────────────

  // Player color selection from 20 discrete colors (Zero Duplicates Policy)
  const saveMyColor = async (colorHex) => {
    if (!myUid || !gameDoc) return
    const taken = Object.values(gameDoc.players || {}).some(
      p => p.color?.toLowerCase() === colorHex?.toLowerCase() && p.uid !== myUid
    )
    if (taken) {
      showToast('สีนี้มีผู้เล่นคนอื่นเลือกไปแล้ว กรุณาเลือกสีอื่น', 'error')
      return
    }
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        [`players.${myUid}.color`]: colorHex,
        [`players.${myUid}.ready`]: true,
      })
      showToast('เลือกสีเรียบร้อย')
    } catch (e) {
      showToast('บันทึกสีล้มเหลว: ' + e.message, 'error')
    }
  }

  // Update player name
  const saveMyName = async () => {
    if (!myUid || !nameInput.trim()) return
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        [`players.${myUid}.name`]: nameInput.trim()
      })
      setEditingName(false)
      showToast('แก้ไขชื่อสำเร็จ')
    } catch (e) {
      showToast('แก้ไขชื่อล้มเหลว', 'error')
    }
  }

  // Direct join game by entering name and choosing character color
  const handleDirectJoin = async () => {
    const trimmed = (directJoinName || '').trim()
    if (!trimmed) {
      showToast('กรุณาระบุชื่อของคุณ', 'error')
      return
    }
    const currentPlayers = gameDoc?.players || {}
    const nameTaken = Object.values(currentPlayers).some(
      p => p.name?.toLowerCase().trim() === trimmed.toLowerCase()
    )
    if (nameTaken) {
      showToast('ชื่อนี้มีผู้เล่นคนอื่นใช้แล้วในห้อง กรุณาใช้ชื่ออื่น', 'error')
      return
    }

    // Determine character color
    const usedColors = new Set(Object.values(currentPlayers).map(p => (p.color || '').toLowerCase()))
    let chosenColor = selectedJoinColor
    if (!chosenColor || usedColors.has(chosenColor.toLowerCase())) {
      const freeColor = TWENTY_PLAYER_COLORS.find(c => !usedColors.has(c.hex.toLowerCase()))
      chosenColor = freeColor ? freeColor.hex : TWENTY_PLAYER_COLORS[0].hex
    }

    const newUid = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6)
    setMyUid(newUid)
    localStorage.setItem('allofus_player_uid', newUid)
    try {
      await setDoc(doc(db, 'all_of_us_games', 'active_game'), {
        players: {
          [newUid]: {
            uid: newUid,
            name: trimmed,
            avatar: '',
            role: 'crewmate',
            color: chosenColor,
            isAlive: true,
            tasks: [],
            ready: true,
          }
        }
      }, { merge: true })
      setDirectJoinName('')
      showToast(`ยินดีต้อนรับ ${trimmed} เข้าสู่ยาน The Skeld`)
    } catch (e) {
      showToast('เข้าร่วมเกมล้มเหลว: ' + e.message, 'error')
    }
  }

  // Player self-reports eliminated in real life (silent ghost mode, revealed in meeting)
  const handleConfirmSelfDeath = async () => {
    if (!myUid || !gameDoc) return
    try {
      const updatedPlayers = { ...(gameDoc.players || {}) }
      if (updatedPlayers[myUid]) {
        updatedPlayers[myUid] = { ...updatedPlayers[myUid], isAlive: false }
      }

      const livingImpostors = Object.values(updatedPlayers).filter(p => p.role === 'impostor' && p.isAlive)
      const livingNonImpostors = Object.values(updatedPlayers).filter(p => p.role !== 'impostor' && p.isAlive)

      if (gameDoc.status === 'playing' && livingImpostors.length > 0 && livingImpostors.length >= livingNonImpostors.length) {
        // Immediate Impostor Win on parity
        await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
          players: updatedPlayers,
          status: 'ended',
          winner: 'impostor',
          winReason: `จำนวนคนร้าย (${livingImpostors.length} คน) เท่ากับหรือมากกว่าฝ่ายคนดีและโดโด้ (${livingNonImpostors.length} คน) แล้ว! ฝ่ายคนร้ายชนะทันที!`,
          gameTimerRunning: false,
          killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
        })
      } else {
        await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
          [`players.${myUid}.isAlive`]: false,
        })
      }
      setShowSelfDeathConfirm(false)
      showToast('คุณเข้าสู่สถานะวิญญาณแล้ว ทำภารกิจต่อได้เงียบๆ (ทุกคนจะทราบตอนประชุม)')
    } catch (e) {
      showToast('อัปเดตสถานะล้มเหลว: ' + e.message, 'error')
    }
  }

  // Sheriff secret kill execution
  const handleSheriffKill = async (targetUid) => {
    if (!myUid || myRole !== 'sheriff' || !isAlive || gameDoc.status !== 'playing') return
    if (killCooldownSec > 0) {
      showToast(`อยู่ในช่วงเวลาห้ามฆ่า (เหลืออีก ${killCooldownSec} วินาที)`, 'error')
      return
    }
    const shots = me?.sheriffShots !== undefined ? me.sheriffShots : 1
    if (shots <= 0) {
      showToast('คุณใช้สิทธิ์ยิงของรอบนี้ไปแล้ว (จะได้รับสิทธิ์ใหม่หลังจบการประชุม)', 'error')
      return
    }
    const target = gameDoc.players?.[targetUid]
    if (!target) return
    if (!target.isAlive) {
      showToast('ผู้เล่นคนนี้เสียชีวิตแล้ว ไม่สามารถยิงได้', 'error')
      return
    }

    const updatedPlayers = { ...(gameDoc.players || {}) }
    // Sheriff consumes their 1 shot for this meeting cycle
    updatedPlayers[myUid] = { ...updatedPlayers[myUid], sheriffShots: 0 }

    if (target.role === 'crewmate') {
      // Misfire! Target dies AND Sheriff dies
      updatedPlayers[targetUid] = { ...target, isAlive: false }
      updatedPlayers[myUid] = { ...updatedPlayers[myUid], isAlive: false }

      // Check win condition
      const remainingNonImpostors = Object.values(updatedPlayers).filter(p => p.role !== 'impostor' && p.isAlive)
      const remainingImpostors = Object.values(updatedPlayers).filter(p => p.role === 'impostor' && p.isAlive)

      if (remainingImpostors.length >= remainingNonImpostors.length && remainingImpostors.length > 0) {
        await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
          players: updatedPlayers,
          status: 'ended',
          winner: 'impostor',
          winReason: `นายอำเภอยิงผิดคนทำให้จำนวนคนร้าย (${remainingImpostors.length} คน) เท่ากับหรือมากกว่าฝ่ายคนดีและโดโด้ (${remainingNonImpostors.length} คน)! ฝ่ายคนร้ายชนะทันที!`,
          gameTimerRunning: false,
          killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
        })
      } else {
        await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
          players: updatedPlayers,
        })
      }
      showToast(`คุณยิงคนบริสุทธิ์ (${target.name} คือฝ่ายคนดี)! ทั้งคุณและเป้าหมายเสียชีวิตทันที`, 'error')
    } else {
      // Hit Impostor or Dodo! Target dies, Sheriff survives
      updatedPlayers[targetUid] = { ...target, isAlive: false }

      const remainingImpostors = Object.values(updatedPlayers).filter(p => p.role === 'impostor' && p.isAlive)
      const remainingNonImpostors = Object.values(updatedPlayers).filter(p => p.role !== 'impostor' && p.isAlive)

      if (remainingImpostors.length === 0) {
        // All impostors eliminated -> Crewmates win!
        await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
          players: updatedPlayers,
          status: 'ended',
          winner: 'crewmate',
          winReason: 'นายอำเภอยิงกำจัดคนร้ายคนสุดท้ายสำเร็จ! ฝ่ายคนดีเป็นผู้ชนะ!',
          gameTimerRunning: false,
          killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
        })
      } else if (remainingImpostors.length >= remainingNonImpostors.length && remainingImpostors.length > 0) {
        // Shooting Dodo tipped parity in favor of Impostors
        await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
          players: updatedPlayers,
          status: 'ended',
          winner: 'impostor',
          winReason: `นายอำเภอยิงกำจัดโดโด้ทำให้จำนวนคนร้าย (${remainingImpostors.length} คน) เท่ากับหรือมากกว่าฝ่ายคนดี (${remainingNonImpostors.length} คน)! ฝ่ายคนร้ายชนะทันที!`,
          gameTimerRunning: false,
          killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
        })
      } else {
        await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
          players: updatedPlayers,
        })
      }
      showToast(`คุณยิงกำจัด ${target.role === 'impostor' ? 'คนร้าย' : 'โดโด้'} (${target.name}) สำเร็จ!`, 'success')
    }

    setShowSheriffKillModal(false)
    setSelectedSheriffTarget(null)
  }

  // Admin: Delete / Kick single player from game
  const handleDeletePlayer = async (playerUid) => {
    if (!window.confirm('ยืนยันลบผู้เล่นนี้ออกจากเกม?')) return
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        [`players.${playerUid}`]: deleteField()
      })
      if (myUid === playerUid) {
        localStorage.removeItem('allofus_player_uid')
        setMyUid('')
      }
      showToast('ลบผู้เล่นเรียบร้อย')
    } catch (e) {
      showToast('ลบผู้เล่นล้มเหลว: ' + e.message, 'error')
    }
  }

  // Admin: Clear all players from game
  const handleClearAllPlayers = async () => {
    if (!window.confirm('ยืนยันล้างรายชื่อผู้เล่นทั้งหมดในห้อง?')) return
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        players: {}
      })
      localStorage.removeItem('allofus_player_uid')
      setMyUid('')
      showToast('ล้างรายชื่อผู้เล่นทั้งหมดแล้ว')
    } catch (e) {
      showToast('ล้างผู้เล่นล้มเหลว: ' + e.message, 'error')
    }
  }

  // Admin: Add mock players to reach exactly 15 players
  const handleAddMockPlayers = async () => {
    try {
      const currentPlayers = { ...(gameDoc.players || {}) }
      const existingCount = Object.keys(currentPlayers).length
      const needed = Math.max(0, 15 - existingCount)
      if (needed === 0) {
        showToast('มีผู้เล่นครบ 15 คนอยู่แล้ว')
        return
      }
      const mockNames = [
        'ก้อง', 'พลอย', 'บอส', 'แนน', 'อาร์ม',
        'มายด์', 'เจมส์', 'พิม', 'ท็อป', 'ฟ้า',
        'นัท', 'เบลล์', 'โอ๊ค', 'ดิว', 'เอก'
      ]
      const mockColors = [
        '#c62828', '#2e7d32', '#e91e63', '#ef6c00', '#fbc02d',
        '#212121', '#eceff1', '#6a1b9a', '#4e342e', '#00acc1',
        '#7cb342', '#880e4f', '#f06292', '#4db6ac', '#546e7a'
      ]
      const updates = {}
      for (let i = 0; i < needed; i++) {
        const uid = `mock_player_${String(existingCount + i + 1).padStart(2, '0')}`
        updates[`players.${uid}`] = {
          uid,
          name: mockNames[(existingCount + i) % mockNames.length],
          avatar: '',
          role: 'crewmate',
          color: mockColors[(existingCount + i) % mockColors.length],
          isAlive: true,
          ready: true,
          tasks: [],
          sheriffShots: 0,
          isMockup: true,
        }
      }
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), updates)
      showToast(`เติมผู้เล่น Mockup เพิ่ม ${needed} คน (ครบ 15 คนแล้ว)`)
    } catch (e) {
      showToast('เกิดข้อผิดพลาดในการเพิ่ม Mockup: ' + e.message, 'error')
    }
  }

  // Admin: Remove all mock players
  const handleRemoveMockPlayers = async () => {
    try {
      const currentPlayers = gameDoc.players || {}
      const updates = {}
      let count = 0
      Object.keys(currentPlayers).forEach(uid => {
        const p = currentPlayers[uid]
        if (p.isMockup || uid.startsWith('mock_')) {
          updates[`players.${uid}`] = deleteField()
          count++
        }
      })
      if (count === 0) {
        showToast('ไม่พบผู้เล่นที่เป็น Mockup ในห้อง')
        return
      }
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), updates)
      showToast(`ลบผู้เล่น Mockup ออก ${count} คนเรียบร้อย`)
    } catch (e) {
      showToast('เกิดข้อผิดพลาดในการลบ Mockup: ' + e.message, 'error')
    }
  }

  // Admin: Trigger preset classic sabotage
  const handleTriggerPresetSabotage = async (id, title, desc, countdown = 90, timeoutAction = 'continue') => {
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        sabotage: {
          active: true,
          id,
          title,
          desc,
          status: 'active',
          countdownSeconds: countdown,
          timeoutAction: timeoutAction || 'continue',
          startedAt: Date.now(),
        }
      })
      try {
        const audio = getSabotageAudio()
        if (audio) {
          audio.currentTime = 0
          audio.play().catch(() => playSabotageAlarmSynth())
        } else {
          playSabotageAlarmSynth()
        }
      } catch (err) {
        playSabotageAlarmSynth()
      }
      showToast(`เปิดใช้งาน Sabotage: ${title}`)
    } catch (e) {
      showToast('เริ่ม Sabotage ล้มเหลว: ' + e.message, 'error')
    }
  }

  // Admin starts the game: assigns roles randomly then distributes 3 tasks per player
  const handleStartGame = async () => {
    if (allPlayersList.length === 0) {
      showToast('ยังไม่มีผู้เล่นในล็อบบี้', 'error')
      return
    }
    const pool = gameDoc.taskPool || DEFAULT_TASKS_POOL
    if (pool.length < 3) {
      showToast('ต้องมีภารกิจในคลังอย่างน้อย 3 ภารกิจ', 'error')
      return
    }

    const totalPoolCapacity = pool.reduce((sum, t) => sum + (Number(t.maxAssignedCount) || 3), 0)
    const requiredSlots = allPlayersList.length * 3
    if (totalPoolCapacity < requiredSlots) {
      showToast(`โควตาภารกิจในคลังไม่เพียงพอ (${totalPoolCapacity}/${requiredSlots} ตำแหน่ง) กรุณาเพิ่มภารกิจหรือปรับโควตาภารกิจ`, 'error')
      return
    }

    // Group tasks by floor to guarantee 3 unique floors
    const tasksByFloor = {}
    pool.forEach(t => {
      const f = Number(t.floor) || 1
      if (!tasksByFloor[f]) tasksByFloor[f] = []
      tasksByFloor[f].push(t)
    })
    const availableFloors = Object.keys(tasksByFloor).map(Number)

    if (availableFloors.length < 3) {
      showToast('ต้องมีภารกิจในคลังอย่างน้อย 3 ชั้นที่แตกต่างกัน (เพื่อให้สุ่มได้ชั้นไม่ซ้ำกัน)', 'error')
      return
    }

    const durationMins = gameDoc.gameDurationMinutes || 20
    const durationSecs = durationMins * 60

    // ── Scalable Role Distribution based on Player Count ──
    // • 8 – 9 players: Impostors 1-2 (Admin choice, default 1), Sheriff 1, Dodo 1, remainder Crewmates
    // • 10 – 12 players: Impostors 2, Sheriff 1, Dodo 1, remainder Crewmates
    // • 13 – 15 players: Impostors 3, Sheriff 1, Dodo 1, remainder Crewmates
    // • < 8 players (testing/few players): Impostors 1, Sheriff 1 (if >=3), Dodo 1 (if >=4), remainder Crewmates
    const n = allPlayersList.length
    let targetImpostors = 1
    if (n >= 13) {
      targetImpostors = 3
    } else if (n >= 10) {
      targetImpostors = 2
    } else if (n >= 8) {
      targetImpostors = Number(gameDoc.impostorCountChoice89) === 2 ? 2 : 1
    } else {
      targetImpostors = 1
    }
    const targetDodo = n >= 4 ? 1 : 0
    const targetSheriff = n >= 3 ? 1 : 0

    // Randomize all players freshly on game start so roles are unpredictable every round
    const shuffledPool = [...allPlayersList].sort(() => Math.random() - 0.5)
    const assignedRoles = {}

    // 1. Assign Impostors (3 for 15 players)
    for (let i = 0; i < targetImpostors && shuffledPool.length > 0; i++) {
      const p = shuffledPool.pop()
      assignedRoles[p.uid] = 'impostor'
    }

    // 2. Assign Dodo (1 for 15 players)
    for (let i = 0; i < targetDodo && shuffledPool.length > 0; i++) {
      const p = shuffledPool.pop()
      assignedRoles[p.uid] = 'dodo'
    }

    // 3. Assign Sheriff (1 for 15 players)
    for (let i = 0; i < targetSheriff && shuffledPool.length > 0; i++) {
      const p = shuffledPool.pop()
      assignedRoles[p.uid] = 'sheriff'
    }

    // 4. All remaining players are Crewmates (10 players for 15 total)
    while (shuffledPool.length > 0) {
      const p = shuffledPool.pop()
      assignedRoles[p.uid] = 'crewmate'
    }

    // ── Guarantee Unique Colors from TWENTY_PLAYER_COLORS ──
    const usedColors = new Set()
    const playersNeedColor = []

    allPlayersList.forEach(p => {
      const c = (p.color || '').toLowerCase()
      const isValidColor = TWENTY_PLAYER_COLORS.some(tc => tc.hex.toLowerCase() === c)
      if (isValidColor && !usedColors.has(c)) {
        usedColors.add(c)
      } else {
        playersNeedColor.push(p.uid)
      }
    })

    const availableColors = TWENTY_PLAYER_COLORS
      .map(c => c.hex)
      .filter(hex => !usedColors.has(hex.toLowerCase()))
      .sort(() => Math.random() - 0.5)

    const finalColorMap = {}
    allPlayersList.forEach(p => {
      const c = (p.color || '').toLowerCase()
      if (usedColors.has(c) && !playersNeedColor.includes(p.uid)) {
        finalColorMap[p.uid] = p.color
      }
    })
    playersNeedColor.forEach((uid, idx) => {
      finalColorMap[uid] = availableColors[idx] || TWENTY_PLAYER_COLORS[idx % TWENTY_PLAYER_COLORS.length].hex
    })

    // Randomize 3 tasks with unique floors for each player while respecting maxAssignedCount
    const taskAssignedCounts = {}
    const updatedPlayers = { ...gameDoc.players }

    // Shuffle player processing order to ensure unbiased task distribution
    const playersToAssign = [...allPlayersList].sort(() => 0.5 - Math.random())

    playersToAssign.forEach(p => {
      // Calculate remaining capacity per floor to keep load evenly distributed
      const floorCapacities = availableFloors.map(floorNum => {
        const floorTasks = tasksByFloor[floorNum] || []
        const remainingSlots = floorTasks.reduce((sum, t) => {
          const assigned = taskAssignedCounts[t.id] || 0
          const cap = Number(t.maxAssignedCount) || 3
          return sum + Math.max(0, cap - assigned)
        }, 0)
        return { floorNum, remainingSlots }
      }).filter(fc => fc.remainingSlots > 0)

      // Sort floors by remaining capacity descending with slight random jitter for variety
      floorCapacities.sort((a, b) => (b.remainingSlots + Math.random() * 0.8) - (a.remainingSlots + Math.random() * 0.8))

      let chosenFloors = floorCapacities.slice(0, 3).map(fc => fc.floorNum)
      if (chosenFloors.length < 3) {
        const otherFloors = availableFloors.filter(f => !chosenFloors.includes(f)).sort(() => 0.5 - Math.random())
        chosenFloors = [...chosenFloors, ...otherFloors.slice(0, 3 - chosenFloors.length)]
      }

      // Pick 1 task from each chosen floor (strictly enforcing maxAssignedCount)
      const assignedTasks = chosenFloors.map(floorNum => {
        const floorTasks = tasksByFloor[floorNum] || []
        const eligibleTasks = floorTasks.filter(t => (taskAssignedCounts[t.id] || 0) < (Number(t.maxAssignedCount) || 3))

        let selectedTask
        if (eligibleTasks.length > 0) {
          selectedTask = eligibleTasks[Math.floor(Math.random() * eligibleTasks.length)]
        } else {
          // Fallback: pick task with lowest assignment count on this floor
          const sortedByUsage = [...floorTasks].sort((a, b) => (taskAssignedCounts[a.id] || 0) - (taskAssignedCounts[b.id] || 0))
          selectedTask = sortedByUsage[0] || floorTasks[0]
        }

        if (selectedTask) {
          taskAssignedCounts[selectedTask.id] = (taskAssignedCounts[selectedTask.id] || 0) + 1
        }
        return selectedTask
      }).filter(Boolean)

      // Sort by floor ascending for clean player roadmap
      assignedTasks.sort((a, b) => (Number(a.floor) || 1) - (Number(b.floor) || 1))

      const assigned = assignedTasks.map((t, idx) => ({
        id: `${p.uid}_t${idx + 1}_${Date.now()}`,
        poolTaskId: t.id,
        title: t.title,
        desc: t.desc,
        floor: Number(t.floor) || 1,
        room: t.room || 'โซนหน้า',
        verified: false,
        verifiedAt: null,
      }))
      const finalRole = assignedRoles[p.uid] || 'crewmate'
      updatedPlayers[p.uid] = {
        ...p,
        color: finalColorMap[p.uid] || p.color || TWENTY_PLAYER_COLORS[0].hex,
        role: finalRole,
        sheriffShots: finalRole === 'sheriff' ? 1 : 0,
        isAlive: true,
        tasks: assigned,
      }
    })

    try {
      const cooldownSec = Number(gameDoc.killCooldownSeconds) > 0 ? Number(gameDoc.killCooldownSeconds) : 30
      const emergencyCdSec = Number(gameDoc.emergencyCooldownSeconds) > 0 ? Number(gameDoc.emergencyCooldownSeconds) : 60
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'playing',
        players: updatedPlayers,
        gameSecondsRemaining: durationSecs,
        gameTimerRunning: true,
        timerUpdatedAt: Date.now(),
        killCooldownUntil: Date.now() + (cooldownSec * 1000),
        emergencyCooldownUntil: Date.now() + (emergencyCdSec * 1000),
        sabotage: { active: false, id: '', title: '', status: 'idle', countdownSeconds: 90, startedAt: 0 },
        meeting: null,
        winner: null,
        winReason: '',
      })
      showToast('เริ่มเกมแล้ว! แจกภารกิจเรียบร้อย')
    } catch (e) {
      showToast('เริ่มเกมล้มเหลว: ' + e.message, 'error')
    }
  }

  // Impostor requests Sabotage - sends request to admin for confirmation
  const requestSabotage = async (title, desc, countdownSeconds = 90, timeoutAction = 'continue') => {
    if (gameDoc.sabotage?.active) {
      showToast('มีเหตุการณ์ Sabotage ในระบบอยู่แล้ว', 'error')
      return
    }
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        sabotage: {
          active: true,
          id: `sab_${Date.now()}`,
          title,
          desc,
          requestedBy: myUid,
          status: 'pending_approval',
          countdownSeconds: Number(countdownSeconds) || 90,
          timeoutAction: timeoutAction || 'continue',
          startedAt: 0,
        }
      })
      setShowSabotageModal(false)
      showToast('ส่งคำขอ Sabotage แล้ว รอแอดมินยืนยันอนุมัติ')
    } catch (e) {
      showToast('ส่งคำขอ Sabotage ล้มเหลว', 'error')
    }
  }

  // Admin approves Sabotage - always requires admin confirmation
  const approveSabotage = async () => {
    if (!gameDoc?.sabotage) return
    const sabTitle = gameDoc.sabotage.title || 'Sabotage'
    if (!window.confirm(`ยืนยันการอนุมัติ ${sabTitle} หรือไม่? สัญญาณเตือนภัยจะดังบนโทรศัพท์ของทุกคนทันที`)) {
      return
    }
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        'sabotage.status': 'active',
        'sabotage.startedAt': Date.now(),
      })
      playAlarmSound()
      showToast('อนุมัติ Sabotage แล้ว กระจายสัญญาณเตือนทุกคน')
    } catch (e) {
      showToast('อนุมัติล้มเหลว', 'error')
    }
  }

  // Admin resolves/cancels Sabotage
  const resolveSabotage = async () => {
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        sabotage: { active: false, id: '', title: '', status: 'idle', countdownSeconds: 90, startedAt: 0 }
      })
      stopSabotageAlarm()
      showToast('ยกเลิก Sabotage สำเร็จ คนดีกู้ภัยเรียบร้อย')
    } catch (e) {
      showToast('ยกเลิกล้มเหลว', 'error')
    }
  }

  // Call Emergency Meeting or Report Body
  const callEmergencyMeeting = async (isReport = false, victim = null) => {
    if (gameDoc.status !== 'playing') return
    if (!isAlive && !hasAdminPerm) {
      showToast('คุณเสียชีวิตแล้ว ไม่สามารถแจ้งพบศพหรือกดปุ่มประชุมได้', 'error')
      return
    }
    // Standard Among Us Rule: Emergency Meeting button is blocked during Sabotage, but Dead Body Report is allowed
    if (!isReport && gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active') {
      showToast('ไม่สามารถกดปุ่มเรียกประชุมฉุกเฉินได้ขณะมีสัญญาณ Sabotage! ต้องแก้ไขก่อน', 'error')
      return
    }
    // Standard Among Us Rule: Emergency Meeting button is blocked during Emergency Cooldown, but Dead Body Report is allowed
    if (!isReport && emergencyCooldownSec > 0) {
      showToast(`อยู่ในช่วงคูลดาวน์ห้ามเรียกประชุมฉุกเฉิน (เหลืออีก ${emergencyCooldownSec} วินาที)`, 'error')
      return
    }
    try {
      const now = Date.now()
      // Pause main game timer during meeting
      const elapsedSec = Math.floor((now - (gameDoc.timerUpdatedAt || now)) / 1000)
      const currentRemaining = Math.max(0, (gameDoc.gameSecondsRemaining || 0) - elapsedSec)

      const updateData = {
        status: 'meeting_called',
        gameSecondsRemaining: currentRemaining,
        gameTimerRunning: false,
        meeting: {
          calledBy: {
            uid: myUid || 'admin',
            name: me?.name || (hasAdminPerm ? 'Game Master' : 'ผู้เล่น'),
            color: me?.color || '#ff0000',
          },
          reportedVictim: victim ? {
            uid: victim.uid,
            name: victim.name,
            color: victim.color || '#888888',
          } : null,
          type: isReport ? 'body_report' : 'emergency_button',
          startTime: now,
          durationSeconds: 210, // 3 minutes 30 seconds (210s)
          votes: {},
          result: null,
        }
      }

      // If reporting a dead body, ensure victim is officially marked dead in players state
      if (isReport && victim?.uid && gameDoc.players?.[victim.uid]) {
        updateData.players = {
          ...(gameDoc.players || {}),
          [victim.uid]: {
            ...gameDoc.players[victim.uid],
            isAlive: false,
          }
        }
      }

      // Standard Among Us Rule: Reporting a dead body immediately cancels any active Sabotage
      if (isReport && gameDoc.sabotage?.active) {
        updateData.sabotage = { active: false, id: '', title: '', status: 'idle', countdownSeconds: 90, startedAt: 0 }
        stopSabotageAlarm()
      }

      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), updateData)
      playMeetingBuzzer()
      showToast(isReport ? `REPORT ศพ ${victim ? victim.name : ''} สำเร็จ! ยกเลิก Sabotage และเรียกทุกคนเข้าที่ประชุม` : 'เปิดประชุมฉุกเฉินสำเร็จ')
    } catch (e) {
      showToast('เรียกประชุมล้มเหลว: ' + e.message, 'error')
    }
  }

  // Admin officially starts discussion countdown (3.5 mins = 210s)
  const startDiscussionPhase = async () => {
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'meeting_discussion',
        'meeting.startTime': Date.now(),
        'meeting.durationSeconds': 210,
      })
      showToast('เริ่มจับเวลาประชุม 3 นาทีครึ่งแล้ว')
    } catch (e) {
      showToast('เริ่มประชุมล้มเหลว', 'error')
    }
  }

  // Fast forward to voting phase (1 min remaining)
  const openVotingPhaseNow = async () => {
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'meeting_voting',
        'meeting.startTime': Date.now() - 150000, // advance clock to last 60s (210s - 60s = 150s)
      })
      showToast('เปิดให้ลงคะแนนโหวตทันที')
    } catch (e) {
      showToast('เปิดโหวตล้มเหลว', 'error')
    }
  }

  // Cast vote
  const castVote = async (targetUid) => {
    if (!myUid || !gameDoc?.meeting || gameDoc.status !== 'meeting_voting') return
    if (!isAlive) {
      showToast('วิญญาณไม่มีสิทธิ์โหวต', 'error')
      return
    }
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        [`meeting.votes.${myUid}`]: targetUid
      })
      showToast('บันทึกคะแนนโหวตของคุณแล้ว')
    } catch (e) {
      showToast('โหวตล้มเหลว', 'error')
    }
  }

  // Conclude voting and evaluate result
  const concludeVoting = async () => {
    if (!gameDoc?.meeting) return
    const votes = gameDoc.meeting.votes || {}
    const counts = {}

    Object.values(votes).forEach(target => {
      counts[target] = (counts[target] || 0) + 1
    })

    // Find candidate with max votes
    let highestVoteCount = 0
    let electedTarget = null
    let isTie = false

    Object.entries(counts).forEach(([target, count]) => {
      if (count > highestVoteCount) {
        highestVoteCount = count
        electedTarget = target
        isTie = false
      } else if (count === highestVoteCount) {
        isTie = true
      }
    })

    const updatedPlayers = { ...gameDoc.players }
    let eliminatedUid = null
    let eliminatedRole = null
    let dodoWon = false
    let outcomeText = ''

    if (isTie || !electedTarget || electedTarget === 'skip') {
      outcomeText = isTie ? 'คะแนนโหวตเสมอกัน ไม่มีใครถูกขับออก' : 'เสียงส่วนใหญ่เลือก SKIP ไม่มีใครถูกขับออก'
    } else {
      eliminatedUid = electedTarget
      const victim = updatedPlayers[eliminatedUid]
      if (victim) {
        eliminatedRole = victim.role
        updatedPlayers[eliminatedUid] = { ...victim, isAlive: false }

        if (victim.role === 'dodo') {
          dodoWon = true
          outcomeText = `${victim.name} คือโดโด้! ที่ประชุมโหวตโดโด้ออกตามเป้าหมาย ทำให้ฝ่ายโดโด้ชนะเกมทันที!`
        } else if (victim.role === 'impostor') {
          outcomeText = `${victim.name} ถูกขับออกจากยาน! ผู้เล่นคนนี้คือคนร้าย!`
        } else {
          outcomeText = `${victim.name} ถูกขับออกจากยาน! ผู้เล่นคนนี้ไม่ใช่คนร้าย...`
        }
      }
    }

    try {
      if (dodoWon) {
        // Dodo instant win!
        await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
          status: 'ended',
          players: updatedPlayers,
          winner: 'dodo',
          winReason: outcomeText,
          gameTimerRunning: false,
          killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
          'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: true, isTie: false, electedTarget, voteCounts: counts },
        })
      } else {
        // Check if all impostors eliminated
        const allImpostors = Object.values(updatedPlayers).filter(p => p.role === 'impostor')
        const remainingImpostors = allImpostors.filter(p => p.isAlive)
        const remainingCrew = Object.values(updatedPlayers).filter(p => p.role !== 'impostor' && p.isAlive)

        if (allImpostors.length > 0 && remainingImpostors.length === 0) {
          // Crewmates win!
          await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'ended',
            players: updatedPlayers,
            winner: 'crewmate',
            winReason: 'โหวตคนร้ายออกหมดแล้ว! ฝ่ายคนดีเป็นผู้ชนะ!',
            gameTimerRunning: false,
            killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
            'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: false, isTie, electedTarget, voteCounts: counts },
          })
        } else if (remainingImpostors.length >= remainingCrew.length && remainingImpostors.length > 0) {
          // Impostors win!
          await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'ended',
            players: updatedPlayers,
            winner: 'impostor',
            winReason: `จำนวนคนร้าย (${remainingImpostors.length} คน) เท่ากับหรือมากกว่าฝ่ายคนดีและโดโด้ (${remainingCrew.length} คน) แล้ว! ฝ่ายคนร้ายชนะทันที!`,
            gameTimerRunning: false,
            killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
            'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: false, isTie, electedTarget, voteCounts: counts },
          })
        } else {
          // Move to meeting result screen
          await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'meeting_result',
            players: updatedPlayers,
            'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: false, isTie, electedTarget, voteCounts: counts },
          })
        }
      }
      showToast('สรุปผลการโหวตเรียบร้อย')
    } catch (e) {
      showToast('สรุปผลโหวตล้มเหลว: ' + e.message, 'error')
    }
  }

  // Resume game after meeting result
  const handleResumeGame = async () => {
    try {
      // Sheriff has only 1 shot per entire game - no reloading after meetings
      const updatedPlayers = { ...(gameDoc.players || {}) }
      let sheriffUpdated = false

      const cooldownSec = Number(gameDoc.killCooldownSeconds) > 0 ? Number(gameDoc.killCooldownSeconds) : 30
      const emergencyCdSec = Number(gameDoc.emergencyCooldownSeconds) > 0 ? Number(gameDoc.emergencyCooldownSeconds) : 60
      const payload = {
        status: 'playing',
        gameTimerRunning: true,
        timerUpdatedAt: Date.now(),
        killCooldownUntil: Date.now() + (cooldownSec * 1000),
        emergencyCooldownUntil: Date.now() + (emergencyCdSec * 1000),
        meeting: null,
      }
      if (sheriffUpdated) {
        payload.players = updatedPlayers
      }

      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), payload)
      const emTimeText = emergencyCdSec >= 60 ? `${Math.floor(emergencyCdSec / 60)} นาที` : `${emergencyCdSec} วินาที`
      showToast(`เล่นเกมต่อแล้ว! ห้ามเรียกประชุมฉุกเฉิน ${emTimeText} (ห้ามฆ่า ${cooldownSec} วินาที)`)
    } catch (e) {
      showToast('กลับสู่เกมล้มเหลว', 'error')
    }
  }

  // End Game
  const handleEndGame = async (winner, winReason) => {
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'ended',
        winner,
        winReason,
        gameTimerRunning: false,
      })
    } catch (e) {
      console.warn('End game write error:', e)
    }
  }

  // Reset Game to Lobby
  const handleResetGame = async () => {
    if (!window.confirm('ยืนยันรีเซ็ตเกมและกลับสู่ล็อบบี้?')) return
    try {
      const resetPlayers = {}
      allPlayersList.forEach(p => {
        resetPlayers[p.uid] = {
          ...p,
          role: 'crewmate',
          isAlive: true,
          tasks: [],
          ready: false,
          sheriffShots: 0,
        }
      })
      setAdminMeetingMinimized(false)
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'waiting',
        gameSecondsRemaining: (gameDoc.gameDurationMinutes || 20) * 60,
        gameTimerRunning: false,
        killCooldownUntil: 0,
        players: resetPlayers,
        sabotage: { active: false, id: '', title: '', status: 'idle', countdownSeconds: 90, startedAt: 0 },
        meeting: null,
        winner: null,
        winReason: '',
      })
      showToast('รีเซ็ตเกมกลับสู่ล็อบบี้แล้ว')
    } catch (e) {
      showToast('รีเซ็ตล้มเหลว: ' + e.message, 'error')
    }
  }

  // ── Verification of Task by Admin ───────────────────────
  const verifyTask = async (playerUid, taskId) => {
    const player = gameDoc.players?.[playerUid]
    if (!player) return
    const updatedTasks = (player.tasks || []).map(t => {
      if (t.id === taskId) {
        return { ...t, verified: true, verifiedAt: new Date().toISOString() }
      }
      return t
    })
    try {
      const updatedPlayers = {
        ...(gameDoc.players || {}),
        [playerUid]: { ...player, tasks: updatedTasks },
      }

      // Check if all Crewmate/Sheriff tasks are 100% completed
      let totalGoodTasks = 0
      let completedGoodTasks = 0
      Object.values(updatedPlayers).forEach(p => {
        if (p.role === 'impostor' || p.role === 'dodo') return
        (p.tasks || []).forEach(t => {
          totalGoodTasks++
          if (t.verified) completedGoodTasks++
        })
      })

      const updates = {
        [`players.${playerUid}.tasks`]: updatedTasks,
      }

      if (gameDoc.status === 'playing' && totalGoodTasks > 0 && completedGoodTasks >= totalGoodTasks) {
        updates.status = 'ended'
        updates.winner = 'crewmate'
        updates.winReason = 'ฝ่ายคนดีทำภารกิจครบ 100% สำเร็จก่อนหมดเวลา! ฝ่ายคนดีชนะ!'
        updates.gameTimerRunning = false
      }

      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), updates)
      playTaskSuccessSound()
      showToast(`ยืนยันภารกิจของ ${player.name} สำเร็จ`)
    } catch (e) {
      showToast('ยืนยันภารกิจล้มเหลว', 'error')
    }
  }

  // Camera QR Scanner for Admin
  useEffect(() => {
    if (!scannerOpen) return
    let html5QrCode = null
    const scannerId = 'allofus-admin-qr-reader'

    setTimeout(() => {
      const el = document.getElementById(scannerId)
      if (!el) return
      html5QrCode = new Html5Qrcode(scannerId)
      qrScannerRef.current = html5QrCode

      html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          try {
            const data = JSON.parse(decodedText)
            if (data.type === 'allofus_task' && data.playerUid && data.taskId) {
              verifyTask(data.playerUid, data.taskId)
              setScannerOpen(false)
            } else {
              showToast('QR Code ไม่ตรงกับรูปแบบภารกิจ', 'error')
            }
          } catch {
            showToast('QR Code ข้อมูลไม่ถูกต้อง', 'error')
          }
        },
        () => {}
      ).catch(err => {
        console.warn('Camera scanner start error:', err)
        showToast('ไม่สามารถเปิดกล้องได้: ' + err.message, 'error')
        setScannerOpen(false)
      })
    }, 150)

    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => {}).then(() => {
          qrScannerRef.current?.clear()
          qrScannerRef.current = null
        })
      }
    }
  }, [scannerOpen])

  // ── Task Pool Management (Add, Edit, Delete) ────────────
  const handleAddTaskToPool = async () => {
    if (!newTaskTitle.trim()) {
      showToast('กรุณาระบุชื่อภารกิจ', 'error')
      return
    }
    const pool = gameDoc?.taskPool || DEFAULT_TASKS_POOL
    const item = {
      id: `t_${Date.now()}`,
      title: newTaskTitle.trim(),
      desc: newTaskDesc.trim() || 'ทำภารกิจให้สำเร็จและให้แอดมินสแกนยืนยัน',
      floor: Number(newTaskFloor) || 1,
      room: newTaskRoom || BUILDING_FLOORS[0].rooms[0],
      maxAssignedCount: Math.min(3, Math.max(1, Number(newTaskMaxAssignedCount) || 3)),
    }
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        taskPool: [...pool, item]
      })
      setNewTaskTitle('')
      setNewTaskDesc('')
      setNewTaskMaxAssignedCount(3)
      showToast('เพิ่มภารกิจลงคลังสำเร็จ')
    } catch (e) {
      showToast('เพิ่มภารกิจล้มเหลว', 'error')
    }
  }

  const handleUpdateTaskInPool = async () => {
    if (!editingTask || !editingTask.title.trim()) return
    const pool = gameDoc?.taskPool || DEFAULT_TASKS_POOL
    const updated = pool.map(t => t.id === editingTask.id ? {
      ...t,
      title: editingTask.title.trim(),
      desc: (editingTask.desc || '').trim(),
      floor: Number(editingTask.floor) || 1,
      room: editingTask.room || BUILDING_FLOORS[0].rooms[0],
      maxAssignedCount: Math.min(3, Math.max(1, Number(editingTask.maxAssignedCount) || 3)),
    } : t)
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        taskPool: updated
      })
      setEditingTask(null)
      showToast('บันทึกการแก้ไขภารกิจสำเร็จ')
    } catch (e) {
      showToast('แก้ไขภารกิจล้มเหลว', 'error')
    }
  }

  const handleDeleteTaskFromPool = async (taskId) => {
    if (!window.confirm('ยืนยันลบภารกิจนี้ออกจากคลัง?')) return
    const pool = gameDoc?.taskPool || DEFAULT_TASKS_POOL
    const updated = pool.filter(t => t.id !== taskId)
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        taskPool: updated
      })
      showToast('ลบภารกิจออกจากคลังแล้ว')
    } catch (e) {
      showToast('ลบภารกิจล้มเหลว', 'error')
    }
  }

  const handleResetTasksToDefault = async () => {
    if (!window.confirm('ยืนยันรีเซ็ตคลังภารกิจกลับเป็นค่าเริ่มต้น (20 ภารกิจ กระจายครบ 5 ชั้น ชั้นละ 4 ภารกิจ)?')) return
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        taskPool: DEFAULT_TASKS_POOL
      })
      showToast('รีเซ็ตคลังภารกิจสำเร็จ (20 ภารกิจ)')
    } catch (e) {
      showToast('รีเซ็ตคลังภารกิจล้มเหลว', 'error')
    }
  }

  // ── Sabotage Pool Management (Add, Edit, Delete) ────────
  const handleAddSabotageToPool = async () => {
    if (!newSabTitle.trim()) {
      showToast('กรุณาระบุชื่อ Sabotage', 'error')
      return
    }
    const pool = gameDoc?.sabotagePool || DEFAULT_SABOTAGE_POOL
    const item = {
      id: `sab_${Date.now()}`,
      title: newSabTitle.trim(),
      desc: newSabDesc.trim() || 'สถานการณ์ฉุกเฉิน คนดีต้องรีบไปแก้ปัญหากับแอดมิน',
      countdownSeconds: Math.max(10, Number(newSabCountdown) || 90),
      timeoutAction: newSabTimeoutAction || 'continue',
    }
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        sabotagePool: [...pool, item]
      })
      setNewSabTitle('')
      setNewSabDesc('')
      setNewSabCountdown(90)
      showToast('เพิ่ม Sabotage ลงคลังสำเร็จ')
    } catch (e) {
      showToast('เพิ่ม Sabotage ล้มเหลว', 'error')
    }
  }

  const handleUpdateSabotageInPool = async () => {
    if (!editingSabotage || !editingSabotage.title.trim()) return
    const pool = gameDoc?.sabotagePool || DEFAULT_SABOTAGE_POOL
    const updated = pool.map(s => s.id === editingSabotage.id ? {
      ...s,
      title: editingSabotage.title.trim(),
      desc: (editingSabotage.desc || '').trim(),
      countdownSeconds: Math.max(10, Number(editingSabotage.countdownSeconds) || 90),
      timeoutAction: editingSabotage.timeoutAction || 'continue',
    } : s)
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        sabotagePool: updated
      })
      setEditingSabotage(null)
      showToast('บันทึกการแก้ไข Sabotage สำเร็จ')
    } catch (e) {
      showToast('แก้ไข Sabotage ล้มเหลว', 'error')
    }
  }

  const handleDeleteSabotageFromPool = async (sabId) => {
    if (!window.confirm('ยืนยันลบ Sabotage นี้ออกจากคลัง?')) return
    const pool = gameDoc?.sabotagePool || DEFAULT_SABOTAGE_POOL
    const updated = pool.filter(s => s.id !== sabId)
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        sabotagePool: updated
      })
      showToast('ลบ Sabotage ออกจากคลังแล้ว')
    } catch (e) {
      showToast('ลบ Sabotage ล้มเหลว', 'error')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#060913',
      backgroundImage: `
        radial-gradient(1.5px 1.5px at 25px 35px, #ffffff, rgba(0,0,0,0)),
        radial-gradient(1px 1px at 60px 85px, #80d8ff, rgba(0,0,0,0)),
        radial-gradient(1.5px 1.5px at 120px 45px, #ffffff, rgba(0,0,0,0)),
        radial-gradient(2px 2px at 190px 140px, #ffe082, rgba(0,0,0,0)),
        radial-gradient(1.5px 1.5px at 270px 210px, #ffffff, rgba(0,0,0,0)),
        radial-gradient(1px 1px at 340px 95px, #80d8ff, rgba(0,0,0,0)),
        radial-gradient(2px 2px at 390px 270px, #ffffff, rgba(0,0,0,0))
      `,
      backgroundRepeat: 'repeat',
      backgroundSize: '420px 420px',
      color: '#e0e6ed',
      fontFamily: "'Sarabun', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflowX: 'hidden'
    }}>

      {/* ─── AMONG US GLOBAL CSS STYLES ─── */}
      <style>{`
        @keyframes auTwinkle {
          0%, 100% { opacity: 0.3; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes auEjectSpin {
          0% { transform: translateX(-140px) translateY(0px) rotate(0deg); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateX(390px) translateY(35px) rotate(720deg); opacity: 0; }
        }
        @keyframes auEmergencyPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 15px rgba(229, 57, 53, 0.5), inset 0 2px 4px rgba(255,255,255,0.4); }
          50% { transform: scale(1.03); box-shadow: 0 0 35px rgba(229, 57, 53, 0.95), 0 0 10px #ff1744, inset 0 2px 8px rgba(255,255,255,0.6); }
        }
        @keyframes auAlarmBlink {
          0%, 100% { background: #b71c1c; }
          50% { background: #e53935; }
        }
        .au-card {
          background: #141c2a;
          border: 2.5px solid #233146;
          border-radius: 18px;
          box-shadow: 0 6px 0 #0a0e17, 0 10px 24px rgba(0, 0, 0, 0.6);
        }
        .au-btn {
          font-family: inherit;
          font-weight: 900;
          border: 2.5px solid #0a0e17;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.08s ease, box-shadow 0.08s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          user-select: none;
          letter-spacing: 0.02em;
        }
        .au-btn:active {
          transform: translateY(3px);
          box-shadow: none !important;
        }
        .au-btn-red {
          background: #c51111;
          color: #ffffff;
          border-bottom: 5px solid #7a0813;
          box-shadow: 0 4px 0 #7a0813, 0 6px 16px rgba(197, 17, 17, 0.45);
        }
        .au-btn-green {
          background: #2e7d32;
          color: #ffffff;
          border-bottom: 5px solid #1b5e20;
          box-shadow: 0 4px 0 #1b5e20, 0 6px 16px rgba(46, 125, 50, 0.45);
        }
        .au-btn-blue {
          background: #0288d1;
          color: #ffffff;
          border-bottom: 5px solid #01579b;
          box-shadow: 0 4px 0 #01579b, 0 6px 16px rgba(2, 136, 209, 0.45);
        }
        .au-btn-purple {
          background: #8e24aa;
          color: #ffffff;
          border-bottom: 5px solid #4a148c;
          box-shadow: 0 4px 0 #4a148c, 0 6px 16px rgba(142, 36, 170, 0.45);
        }
        .au-btn-yellow {
          background: #fbc02d;
          color: #0a0e17;
          border-bottom: 5px solid #c47100;
          box-shadow: 0 4px 0 #c47100, 0 6px 16px rgba(251, 192, 45, 0.45);
        }
        .au-btn-dark {
          background: #1e293b;
          color: #ffffff;
          border-bottom: 5px solid #0a0e17;
          box-shadow: 0 4px 0 #0a0e17;
        }
        @keyframes scanPulse {
          0%, 100% { opacity: 0.35; transform: scale(0.96); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .au-role-hidden {
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
        }
      `}</style>

      {/* ─── GLOBAL HEADER BAR ─── */}
      <header style={{
        background: 'rgba(13, 19, 31, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '2.5px solid #1f2c42',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AmongUsVisor
            role="crewmate"
            color="#0288d1"
            isAlive={true}
            size={30}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', color: '#ff5252', lineHeight: 1.1 }}>
              ALL OF US WILL DIE
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              THE SKELD MISSION
            </div>
          </div>
        </div>

        {/* Right Action: Admin Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Admin Switcher */}
          {hasAdminPerm && (
            <button
              type="button"
              onClick={() => setIsAdminView(v => !v)}
              className="au-btn"
              style={{
                padding: '6px 12px',
                fontSize: 11,
                background: isAdminView ? '#c51111' : '#1e293b',
                color: '#fff',
                borderBottom: `3.5px solid ${isAdminView ? '#7a0813' : '#0f172a'}`,
              }}
            >
              <i className="fas fa-crown" style={{ fontSize: 10, color: isAdminView ? '#fff' : '#ffd54f' }} />
              <span>{isAdminView ? 'จอกรรมการ' : 'สลับแอดมิน'}</span>
            </button>
          )}

          {/* Exit / Return button */}
          <button
            type="button"
            onClick={() => showPage('home')}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '1.5px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="กลับหน้าหลัก"
          >
            <i className="fas fa-times" style={{ fontSize: 13 }} />
          </button>
        </div>
      </header>

      {/* ─── ICONIC TOP TASK BAR (AMONG US STYLE) ─── */}
      <div style={{
        maxWidth: 640,
        width: '100%',
        margin: '12px auto 0',
        padding: '0 16px',
        boxSizing: 'border-box',
      }}>
        <div
          onClick={() => {
            if (gameDoc.status !== 'playing') return
            if (myRole === 'impostor') {
              // Dead Impostors can still sabotage in Among Us
              setShowSabotageModal(true)
            } else if (myRole === 'sheriff') {
              if (!isAlive) return
              if (killCooldownSec > 0) {
                showToast(`อยู่ในช่วงเวลาห้ามฆ่า (เหลืออีก ${killCooldownSec} วินาที)`, 'error')
                return
              }
              const shots = me?.sheriffShots !== undefined ? me.sheriffShots : 1
              if (shots <= 0) {
                showToast('คุณใช้สิทธิ์ยิงไปแล้ว (มีสิทธิ์ยิง 1 นัดต่อทั้งเกม)', 'error')
                return
              }
              setSelectedSheriffTarget(null)
              setShowSheriffKillModal(true)
            }
          }}
          style={{
            background: '#0d131d',
            border: '2.5px solid #233147',
            borderRadius: 14,
            padding: '8px 12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}>
            <span style={{
              fontSize: 10.5,
              fontWeight: 900,
              letterSpacing: '0.08em',
              color: (gameDoc.sabotage?.active && gameDoc.sabotage.id === 'sab_comms') ? '#ff5252' : '#8bc34a',
              textTransform: 'uppercase',
            }}>
              <i className="fas fa-tasks" style={{ marginRight: 6 }} />
              {gameDoc.sabotage?.active && gameDoc.sabotage.id === 'sab_comms'
                ? 'COMMUNICATIONS SABOTAGED'
                : 'TOTAL TASKS COMPLETED'}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 900,
              color: '#6bfb5b',
              fontFamily: 'monospace',
            }}>
              {gameDoc.sabotage?.active && gameDoc.sabotage.id === 'sab_comms' ? '??%' : `${progressPercent}%`}
            </span>
          </div>

          {/* Outer Segmented Slot Bar with 10 Divider Notches */}
          <div style={{
            height: 16,
            background: '#080d14',
            borderRadius: 8,
            border: '2px solid #000',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Lime Green Progress Fill */}
            <div style={{
              height: '100%',
              width: (gameDoc.sabotage?.active && gameDoc.sabotage.id === 'sab_comms') ? '0%' : `${progressPercent}%`,
              background: 'linear-gradient(180deg, #99ff88 0%, #46dd3b 50%, #2bb822 100%)',
              boxShadow: '0 0 12px rgba(107, 251, 91, 0.8)',
              transition: 'width 0.4s ease',
            }} />

            {/* Overlaid 10 Segment Divider Notches */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(10, 1fr)',
              pointerEvents: 'none',
            }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} style={{ borderRight: '1.5px solid rgba(0,0,0,0.65)', height: '100%' }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── KILL COOLDOWN / PEACE PERIOD BANNER ─── */}
      {gameDoc.status === 'playing' && killCooldownSec > 0 && (
        <div style={{
          maxWidth: 640,
          width: '100%',
          margin: '10px auto 0',
          padding: '0 16px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.22) 0%, rgba(245, 124, 0, 0.12) 100%)',
            border: '2px solid #ff9800',
            borderRadius: 14,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 4px 18px rgba(255, 152, 0, 0.25)',
            animation: 'auEmergencyPulse 1.8s infinite ease-in-out',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(255, 152, 0, 0.25)',
                border: '1.5px solid #ffb74d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className="fas fa-shield-alt" style={{ fontSize: 18, color: '#ffb74d' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#ffe082', letterSpacing: '0.02em' }}>
                  ช่วงเวลาห้ามฆ่า (PEACE PERIOD)
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.85)', marginTop: 2 }}>
                  ทุกคนไม่สามารถฆ่าใครได้ในขณะนี้
                </div>
              </div>
            </div>
            <div style={{
              background: '#0d131d',
              border: '2px solid #ff9800',
              borderRadius: 10,
              padding: '6px 12px',
              textAlign: 'center',
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: '#ffb74d', textTransform: 'uppercase' }}>
                เหลืออีก
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: 'monospace', lineHeight: 1.1 }}>
                {killCooldownSec}s
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── EMERGENCY MEETING COOLDOWN BANNER ─── */}
      {gameDoc.status === 'playing' && emergencyCooldownSec > 0 && (
        <div style={{
          maxWidth: 640,
          width: '100%',
          margin: '10px auto 0',
          padding: '0 16px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(229, 57, 53, 0.22) 0%, rgba(198, 40, 40, 0.12) 100%)',
            border: '2px solid #ef5350',
            borderRadius: 14,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 4px 18px rgba(239, 83, 80, 0.25)',
            animation: 'auEmergencyPulse 1.8s infinite ease-in-out',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(229, 57, 53, 0.25)',
                border: '1.5px solid #ff7961',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className="fas fa-bullhorn" style={{ fontSize: 18, color: '#ff7961' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#ffcdd2', letterSpacing: '0.02em' }}>
                  ห้าม EMERGENCY MEETING
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.85)', marginTop: 2 }}>
                  คูลดาวน์ห้ามเรียกประชุมฉุกเฉินหลังการประชุม (แจ้งพบศพได้ตามปกติ)
                </div>
              </div>
            </div>
            <div style={{
              background: '#0d131d',
              border: '2px solid #ef5350',
              borderRadius: 10,
              padding: '6px 12px',
              textAlign: 'center',
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: '#ff7961', textTransform: 'uppercase' }}>
                เหลืออีก
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: 'monospace', lineHeight: 1.1 }}>
                {emergencyCooldownSec >= 60 ? `${Math.floor(emergencyCooldownSec / 60)}m ${emergencyCooldownSec % 60}s` : `${emergencyCooldownSec}s`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ACTIVE SABOTAGE BANNER ─── */}
      {gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active' && (
        <div
          onClick={() => playSabotageAlarm()}
          style={{
            background: 'linear-gradient(90deg, #b71c1c 0%, #d32f2f 50%, #b71c1c 100%)',
            color: '#fff',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '2.5px solid #ff5252',
            animation: 'auAlarmBlink 1.2s infinite',
            marginTop: 8,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: 18, color: '#ffebee' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{gameDoc.sabotage.title}</span>
                <span style={{
                  fontSize: 10,
                  background: gameDoc.sabotage.timeoutAction === 'end_game' ? 'rgba(183, 28, 28, 0.7)' : 'rgba(46, 125, 50, 0.7)',
                  border: `1px solid ${gameDoc.sabotage.timeoutAction === 'end_game' ? '#ff5252' : '#81c784'}`,
                  padding: '1px 6px', borderRadius: 4, fontWeight: 800,
                }}>
                  {gameDoc.sabotage.timeoutAction === 'end_game' ? 'หมดเวลา: เกมจบ' : 'หมดเวลา: เกมเดินต่อ'}
                </span>
                <span style={{
                  fontSize: 10, background: 'rgba(0,0,0,0.3)',
                  padding: '2px 7px', borderRadius: 6, fontWeight: 800,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <i className="fas fa-volume-up" />
                  ไซเรน
                </span>
              </div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>
                {gameDoc.sabotage.desc || 'คนดีต้องรีบไปแก้ปัญหากับแอดมินในชีวิตจริง!'}
              </div>
            </div>
          </div>
          <div style={{
            fontSize: 18, fontWeight: 900,
            background: 'rgba(0,0,0,0.5)',
            border: '1.5px solid rgba(255,255,255,0.2)',
            padding: '3px 9px', borderRadius: 8,
            fontFamily: 'monospace',
          }}>
            {fmtTime(sabotageTimeSec)}
          </div>
        </div>
      )}

      {/* ─── PENDING SABOTAGE NOTICE FOR IMPOSTOR ─── */}
      {myRole === 'impostor' && gameDoc.sabotage?.active && gameDoc.sabotage.status === 'pending_approval' && (
        <div style={{
          background: 'rgba(197, 17, 17, 0.15)',
          border: '1.5px dashed #c51111',
          borderRadius: 12,
          color: '#ff8a80',
          padding: '10px 16px',
          margin: '10px 16px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 12.5,
          fontWeight: 800,
        }}>
          <i className="fas fa-hourglass-half fa-spin" style={{ color: '#ff5252', fontSize: 16 }} />
          <div>
            <div style={{ fontWeight: 900, color: '#fff' }}>
              ส่งคำขอ Sabotage &quot;{gameDoc.sabotage.title}&quot; แล้ว
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              ระบบกำลังรอให้แอดมินกดยืนยันอนุมัติในระบบ
            </div>
          </div>
        </div>
      )}

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <main style={{ flex: 1, padding: '14px 16px 80px', maxWidth: 640, width: '100%', margin: '0 auto' }}>

        {/* ─── CREW REGISTRATION (ENTER YOUR NAME) ─── */}
        {(!myUid || !me) && !isAdminView && (
          <div className="au-card" style={{
            padding: 24,
            marginBottom: 20,
            border: '2.5px solid #29b6f6',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1)',
            textAlign: 'center',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <AmongUsVisor color={selectedJoinColor || '#c62828'} isAlive={true} size={64} />
            </div>

            <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', letterSpacing: '0.04em', marginBottom: 4 }}>
              ลงทะเบียนลูกเรือ (CREW REGISTRATION)
            </div>
            <div style={{ fontSize: 12, color: '#80d8ff', marginBottom: 18, fontWeight: 700 }}>
              กรอกชื่อของคุณเพื่อเข้าร่วมภารกิจในยาน THE SKELD
            </div>

            <div style={{ textAlign: 'left', marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.7)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <i className="fas fa-id-badge" style={{ marginRight: 6, color: '#ffd54f' }} />
                ชื่อของคุณ (PLAYER NAME)
              </label>
              <input
                type="text"
                placeholder="พิมพ์ชื่อของคุณ (เช่น Red, ฟ้า, แบงค์)..."
                value={directJoinName}
                maxLength={18}
                onChange={e => setDirectJoinName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleDirectJoin() }}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: '#0a0f18',
                  color: '#fff',
                  border: '2px solid #384d6b',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ textAlign: 'left', marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <i className="fas fa-palette" style={{ marginRight: 6, color: '#ffd54f' }} />
                  เลือกสีตัวละคร (CHOOSE COLOR)
                </label>
                <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)' }}>
                  ห้ามเลือกสีซ้ำกัน
                </span>
              </div>
              <TwentyColorPalette
                selectedColor={selectedJoinColor}
                players={gameDoc.players}
                currentUid={null}
                onSelect={(hex) => setSelectedJoinColor(hex)}
              />
            </div>

            <button
              type="button"
              onClick={handleDirectJoin}
              className="au-btn au-btn-red"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: '0.06em',
                borderRadius: 14,
              }}
            >
              <i className="fas fa-rocket" style={{ marginRight: 8 }} />
              เข้าร่วมภารกิจ (JOIN CREW)
            </button>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── ADMIN / GAME MASTER CONTROL PANEL ─────────────────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {isAdminView && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Admin Menubar (4 Tabs) */}
            <div style={{
              position: 'sticky',
              top: 54,
              zIndex: 40,
              background: 'rgba(12, 16, 28, 0.96)',
              backdropFilter: 'blur(10px)',
              border: '2.5px solid #233146',
              borderRadius: 16,
              padding: '6px',
              boxShadow: '0 6px 0 #0a0e17, 0 8px 24px rgba(0,0,0,0.6)',
              marginBottom: 4,
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
              }}>
                <button
                  type="button"
                  onClick={() => setAdminTab('control')}
                  className="au-btn"
                  style={{
                    padding: '8px 4px',
                    fontSize: 11,
                    borderRadius: 10,
                    background: adminTab === 'control' ? '#fbc02d' : '#141c2a',
                    color: adminTab === 'control' ? '#0a0e17' : 'rgba(255,255,255,0.7)',
                    border: `2px solid ${adminTab === 'control' ? '#f57f17' : '#233146'}`,
                    borderBottom: `3.5px solid ${adminTab === 'control' ? '#c47100' : '#0a0e17'}`,
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <i className="fas fa-gamepad" style={{ fontSize: 13 }} />
                  <span>ควบคุมเกม</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminTab('players')}
                  className="au-btn"
                  style={{
                    padding: '8px 4px',
                    fontSize: 11,
                    borderRadius: 10,
                    background: adminTab === 'players' ? '#0288d1' : '#141c2a',
                    color: adminTab === 'players' ? '#fff' : 'rgba(255,255,255,0.7)',
                    border: `2px solid ${adminTab === 'players' ? '#40c4ff' : '#233146'}`,
                    borderBottom: `3.5px solid ${adminTab === 'players' ? '#01579b' : '#0a0e17'}`,
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <i className="fas fa-users" style={{ fontSize: 13 }} />
                  <span>ลูกเรือ ({allPlayersList.length}/15)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminTab('tasks')}
                  className="au-btn"
                  style={{
                    padding: '8px 4px',
                    fontSize: 11,
                    borderRadius: 10,
                    background: adminTab === 'tasks' ? '#2e7d32' : '#141c2a',
                    color: adminTab === 'tasks' ? '#fff' : 'rgba(255,255,255,0.7)',
                    border: `2px solid ${adminTab === 'tasks' ? '#66bb6a' : '#233146'}`,
                    borderBottom: `3.5px solid ${adminTab === 'tasks' ? '#1b5e20' : '#0a0e17'}`,
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <i className="fas fa-tasks" style={{ fontSize: 13 }} />
                  <span>ภารกิจ/QR</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminTab('sabotage')}
                  className="au-btn"
                  style={{
                    padding: '8px 4px',
                    fontSize: 11,
                    borderRadius: 10,
                    background: adminTab === 'sabotage' ? '#c51111' : '#141c2a',
                    color: adminTab === 'sabotage' ? '#fff' : 'rgba(255,255,255,0.7)',
                    border: `2px solid ${adminTab === 'sabotage' ? '#ff5252' : '#233146'}`,
                    borderBottom: `3.5px solid ${adminTab === 'sabotage' ? '#7a0813' : '#0a0e17'}`,
                    flexDirection: 'column',
                    gap: 3,
                    position: 'relative',
                  }}
                >
                  {gameDoc.sabotage?.active && (
                    <span style={{
                      position: 'absolute',
                      top: 3,
                      right: 3,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#ff1744',
                      boxShadow: '0 0 8px #ff1744',
                    }} />
                  )}
                  <i className="fas fa-radiation" style={{ fontSize: 13 }} />
                  <span>ซาโบตาจ/กฎ</span>
                </button>
              </div>
            </div>

            {/* ─── TAB 1: ควบคุมเกม (MISSION CONTROL) ─── */}
            {adminTab === 'control' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Admin Header Card */}
            <div className="au-card" style={{
              padding: 18,
              border: '2.5px solid #fbc02d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 11, color: '#fbc02d', fontWeight: 900, letterSpacing: '0.08em' }}>
                  GAME MASTER CONTROLLER
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                  สถานะเกม: {
                    gameDoc.status === 'waiting' ? 'รอเริ่มเกมในล็อบบี้' :
                    gameDoc.status === 'playing' ? 'กำลังเล่นเกม' :
                    gameDoc.status === 'meeting_called' ? 'เรียกประชุมฉุกเฉิน' :
                    gameDoc.status === 'meeting_discussion' ? 'กำลังอภิปราย (3 นาที)' :
                    gameDoc.status === 'meeting_voting' ? 'เปิดโหวต (1 นาทีสุดท้าย)' :
                    gameDoc.status === 'meeting_result' ? 'สรุปผลการโหวต' : 'จบเกมแล้ว'
                  }
                </div>
              </div>

              {/* Camera Scanner Trigger */}
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="au-btn au-btn-red"
                style={{ padding: '9px 14px', fontSize: 12.5 }}
              >
                <i className="fas fa-qrcode" />
                <span>สแกนตรวจภารกิจ</span>
              </button>
            </div>

            {/* Admin Quick Game Controls */}
            <div className="au-card" style={{ padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
                การควบคุมเวลาและสถานะเกม
              </div>

              {gameDoc.status === 'waiting' ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>ตั้งเวลาเล่นเกม:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameDurationMinutes: Math.max(5, (gameDoc.gameDurationMinutes || 20) - 5),
                          gameSecondsRemaining: Math.max(5, (gameDoc.gameDurationMinutes || 20) - 5) * 60,
                        })}
                        className="au-btn au-btn-dark"
                        style={{ width: 34, height: 34, fontSize: 13 }}
                      >-5</button>
                      <span style={{ fontSize: 18, fontWeight: 900, color: '#ff5252', fontFamily: 'monospace' }}>
                        {gameDoc.gameDurationMinutes || 20} นาที
                      </span>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameDurationMinutes: (gameDoc.gameDurationMinutes || 20) + 5,
                          gameSecondsRemaining: ((gameDoc.gameDurationMinutes || 20) + 5) * 60,
                        })}
                        className="au-btn au-btn-dark"
                        style={{ width: 34, height: 34, fontSize: 13 }}
                      >+5</button>
                    </div>
                  </div>

                  {/* Kill Cooldown (Peace Period) Setting */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>เวลาห้ามฆ่า (Peace Period):</span>
                      <span style={{ fontSize: 10.5, color: '#ffb74d' }}>นับถอยหลังตอนเริ่มเกม & หลังประชุม</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          killCooldownSeconds: Math.max(5, (Number(gameDoc.killCooldownSeconds) || 30) - 5),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ width: 34, height: 34, fontSize: 13 }}
                      >-5s</button>
                      <span style={{ fontSize: 17, fontWeight: 900, color: '#ff9800', fontFamily: 'monospace', minWidth: 46, textAlign: 'center' }}>
                        {Number(gameDoc.killCooldownSeconds) || 30}s
                      </span>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          killCooldownSeconds: Math.min(180, (Number(gameDoc.killCooldownSeconds) || 30) + 5),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ width: 34, height: 34, fontSize: 13 }}
                      >+5s</button>
                    </div>
                  </div>

                  {/* Emergency Meeting Cooldown Setting */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>เวลาห้ามประชุม (Emergency Cooldown):</span>
                      <span style={{ fontSize: 10.5, color: '#ff8a80' }}>นับถอยหลังห้ามกดประชุมหลังเริ่มเกม & หลังประชุม</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          emergencyCooldownSeconds: Math.max(10, (Number(gameDoc.emergencyCooldownSeconds) || 60) - 10),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ width: 34, height: 34, fontSize: 13 }}
                      >-10s</button>
                      <span style={{ fontSize: 17, fontWeight: 900, color: '#ef5350', fontFamily: 'monospace', minWidth: 54, textAlign: 'center' }}>
                        {Number(gameDoc.emergencyCooldownSeconds) || 60}s
                      </span>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          emergencyCooldownSeconds: Math.min(300, (Number(gameDoc.emergencyCooldownSeconds) || 60) + 10),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ width: 34, height: 34, fontSize: 13 }}
                      >+10s</button>
                    </div>
                  </div>

                  {/* Dynamic Scalable Role Distribution Breakdown Banner */}
                  {(() => {
                    const n = allPlayersList.length
                    let impostorCount = 1
                    if (n >= 13) impostorCount = 3
                    else if (n >= 10) impostorCount = 2
                    else if (n >= 8) impostorCount = Number(gameDoc.impostorCountChoice89) === 2 ? 2 : 1
                    else impostorCount = 1

                    const dodoCount = n >= 4 ? 1 : 0
                    const sheriffCount = n >= 3 ? 1 : 0
                    const crewCount = Math.max(0, n - (impostorCount + dodoCount + sheriffCount))

                    return (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        marginBottom: 14,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (n >= 8 && n <= 9) ? 8 : 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                            สัดส่วนบทบาท ({n} คน):
                          </span>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 800 }}>
                            <span style={{ color: '#ff5252' }}>คนร้าย {impostorCount}</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                            <span style={{ color: '#ce93d8' }}>โดโด้ {dodoCount}</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                            <span style={{ color: '#ffd54f' }}>นายอำเภอ {sheriffCount}</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                            <span style={{ color: '#80d8ff' }}>ลูกเรือ {crewCount}</span>
                          </div>
                        </div>

                        {/* Admin Selector for 8-9 players: choose 1 or 2 Impostors */}
                        {n >= 8 && n <= 9 && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: 8,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            fontSize: 11,
                          }}>
                            <span style={{ color: '#ffcdd2', fontWeight: 700 }}>
                              จำนวนคนร้าย (8-9 คน):
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), { impostorCountChoice89: 1 })}
                                className={`au-btn ${impostorCount === 1 ? 'au-btn-red' : 'au-btn-dark'}`}
                                style={{ padding: '3px 10px', fontSize: 11 }}
                              >
                                1 คน
                              </button>
                              <button
                                type="button"
                                onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), { impostorCountChoice89: 2 })}
                                className={`au-btn ${impostorCount === 2 ? 'au-btn-red' : 'au-btn-dark'}`}
                                style={{ padding: '3px 10px', fontSize: 11 }}
                              >
                                2 คน
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  <button
                    type="button"
                    onClick={handleStartGame}
                    className="au-btn au-btn-red"
                    style={{ width: '100%', padding: '13px', fontSize: 14 }}
                  >
                    <i className="fas fa-play" style={{ marginRight: 8 }} />
                    เริ่มเกม (สุ่มแจกคนละ 3 ภารกิจและเริ่มนับเวลา)
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Alert when main game timer hits 00:00 */}
                  {currentTimeSec === 0 && gameDoc.status === 'playing' && (
                    <div style={{
                      background: 'rgba(197, 17, 17, 0.25)',
                      border: '2px solid #ff5252',
                      borderRadius: 12,
                      padding: '12px 14px',
                      textAlign: 'center',
                      animation: 'auEmergencyPulse 1.5s infinite ease-in-out',
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#ff5252', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <i className="fas fa-hourglass-end" /> หมดเวลาการเล่นหลัก (00:00) แล้ว!
                      </div>
                      <div style={{ fontSize: 11.5, color: '#ffcdd2', marginTop: 2 }}>
                        กรุณาให้ Game Master ตัดสินฝ่ายที่ชนะด้านล่าง หรือกดเพิ่มเวลาเพื่อเล่นต่อ
                      </div>
                    </div>
                  )}

                  {/* Alert when Sabotage timer hits 00:00 */}
                  {sabotageTimeSec === 0 && gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active' && (
                    <div style={{
                      background: 'rgba(183, 28, 28, 0.35)',
                      border: '2px solid #ff1744',
                      borderRadius: 12,
                      padding: '12px 14px',
                      textAlign: 'center',
                      animation: 'auAlarmBlink 1s infinite ease-in-out',
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#ff1744', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <i className="fas fa-radiation fa-spin" /> SABOTAGE หมดเวลาแล้ว (00:00)!
                      </div>
                      <div style={{ fontSize: 11.5, color: '#ffcdd2', marginTop: 2, marginBottom: 8 }}>
                        ลูกเรือกู้สถานการณ์ไม่ทัน — GM สามารถกดตัดสินฝ่ายคนร้ายชนะ หรือกดแก้ไข Sabotage
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('ยืนยันตัดสินให้ ฝ่ายคนร้ายชนะ จากผล Sabotage หมดเวลา?')) {
                              handleEndGame('impostor', `กู้สถานการณ์ Sabotage ไม่ทัน! ${gameDoc.sabotage.title} ทำให้ฝ่ายคนร้ายชนะ!`)
                            }
                          }}
                          className="au-btn au-btn-red"
                          style={{ flex: 1, padding: '8px', fontSize: 11.5 }}
                        >
                          ตัดสินคนร้ายชนะ
                        </button>
                        <button
                          type="button"
                          onClick={resolveSabotage}
                          className="au-btn au-btn-dark"
                          style={{ flex: 1, padding: '8px', fontSize: 11.5 }}
                        >
                          แก้ไข Sabotage
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#ff5252', fontFamily: 'monospace' }}>
                      {fmtTime(currentTimeSec)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameSecondsRemaining: currentTimeSec + 60,
                          timerUpdatedAt: Date.now(),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ padding: '6px 10px', fontSize: 11 }}
                      >+1 นาที</button>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameSecondsRemaining: Math.max(0, currentTimeSec - 60),
                          timerUpdatedAt: Date.now(),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ padding: '6px 10px', fontSize: 11 }}
                      >-1 นาที</button>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameTimerRunning: !gameDoc.gameTimerRunning,
                          timerUpdatedAt: Date.now(),
                        })}
                        className={`au-btn ${gameDoc.gameTimerRunning ? 'au-btn-yellow' : 'au-btn-green'}`}
                        style={{ padding: '6px 12px', fontSize: 11 }}
                      >
                        {gameDoc.gameTimerRunning ? 'หยุดเวลา' : 'เดินเวลา'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {(() => {
                      const isSabotageActive = Boolean(gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active')
                      const isEmergencyCoolingDown = emergencyCooldownSec > 0
                      const isBlocked = isSabotageActive || isEmergencyCoolingDown
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (isSabotageActive) {
                              showToast('มีสัญญาณ Sabotage อยู่ ต้องแก้ไข Sabotage ก่อนจึงจะเรียกประชุมได้', 'error')
                              return
                            }
                            if (isEmergencyCoolingDown) {
                              showToast(`อยู่ในช่วงคูลดาวน์ห้ามเรียกประชุมฉุกเฉิน (เหลืออีก ${emergencyCooldownSec} วินาที)`, 'error')
                              return
                            }
                            callEmergencyMeeting(false)
                          }}
                          className={`au-btn ${isBlocked ? 'au-btn-dark' : 'au-btn-red'}`}
                          style={{
                            flex: 1, padding: '11px', fontSize: 12.5,
                            opacity: isBlocked ? 0.65 : 1,
                            cursor: isBlocked ? 'not-allowed' : 'pointer',
                          }}
                          title={
                            isSabotageActive
                              ? 'ติดสถานะ Sabotage ไม่สามารถเรียกประชุมได้'
                              : isEmergencyCoolingDown
                                ? `อยู่ในช่วงคูลดาวน์ห้ามเรียกประชุม (เหลืออีก ${emergencyCooldownSec} วินาที)`
                                : 'เรียกประชุมฉุกเฉิน'
                          }
                        >
                          <i className={`fas fa-${isSabotageActive ? 'lock' : (isEmergencyCoolingDown ? 'clock' : 'bullhorn')}`} style={{ marginRight: 6 }} />
                          {isSabotageActive
                            ? 'เรียกประชุม (ติด Sabotage)'
                            : isEmergencyCoolingDown
                              ? `ห้ามประชุม (${emergencyCooldownSec}s)`
                              : 'เรียกประชุมด่วน'}
                        </button>
                      )
                    })()}
                    <button
                      type="button"
                      onClick={handleResetGame}
                      className="au-btn au-btn-dark"
                      style={{ padding: '11px 14px', fontSize: 12.5 }}
                    >
                      รีเซ็ตเกม
                    </button>
                  </div>

                  {/* Resume game button if meeting has concluded and on meeting_result screen */}
                  {gameDoc.status === 'meeting_result' && (
                    <button
                      type="button"
                      onClick={handleResumeGame}
                      className="au-btn au-btn-green"
                      style={{ width: '100%', padding: '11px', fontSize: 13, marginTop: 4 }}
                    >
                      <i className="fas fa-play" style={{ marginRight: 6 }} />
                      เล่นเกมต่อ (หมดช่วงประชุม ให้เวลาเดินต่อ)
                    </button>
                  )}

                  {/* Cooldown duration setting during active game */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'rgba(255, 152, 0, 0.08)',
                    border: '1px solid rgba(255, 152, 0, 0.25)',
                    borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fas fa-shield-alt" style={{ color: '#ff9800', fontSize: 12 }} />
                      <span style={{ fontSize: 12, color: '#ffe082', fontWeight: 700 }}>
                        เวลาห้ามฆ่า (Peace Period): {Number(gameDoc.killCooldownSeconds) || 30}s
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          killCooldownSeconds: Math.max(5, (Number(gameDoc.killCooldownSeconds) || 30) - 5),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                      >-5s</button>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          killCooldownSeconds: Math.min(180, (Number(gameDoc.killCooldownSeconds) || 30) + 5),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                      >+5s</button>
                    </div>
                  </div>

                  {/* Emergency Meeting Cooldown duration setting during active game */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'rgba(239, 83, 80, 0.08)',
                    border: '1px solid rgba(239, 83, 80, 0.25)',
                    borderRadius: 10,
                    marginTop: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fas fa-bullhorn" style={{ color: '#ef5350', fontSize: 12 }} />
                      <span style={{ fontSize: 12, color: '#ffcdd2', fontWeight: 700 }}>
                        เวลาห้ามประชุม (Emergency Cooldown): {Number(gameDoc.emergencyCooldownSeconds) || 60}s
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          emergencyCooldownSeconds: Math.max(10, (Number(gameDoc.emergencyCooldownSeconds) || 60) - 10),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                      >-10s</button>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          emergencyCooldownSeconds: Math.min(300, (Number(gameDoc.emergencyCooldownSeconds) || 60) + 10),
                        })}
                        className="au-btn au-btn-dark"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                      >+10s</button>
                    </div>
                  </div>

                  {/* GM Winner Declaration Controls */}
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1.5px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 14,
                    padding: '12px 14px',
                    marginTop: 6,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>
                      <i className="fas fa-gavel" style={{ marginRight: 6, color: '#ffd54f' }} />
                      ตัดสินผลแพ้ชนะ (GM DECLARE WINNER)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('ยืนยันตัดสินให้ ฝ่ายคนดี (CREWMATES) ชนะ?')) {
                            handleEndGame('crewmate', 'Game Master ตัดสินให้ฝ่ายคนดีชนะ!')
                          }
                        }}
                        style={{
                          padding: '10px 6px',
                          borderRadius: 10,
                          background: 'rgba(2, 136, 209, 0.2)',
                          border: '1.5px solid #0288d1',
                          color: '#80d8ff',
                          fontSize: 11.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <i className="fas fa-shield-alt" style={{ fontSize: 14 }} />
                        <span>ฝ่ายคนดีชนะ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('ยืนยันตัดสินให้ ฝ่ายคนร้าย (IMPOSTORS) ชนะ?')) {
                            handleEndGame('impostor', 'Game Master ตัดสินให้ฝ่ายคนร้ายชนะ!')
                          }
                        }}
                        style={{
                          padding: '10px 6px',
                          borderRadius: 10,
                          background: 'rgba(197, 17, 17, 0.2)',
                          border: '1.5px solid #c51111',
                          color: '#ff5252',
                          fontSize: 11.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <i className="fas fa-skull" style={{ fontSize: 14 }} />
                        <span>ฝ่ายคนร้ายชนะ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('ยืนยันตัดสินให้ ฝ่ายโดโด้ (DODO) ชนะ?')) {
                            handleEndGame('dodo', 'Game Master ตัดสินให้โดโด้ชนะ!')
                          }
                        }}
                        style={{
                          padding: '10px 6px',
                          borderRadius: 10,
                          background: 'rgba(142, 36, 170, 0.2)',
                          border: '1.5px solid #8e24aa',
                          color: '#ce93d8',
                          fontSize: 11.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <i className="fas fa-crow" style={{ fontSize: 14 }} />
                        <span>โดโด้ชนะ</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Admin Sabotage Pending Approval Alert */}
            {gameDoc.sabotage?.active && gameDoc.sabotage.status === 'pending_approval' && (
              <div className="au-card" style={{
                background: '#211216', border: '2.5px solid #c51111',
                padding: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ff5252', fontSize: 13, fontWeight: 900, marginBottom: 6 }}>
                  <i className="fas fa-radiation fa-spin" /> มีคำขอ Sabotage จากคนร้าย!
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{gameDoc.sabotage.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{gameDoc.sabotage.desc}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={approveSabotage}
                    className="au-btn au-btn-red"
                    style={{ flex: 1, padding: '10px', fontSize: 12.5 }}
                  >
                    อนุมัติ Sabotage
                  </button>
                  <button
                    type="button"
                    onClick={resolveSabotage}
                    className="au-btn au-btn-dark"
                    style={{ padding: '10px 16px', fontSize: 12.5 }}
                  >
                    ปฏิเสธ / ปิด
                  </button>
                </div>
              </div>
            )}

            {/* Admin Active Sabotage Controls */}
            {gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active' && (
              <div className="au-card" style={{
                background: '#1b1318', border: '2.5px solid #d32f2f',
                padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#ff5252', fontWeight: 900 }}>SABOTAGE กำลังทำงาน</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>{gameDoc.sabotage.title}</div>
                </div>
                <button
                  type="button"
                  onClick={resolveSabotage}
                  className="au-btn au-btn-green"
                  style={{ padding: '9px 14px', fontSize: 12 }}
                >
                  <i className="fas fa-check" style={{ marginRight: 6 }} /> คนดีแก้สำเร็จ
                </button>
              </div>
            )}

              </div>
            )}

            {/* ─── TAB 2: จัดการลูกเรือ (CREW ROSTER) ─── */}
            {adminTab === 'players' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Crew Roster Header & Actions Card */}
                <div className="au-card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#80d8ff', fontWeight: 900, letterSpacing: '0.06em' }}>
                        CREW ROSTER MANIFEST
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                        รายชื่อลูกเรือ: {allPlayersList.length}/15 คน
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                        มีชีวิต: <span style={{ color: '#69f0ae', fontWeight: 800 }}>{allPlayersList.filter(p => p.isAlive).length} คน</span> · เสียชีวิต: <span style={{ color: '#ff5252', fontWeight: 800 }}>{allPlayersList.filter(p => !p.isAlive).length} คน</span> · ภารกิจรวม: <span style={{ color: '#ffd54f', fontWeight: 800 }}>{progressPercent}%</span>
                      </div>
                    </div>

                    {/* Quick Mockup and Room Management Buttons */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleAddMockPlayers}
                        className="au-btn au-btn-blue"
                        style={{ padding: '6px 10px', fontSize: 11 }}
                        title="เติมผู้เล่นจำลอง (Mockup) ให้ครบ 15 คนทันที"
                      >
                        <i className="fas fa-user-plus" />
                        <span>+ เติม Mockup ให้ครบ 15</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveMockPlayers}
                        className="au-btn au-btn-dark"
                        style={{ padding: '6px 10px', fontSize: 11, color: '#ff8a80' }}
                        title="ลบผู้เล่น Mockup ทั้งหมดในห้องออก"
                      >
                        <i className="fas fa-user-minus" />
                        <span>ลบ Mockup ทั้งหมด</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllPlayers}
                        className="au-btn au-btn-dark"
                        style={{ padding: '6px 10px', fontSize: 11, color: '#ff5252' }}
                        title="ล้างรายชื่อผู้เล่นทั้งหมดในห้อง"
                      >
                        <i className="fas fa-trash-alt" />
                        <span>ล้างทั้งหมด</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Admin Player List & Role Inspector */}
                <div className="au-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {allPlayersList.map(p => {
                  const roleColor = p.role === 'impostor' ? '#e53935' : (p.role === 'dodo' ? '#ab47bc' : (p.role === 'sheriff' ? '#fbc02d' : '#29b6f6'))
                  const roleLabel = p.role === 'impostor' ? 'คนร้าย' : (p.role === 'dodo' ? 'โดโด้' : (p.role === 'sheriff' ? 'นายอำเภอ' : 'คนดี'))
                  return (
                    <div
                      key={p.uid}
                      style={{
                        padding: 12, borderRadius: 14,
                        background: 'rgba(255,255,255,0.03)',
                        border: `1.5px solid ${p.isAlive ? '#1f2c42' : 'rgba(255,255,255,0.04)'}`,
                        opacity: p.isAlive ? 1 : 0.6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <AmongUsVisor role={p.role} isAlive={p.isAlive} size={32} color={p.color || null} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                              {p.name} {!p.isAlive && <span style={{ color: '#9e9e9e', fontSize: 10 }}>(ตาย)</span>}
                            </div>
                            <div style={{ fontSize: 11, color: roleColor, fontWeight: 800 }}>
                              {roleLabel} {p.role === 'sheriff' && (
                                <span style={{ color: '#ffd54f', fontSize: 10, marginLeft: 4 }}>
                                  ({(p.sheriffShots !== undefined ? p.sheriffShots : 1) > 0 ? 'เหลือ 1 สิทธิ์' : 'ยิงแล้ว'})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Admin Role Changer Dropdown */}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {['crewmate', 'impostor', 'dodo', 'sheriff'].map(r => {
                            const btnColor = r === 'impostor' ? '#e53935' : (r === 'dodo' ? '#ab47bc' : (r === 'sheriff' ? '#fbc02d' : '#29b6f6'))
                            const btnText = r === 'impostor' ? 'ร้าย' : (r === 'dodo' ? 'โดโด้' : (r === 'sheriff' ? 'นายอำเภอ' : 'ดี'))
                            const isCurrent = p.role === r
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => {
                                  const updates = { [`players.${p.uid}.role`]: r }
                                  if (r === 'sheriff') {
                                    updates[`players.${p.uid}.sheriffShots`] = 1
                                  }
                                  updateDoc(doc(db, 'all_of_us_games', 'active_game'), updates)
                                }}
                                style={{
                                  padding: '3px 7px', borderRadius: 6,
                                  background: isCurrent ? btnColor : 'rgba(255,255,255,0.06)',
                                  color: isCurrent && r === 'sheriff' ? '#111' : '#fff',
                                  border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                }}
                              >
                                {btnText}
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = { ...(gameDoc.players || {}) }
                              updated[p.uid] = { ...p, isAlive: !p.isAlive }

                              if (gameDoc.status === 'playing') {
                                const allImpostors = Object.values(updated).filter(pl => pl.role === 'impostor')
                                const livingImpostors = allImpostors.filter(pl => pl.isAlive)
                                const livingNonImpostors = Object.values(updated).filter(pl => pl.role !== 'impostor' && pl.isAlive)

                                if (livingImpostors.length > 0 && livingImpostors.length >= livingNonImpostors.length) {
                                  updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                                    players: updated,
                                    status: 'ended',
                                    winner: 'impostor',
                                    winReason: `จำนวนคนร้าย (${livingImpostors.length} คน) เท่ากับหรือมากกว่าฝ่ายคนดีและโดโด้ (${livingNonImpostors.length} คน) แล้ว! ฝ่ายคนร้ายชนะทันที!`,
                                    gameTimerRunning: false,
                                    killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
                                  })
                                  return
                                } else if (allImpostors.length > 0 && livingImpostors.length === 0) {
                                  updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                                    players: updated,
                                    status: 'ended',
                                    winner: 'crewmate',
                                    winReason: 'คนร้ายถูกกำจัดหมดแล้ว! ฝ่ายคนดีเป็นผู้ชนะ!',
                                    gameTimerRunning: false,
                                    killCooldownUntil: 0,
          emergencyCooldownUntil: 0,
                                  })
                                  return
                                }
                              }

                              updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                                [`players.${p.uid}.isAlive`]: !p.isAlive
                              })
                            }}
                            style={{
                              padding: '3px 7px', borderRadius: 6,
                              background: p.isAlive ? '#c62828' : '#2e7d32',
                              color: '#fff', border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            {p.isAlive ? 'ฆ่า' : 'ชุบ'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePlayer(p.uid)}
                            style={{
                              padding: '3px 8px', borderRadius: 6,
                              background: 'rgba(244, 67, 54, 0.15)',
                              border: '1px solid rgba(244, 67, 54, 0.35)',
                              color: '#ff5252', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            }}
                            title="ลบผู้เล่นคนนี้ออกจากห้อง"
                          >
                            <i className="fas fa-trash-alt" />
                          </button>
                        </div>
                      </div>

                      {/* Player Assigned Tasks & Manual Verify Button */}
                      {(p.tasks || []).length > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {p.tasks.map(t => (
                            <div
                              key={t.id}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                fontSize: 11.5, color: t.verified ? '#81c784' : 'rgba(255,255,255,0.7)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <i className={`fas fa-${t.verified ? 'check-circle' : 'circle'}`} style={{ fontSize: 9, color: t.verified ? '#4caf50' : '#ffa726' }} />
                                <span>{t.title}</span>
                                <span style={{
                                  fontSize: 9.5, color: '#64b5f6', background: 'rgba(33, 150, 243, 0.12)',
                                  padding: '1px 5px', borderRadius: 4, fontWeight: 700
                                }}>
                                  ชั้น {t.floor || 1} · {t.room || 'โซนหน้า'}
                                </span>
                              </div>
                              {!t.verified && (
                                <button
                                  type="button"
                                  onClick={() => verifyTask(p.uid, t.id)}
                                  style={{
                                    padding: '2px 8px', borderRadius: 6,
                                    background: 'rgba(76, 175, 80, 0.15)',
                                    color: '#81c784', border: '1px solid rgba(76, 175, 80, 0.3)',
                                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                  }}
                                >
                                  ตรวจผ่าน
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            </div>
            )}

            {/* ─── TAB 3: คลังภารกิจและ QR สแกน (TASKS DECK & SCAN) ─── */}
            {adminTab === 'tasks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* GM Camera Scanner Trigger Card */}
                <div className="au-card" style={{
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '2.5px solid #2e7d32',
                  background: 'linear-gradient(135deg, #101f16 0%, #141c2a 100%)',
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#81c784', fontWeight: 900, letterSpacing: '0.06em' }}>
                      GM VERIFICATION TERMINAL
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                      กล้องสแกนตรวจยืนยันภารกิจ
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                      สแกน QR Code หน้าจอผู้เล่น เพื่ออนุมัติภารกิจให้สำเร็จทันที
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="au-btn au-btn-green"
                    style={{ padding: '10px 16px', fontSize: 13, flexShrink: 0 }}
                  >
                    <i className="fas fa-qrcode" />
                    <span>เปิดกล้องสแกน</span>
                  </button>
                </div>

                {/* Task Pool Management */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 16,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                    คลังภารกิจทั้งหมด ({gameDoc.taskPool?.length || 0} ภารกิจ)
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    กำหนดชื่อ รายละเอียด ชั้น 1-5 และห้อง เพื่อให้คนดีไปทำภารกิจในสถานที่จริง
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResetTasksToDefault}
                  style={{
                    padding: '5px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#90caf9', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}
                  title="รีเซ็ตคลังภารกิจเป็นค่าเริ่มต้น 20 ภารกิจ (4 ภารกิจต่อชั้น ครบ 5 ชั้น)"
                >
                  <i className="fas fa-undo-alt" style={{ fontSize: 10 }} />
                  <span>รีเซ็ตค่าเริ่มต้น (20 ภารกิจ)</span>
                </button>
              </div>

              {/* Add New Task Form */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                padding: 12, borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#ff8a80' }}>
                  <i className="fas fa-plus-circle" style={{ marginRight: 5 }} /> เพิ่มภารกิจใหม่
                </div>
                <input
                  type="text"
                  placeholder="ชื่อภารกิจ (เช่น จัดเรียงแก้วน้ำ, ถ่ายรูปคู่กับ DM)"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: '#1c2230',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', fontSize: 12.5, outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <input
                  type="text"
                  placeholder="รายละเอียดภารกิจ (เช่น ไปจัดเรียงแก้วน้ำที่จุดบริการน้ำดื่ม)"
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: '#1c2230',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', fontSize: 12, outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                      ชั้น (1 - 5)
                    </label>
                    <select
                      value={newTaskFloor}
                      onChange={e => {
                        const fl = Number(e.target.value)
                        setNewTaskFloor(fl)
                        const rooms = BUILDING_FLOORS.find(b => b.floor === fl)?.rooms || []
                        setNewTaskRoom(rooms[0] || '')
                      }}
                      style={{
                        width: '100%', padding: '7px 8px', borderRadius: 8,
                        background: '#1c2230', color: '#fff',
                        border: '1px solid rgba(255,255,255,0.15)', fontSize: 12,
                        fontFamily: 'inherit',
                      }}
                    >
                      {BUILDING_FLOORS.map(b => (
                        <option key={b.floor} value={b.floor}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                      ห้อง / โซน
                    </label>
                    <select
                      value={newTaskRoom}
                      onChange={e => setNewTaskRoom(e.target.value)}
                      style={{
                        width: '100%', padding: '7px 8px', borderRadius: 8,
                        background: '#1c2230', color: '#fff',
                        border: '1px solid rgba(255,255,255,0.15)', fontSize: 12,
                        fontFamily: 'inherit',
                      }}
                    >
                      {(BUILDING_FLOORS.find(b => b.floor === Number(newTaskFloor))?.rooms || []).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                      ซ้ำได้สูงสุด
                    </label>
                    <select
                      value={newTaskMaxAssignedCount}
                      onChange={e => setNewTaskMaxAssignedCount(Number(e.target.value))}
                      style={{
                        width: '100%', padding: '7px 8px', borderRadius: 8,
                        background: '#1c2230', color: '#fff',
                        border: '1px solid rgba(255,255,255,0.15)', fontSize: 12,
                        fontFamily: 'inherit',
                      }}
                    >
                      <option value={1}>1 คน (ไม่ซ้ำ)</option>
                      <option value={2}>2 คน</option>
                      <option value={3}>3 คน (สูงสุด)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddTaskToPool}
                  style={{
                    marginTop: 4, padding: '9px 16px', borderRadius: 8,
                    background: '#c62828', color: '#fff',
                    border: 'none', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <i className="fas fa-plus" />
                  <span>เพิ่มภารกิจลงคลัง</span>
                </button>
              </div>

              {/* Floor Filter Tabs */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setTaskFloorFilter('all')}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none',
                    background: taskFloorFilter === 'all' ? '#ff5252' : 'rgba(255,255,255,0.06)',
                    color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  ทั้งหมด ({gameDoc.taskPool?.length || 0})
                </button>
                {BUILDING_FLOORS.map(b => {
                  const count = (gameDoc.taskPool || []).filter(t => (t.floor || 1) === b.floor).length
                  return (
                    <button
                      key={b.floor}
                      type="button"
                      onClick={() => setTaskFloorFilter(b.floor)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: 'none',
                        background: taskFloorFilter === b.floor ? '#ff5252' : 'rgba(255,255,255,0.06)',
                        color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      {b.label} ({count})
                    </button>
                  )
                })}
              </div>

              {/* Task Pool List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {(gameDoc.taskPool || [])
                  .filter(t => taskFloorFilter === 'all' || (t.floor || 1) === Number(taskFloorFilter))
                  .map(t => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 12px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '1px 6px', borderRadius: 4,
                            background: 'rgba(33, 150, 243, 0.15)',
                            color: '#64b5f6', fontSize: 10, fontWeight: 800,
                          }}>
                            <i className="fas fa-map-marker-alt" style={{ fontSize: 8 }} />
                            ชั้น {t.floor || 1} · {t.room || 'โซนหน้า'}
                          </span>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '1px 6px', borderRadius: 4,
                            background: 'rgba(255, 193, 7, 0.15)',
                            color: '#ffd54f', fontSize: 10, fontWeight: 800,
                          }}>
                            <i className="fas fa-users" style={{ fontSize: 8 }} />
                            ซ้ำได้ {t.maxAssignedCount || 3} คน
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>{t.title}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.desc}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => setEditingTask({
                            id: t.id,
                            title: t.title,
                            desc: t.desc || '',
                            floor: t.floor || 1,
                            room: t.room || BUILDING_FLOORS[0].rooms[0],
                            maxAssignedCount: t.maxAssignedCount || 3,
                          })}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: 'none', color: '#90caf9',
                            cursor: 'pointer', padding: '5px 8px', borderRadius: 6, fontSize: 11,
                          }}
                          title="แก้ไขภารกิจ"
                        >
                          <i className="fas fa-pencil-alt" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTaskFromPool(t.id)}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: 'none', color: '#ef5350',
                            cursor: 'pointer', padding: '5px 8px', borderRadius: 6, fontSize: 11,
                          }}
                          title="ลบภารกิจ"
                        >
                          <i className="fas fa-trash-alt" />
                        </button>
                      </div>
                    </div>
                  ))}

                {(gameDoc.taskPool || []).length === 0 && (
                  <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    ยังไม่มีภารกิจในคลัง กรุณาเพิ่มภารกิจ
                  </div>
                )}
              </div>
            </div>
            </div>
            )}

            {/* ─── TAB 4: ซาโบตาจและกติกา (SABOTAGE & RULES) ─── */}
            {adminTab === 'sabotage' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Admin Sabotage Pending Approval Alert */}
                {gameDoc.sabotage?.active && gameDoc.sabotage.status === 'pending_approval' && (
                  <div className="au-card" style={{
                    background: '#211216', border: '2.5px solid #c51111',
                    padding: 16,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ff5252', fontSize: 13, fontWeight: 900, marginBottom: 6 }}>
                      <i className="fas fa-radiation fa-spin" /> มีคำขอ Sabotage จากคนร้าย!
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{gameDoc.sabotage.title}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{gameDoc.sabotage.desc}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={approveSabotage}
                        className="au-btn au-btn-red"
                        style={{ flex: 1, padding: '10px', fontSize: 12.5 }}
                      >
                        อนุมัติ Sabotage
                      </button>
                      <button
                        type="button"
                        onClick={resolveSabotage}
                        className="au-btn au-btn-dark"
                        style={{ padding: '10px 16px', fontSize: 12.5 }}
                      >
                        ปฏิเสธ / ปิด
                      </button>
                    </div>
                  </div>
                )}

                {/* Admin Active Sabotage Controls */}
                {gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active' && (
                  <div className="au-card" style={{
                    background: '#1b1318', border: '2.5px solid #d32f2f',
                    padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#ff5252', fontWeight: 900 }}>SABOTAGE กำลังทำงาน</div>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>{gameDoc.sabotage.title}</div>
                    </div>
                    <button
                      type="button"
                      onClick={resolveSabotage}
                      className="au-btn au-btn-green"
                      style={{ padding: '9px 14px', fontSize: 12 }}
                    >
                      <i className="fas fa-check" style={{ marginRight: 6 }} /> คนดีแก้สำเร็จ
                    </button>
                  </div>
                )}

                {/* Quick GM Sabotage Triggers */}
                <div className="au-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: '#ff8a80', marginBottom: 6, letterSpacing: '0.04em' }}>
                    <i className="fas fa-bolt" style={{ marginRight: 6 }} />
                    จุดชนวน SABOTAGE ทันที (GM OVERRIDE)
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
                    แอดมินสามารถกดส่งสัญญาณ Sabotage ประจำยาน Among Us ให้ลูกเรือทุกคนได้ทันที
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleTriggerPresetSabotage('sab_lights', 'ระบบไฟดับ (ELECTRICAL)', 'ไฟฟ้าดับสนิท ลูกเรือไม่สามารถทำภารกิจได้จนกว่าจะสับสวิตช์แก้ไฟที่จุดกำหนด', 90)}
                      className="au-btn au-btn-red"
                      style={{ padding: '10px 8px', fontSize: 11.5, flexDirection: 'column', gap: 2 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className="fas fa-lightbulb" />
                        <span>ระบบไฟดับ</span>
                      </div>
                      <span style={{ fontSize: 9.5, opacity: 0.85 }}>นับถอยหลัง 90 วิ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerPresetSabotage('sab_o2', 'ออกซิเจนรั่ว (O2 DEPLETION)', 'ระบบออกซิเจนล้มเหลว ลูกเรือต้องรีบไปแตะจุดกู้ภัยภายในเวลา', 60)}
                      className="au-btn au-btn-red"
                      style={{ padding: '10px 8px', fontSize: 11.5, flexDirection: 'column', gap: 2 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className="fas fa-wind" />
                        <span>ออกซิเจนรั่ว</span>
                      </div>
                      <span style={{ fontSize: 9.5, opacity: 0.85 }}>นับถอยหลัง 60 วิ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerPresetSabotage('sab_doors', 'ประตูล็อคฉุกเฉิน (DOORS LOCKDOWN)', 'ประตูกั้นห้องปิดล็อค ลูกเรือติดค้างในห้องเป็นเวลา 45 วินาที', 45)}
                      className="au-btn au-btn-red"
                      style={{ padding: '10px 8px', fontSize: 11.5, flexDirection: 'column', gap: 2 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className="fas fa-door-closed" />
                        <span>ประตูล็อค</span>
                      </div>
                      <span style={{ fontSize: 9.5, opacity: 0.85 }}>นับถอยหลัง 45 วิ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerPresetSabotage('sab_comms', 'สัญญาณขัดข้อง (COMMS SABOTAGED)', 'ระบบสื่อสารล่ม หลอดภารกิจถูกซ่อนและตำแหน่งห้องไม่แสดง', 90)}
                      className="au-btn au-btn-red"
                      style={{ padding: '10px 8px', fontSize: 11.5, flexDirection: 'column', gap: 2 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className="fas fa-broadcast-tower" />
                        <span>สัญญาณขัดข้อง</span>
                      </div>
                      <span style={{ fontSize: 9.5, opacity: 0.85 }}>นับถอยหลัง 90 วิ</span>
                    </button>
                  </div>
                </div>

                {/* Full Rules Trigger Button */}
                <div className="au-card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>กฎและกติกา Among Us สากล</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                      อ่านเงื่อนไขชัยชนะ สัดส่วนบทบาท 15 คน และกติกาการโหวต
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRulesModal(true)}
                    className="au-btn au-btn-blue"
                    style={{ padding: '8px 14px', fontSize: 12 }}
                  >
                    <i className="fas fa-book-open" />
                    <span>เปิดอ่านกฎ</span>
                  </button>
                </div>

                {/* Sabotage Pool Management */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 16,
              border: '1px solid rgba(229, 57, 53, 0.25)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ff8a80' }}>
                    <i className="fas fa-radiation" style={{ marginRight: 6 }} />
                    คลังสถานการณ์ Sabotage ({(gameDoc.sabotagePool || DEFAULT_SABOTAGE_POOL).length} รายการ)
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    เพิ่ม ลบ หรือแก้ไขเหตุการณ์ Sabotage ที่คนร้ายสามารถกดใช้งานในเกม
                  </div>
                </div>
              </div>

              {/* Add New Sabotage Form */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                padding: 12, borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#ff8a80' }}>
                  <i className="fas fa-plus-circle" style={{ marginRight: 5 }} /> เพิ่ม Sabotage ใหม่
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="ชื่อ Sabotage (เช่น ไฟดับ, ประตูล็อค)"
                    value={newSabTitle}
                    onChange={e => setNewSabTitle(e.target.value)}
                    style={{
                      padding: '8px 12px', borderRadius: 8,
                      background: '#1c2230',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#fff', fontSize: 12.5, outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  <div>
                    <input
                      type="number"
                      placeholder="เวลานับถอยหลัง (วิ)"
                      value={newSabCountdown}
                      onChange={e => setNewSabCountdown(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8,
                        background: '#1c2230',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: 12, outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="คำอธิบาย / อาการ (เช่น คนดีต้องรีบไปแจ้งแอดมินที่เคาน์เตอร์)"
                  value={newSabDesc}
                  onChange={e => setNewSabDesc(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: '#1c2230',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', fontSize: 12, outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 2px' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
                    ผลเมื่อหมดเวลา:
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setNewSabTimeoutAction('end_game')}
                      className={`au-btn ${newSabTimeoutAction === 'end_game' ? 'au-btn-red' : 'au-btn-dark'}`}
                      style={{ padding: '4px 10px', fontSize: 11 }}
                    >
                      เกมจบ (คนร้ายชนะ)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSabTimeoutAction('continue')}
                      className={`au-btn ${newSabTimeoutAction !== 'end_game' ? 'au-btn-green' : 'au-btn-dark'}`}
                      style={{ padding: '4px 10px', fontSize: 11 }}
                    >
                      เกมเดินต่อ (เคลียร์ปกติ)
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddSabotageToPool}
                  style={{
                    marginTop: 4, padding: '9px 16px', borderRadius: 8,
                    background: '#c62828', color: '#fff',
                    border: 'none', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <i className="fas fa-plus" />
                  <span>เพิ่ม Sabotage ลงคลัง</span>
                </button>
              </div>

              {/* Sabotage Pool List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {(gameDoc.sabotagePool || DEFAULT_SABOTAGE_POOL).map(s => (
                  <div
                    key={s.id || s.title}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#ff8a80' }}>{s.title}</span>
                        <span style={{
                          padding: '1px 6px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.08)',
                          color: '#ffcc80', fontSize: 10, fontWeight: 800,
                        }}>
                          {s.countdownSeconds || 90} วินาที
                        </span>
                        <span style={{
                          padding: '1px 6px', borderRadius: 4,
                          fontSize: 9.5, fontWeight: 800,
                          background: s.timeoutAction === 'end_game' ? 'rgba(239, 83, 80, 0.25)' : 'rgba(76, 175, 80, 0.25)',
                          color: s.timeoutAction === 'end_game' ? '#ff8a80' : '#81c784',
                          border: `1px solid ${s.timeoutAction === 'end_game' ? '#ef5350' : '#66bb6a'}`,
                        }}>
                          {s.timeoutAction === 'end_game' ? 'หมดเวลา: คนร้ายชนะ' : 'หมดเวลา: เกมเดินต่อ'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.desc}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setEditingSabotage({
                          id: s.id,
                          title: s.title,
                          desc: s.desc || '',
                          countdownSeconds: s.countdownSeconds || 90,
                          timeoutAction: s.timeoutAction || 'continue',
                        })}
                        style={{
                          background: 'rgba(255,255,255,0.06)', border: 'none', color: '#90caf9',
                          cursor: 'pointer', padding: '5px 8px', borderRadius: 6, fontSize: 11,
                        }}
                        title="แก้ไข Sabotage"
                      >
                        <i className="fas fa-pencil-alt" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSabotageFromPool(s.id)}
                        style={{
                          background: 'rgba(255,255,255,0.06)', border: 'none', color: '#ef5350',
                          cursor: 'pointer', padding: '5px 8px', borderRadius: 6, fontSize: 11,
                        }}
                        title="ลบ Sabotage"
                      >
                        <i className="fas fa-trash-alt" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            </div>
          )}

          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── PLAYER VIEW: LOBBY (WAITING STATE) ─────────────────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {!isAdminView && gameDoc.status === 'waiting' && me && (() => {
          const myColor = me.color || null
          const hasPickedColor = Boolean(me.ready && myColor)

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Player Identity Card */}
              <div className="au-card" style={{ padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <AmongUsVisor color={myColor || '#546e7a'} isAlive={true} size={48} />
                  <div>
                    {editingName ? (
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <input
                          type="text"
                          value={nameInput}
                          onChange={e => setNameInput(e.target.value)}
                          placeholder="พิมพ์ชื่อของคุณ"
                          style={{ padding: '6px 10px', borderRadius: 8, background: '#0d131d', color: '#fff', border: '2px solid #233147', fontSize: 13, fontFamily: 'inherit' }}
                        />
                        <button type="button" onClick={saveMyName} className="au-btn au-btn-red" style={{ padding: '6px 12px', fontSize: 11 }}>บันทึก</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>{me.name}</span>
                        <button
                          type="button"
                          onClick={() => { setNameInput(me.name); setEditingName(true) }}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 2 }}
                        >
                          <i className="fas fa-pencil-alt" style={{ fontSize: 12 }} />
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                      Special Event · {hasPickedColor ? `สี ${myColor?.toUpperCase()}` : 'ยังไม่เลือกสี'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { localStorage.removeItem('allofus_player_uid'); setMyUid('') }}
                  className="au-btn au-btn-dark"
                  style={{ padding: '6px 10px', fontSize: 11 }}
                >สลับชื่อ</button>
              </div>

              {/* 20 Distinct Character Colors Palette */}
              <div className="au-card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 900, color: '#fff' }}>เลือกสีตัวละครของคุณ (20 สีไม่ซ้ำกัน)</div>
                  {myColor && (
                    <span style={{ fontSize: 11, color: '#81c784', fontWeight: 800 }}>
                      <i className="fas fa-check-circle" style={{ marginRight: 4 }} />
                      เลือกสีแล้ว
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>
                  สีที่มีคนเลือกแล้วจะมีชื่อกำกับและติ๊กถูก ห้ามเลือกสีซ้ำกัน — ฝ่ายจะถูกสุ่มเมื่อแอดมินเริ่มเกม
                </div>
                <TwentyColorPalette
                  selectedColor={myColor}
                  players={gameDoc.players}
                  currentUid={myUid}
                  onSelect={saveMyColor}
                />
              </div>

              {/* Stealth Waiting Screen */}
              {hasPickedColor && (
                <div className="au-card" style={{ padding: '22px 20px', textAlign: 'center' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'rgba(41,182,246,0.12)', border: '2px solid rgba(41,182,246,0.3)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                  }}>
                    <i className="fas fa-shield-alt" style={{ fontSize: 24, color: '#29b6f6' }} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginBottom: 6 }}>พร้อมแล้ว — รอแอดมินเริ่ม</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 16 }}>
                    ฝ่ายของคุณจะถูกเปิดเผยเมื่อแอดมินกดเริ่มเกม<br />ห้ามบอกสีหรือบทบาทกับผู้อื่น
                  </div>
                  <div style={{
                    background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.25)',
                    borderRadius: 12, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', marginBottom: 16,
                  }}>
                    <i className="fas fa-eye-slash" style={{ color: '#ffc107', fontSize: 15, flexShrink: 0 }} />
                    <div style={{ fontSize: 11.5, color: '#ffecb3', lineHeight: 1.5 }}>
                      <strong>คำแนะนำ:</strong> คว่ำหน้าจอโทรศัพท์ลงเพื่อไม่ให้เพื่อนแอบดู
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowRulesModal(true)}
                    className="au-btn au-btn-blue"
                    style={{ width: '100%', padding: '10px 16px', fontSize: 12.5, marginBottom: 14 }}
                  >
                    <i className="fas fa-book-open" />
                    <span>อ่านกฎและกติกาเกมฉบับเต็ม</span>
                  </button>

                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    color: '#fff', fontSize: 12, fontWeight: 700,
                  }}>
                    <i className="fas fa-spinner fa-spin" style={{ color: '#ff5252' }} />
                    กำลังรอแอดมินเริ่มเกม...
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── PLAYER VIEW: IN-GAME HUD (CREWMATE / IMPOSTOR / DODO) ── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {!isAdminView && gameDoc.status === 'playing' && me && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Ghost Mode Notice */}
            {!isAlive && (
              <div className="au-card" style={{
                background: 'rgba(69, 90, 100, 0.25)',
                border: '2px solid #546e7a',
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <AmongUsVisor isAlive={false} size={36} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#eceff1' }}>สถานะ: วิญญาณ (GHOST)</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                    คุณถูกกำจัดแล้ว แต่ยังสามารถทำภารกิจส่วนตัวให้ครบเพื่อช่วยฝ่ายคนดีชนะได้
                  </div>
                </div>
              </div>
            )}

            {/* Player In-Game HUD: Game Time & Identity Card */}
            <div className="au-card" style={{
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              background: 'linear-gradient(135deg, #101726 0%, #151d2e 100%)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AmongUsVisor
                  role={myRole || 'crewmate'}
                  color={me?.color || '#0288d1'}
                  isAlive={isAlive}
                  size={42}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{me.name}</span>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: isAlive ? 'rgba(76, 175, 80, 0.15)' : 'rgba(158, 158, 158, 0.15)',
                      border: `1px solid ${isAlive ? '#4caf50' : '#757575'}`,
                      color: isAlive ? '#81c784' : '#bdbdbd',
                      fontSize: 10,
                      fontWeight: 800,
                    }}>
                      {isAlive ? 'ALIVE' : 'GHOST'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                    ลูกเรือ Special Event · {me?.color ? `สี ${me.color.toUpperCase()}` : ''}
                  </div>
                </div>
              </div>

              {/* Game Clock Display */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', fontWeight: 800, letterSpacing: '0.06em' }}>
                  TIME REMAINING
                </div>
                <div style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: currentTimeSec <= 120 ? '#ff1744' : '#ff5252',
                  fontFamily: 'monospace',
                  letterSpacing: '0.04em',
                  lineHeight: 1.1,
                  marginTop: 2,
                  textShadow: '0 0 12px rgba(255, 82, 82, 0.5)',
                }}>
                  {fmtTime(currentTimeSec)}
                </div>
              </div>
            </div>

            {/* Peace Period Alert Banner (if Kill Cooldown is Active) */}
            {killCooldownSec > 0 && isAlive && (
              <div style={{
                background: 'rgba(255, 152, 0, 0.15)',
                border: '2px solid #ff9800',
                borderRadius: 14,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 4px 16px rgba(255, 152, 0, 0.25)',
              }}>
                <i className="fas fa-shield-alt" style={{ color: '#ffb74d', fontSize: 16 }} />
                <div style={{ flex: 1, fontSize: 11.5, color: '#ffe082', lineHeight: 1.4 }}>
                  <strong>ช่วงเวลาห้ามฆ่า (Peace Period):</strong> เหลืออีก <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 13, color: '#fff' }}>{killCooldownSec}</span> วินาที — ห้ามทุกคนกระทำการกำจัดหรือสั่งยิง
                </div>
              </div>
            )}

            {/* Emergency Meeting Cooldown Alert Banner */}
            {emergencyCooldownSec > 0 && isAlive && (
              <div style={{
                background: 'rgba(239, 83, 80, 0.15)',
                border: '2px solid #ef5350',
                borderRadius: 14,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 4px 16px rgba(239, 83, 80, 0.25)',
              }}>
                <i className="fas fa-bullhorn" style={{ color: '#ff7961', fontSize: 16 }} />
                <div style={{ flex: 1, fontSize: 11.5, color: '#ffcdd2', lineHeight: 1.4 }}>
                  <strong>ห้าม EMERGENCY MEETING:</strong> คูลดาวน์เหลืออีก <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 13, color: '#fff' }}>{emergencyCooldownSec}</span> วินาที — ห้ามกดปุ่มเรียกประชุมฉุกเฉิน
                </div>
              </div>
            )}

            {/* ─── SECRET ROLE CARD: HOLD TO REVEAL ─── */}
            {(revealedRole || holdRevealed) ? (
              <div
                className="au-card"
                style={{
                  padding: 16,
                  background: myRole === 'impostor'
                    ? 'linear-gradient(135deg, #2b0b11 0%, #17090c 100%)'
                    : (myRole === 'sheriff'
                        ? 'linear-gradient(135deg, #2e240a 0%, #191407 100%)'
                        : (myRole === 'dodo'
                            ? 'linear-gradient(135deg, #250b2e 0%, #140719 100%)'
                            : 'linear-gradient(135deg, #091c2b 0%, #06111a 100%)')),
                  border: `2.5px solid ${myRole === 'impostor' ? '#ff5252' : (myRole === 'sheriff' ? '#fbc02d' : (myRole === 'dodo' ? '#ab47bc' : '#29b6f6'))}`,
                  boxShadow: `0 6px 0 #0a0e17, 0 8px 24px ${myRole === 'impostor' ? 'rgba(255,82,82,0.3)' : (myRole === 'sheriff' ? 'rgba(251,192,45,0.3)' : (myRole === 'dodo' ? 'rgba(171,71,188,0.3)' : 'rgba(41,182,246,0.3)'))}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AmongUsVisor
                      role={myRole || 'crewmate'}
                      isAlive={isAlive}
                      size={34}
                      color={me?.color || null}
                    />
                    <div>
                      <div style={{
                        fontSize: 15,
                        fontWeight: 900,
                        color: myRole === 'impostor' ? '#ff5252' : (myRole === 'sheriff' ? '#ffd54f' : (myRole === 'dodo' ? '#ce93d8' : '#80d8ff')),
                        letterSpacing: '0.04em',
                      }}>
                        {myRole === 'impostor' ? 'ฝ่ายคนร้าย (IMPOSTOR)' : (myRole === 'sheriff' ? 'นายอำเภอ (SHERIFF)' : (myRole === 'dodo' ? 'ฝ่ายโดโด้ (DODO BIRD)' : 'ฝ่ายคนดี (CREWMATE)'))}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                        {myRole === 'impostor'
                          ? 'เป้าหมาย: กำจัดลูกเรือให้หมด หรือก่อวินาศกรรมให้หมดเวลา'
                          : (myRole === 'sheriff'
                              ? 'เป้าหมาย: สืบหาและยิงคนร้าย (มี 1 นัด หากยิงคนดีจะตายคู่)'
                              : (myRole === 'dodo'
                                  ? 'เป้าหมาย: จงทำตัวให้น่าสงสัย เพื่อให้ทุกคนโหวตขับไล่คุณในที่ประชุม'
                                  : 'เป้าหมาย: ซ่อมแซมยาน ทำภารกิจส่วนตัว 3 อย่างให้เสร็จสมบูรณ์'))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setRevealedRole(false)
                      setHoldRevealed(false)
                    }}
                    className="au-btn au-btn-dark"
                    style={{ padding: '6px 10px', fontSize: 11, flexShrink: 0 }}
                    title="แตะเพื่อซ่อนบทบาททันที"
                  >
                    <i className="fas fa-eye-slash" />
                    <span>ซ่อน</span>
                  </button>
                </div>

                {/* Impostor Teammate Roster */}
                {myRole === 'impostor' && (
                  <div style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    background: 'rgba(0,0,0,0.45)',
                    borderRadius: 12,
                    border: '1.5px solid rgba(255,82,82,0.3)',
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 900, color: '#ff8a80', marginBottom: 6, letterSpacing: '0.06em' }}>
                      <i className="fas fa-users" style={{ marginRight: 5 }} />
                      ทีมคนร้ายของคุณ (IMPOSTORS TEAM):
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
                      {Object.values(gameDoc.players || {})
                        .filter(p => p.role === 'impostor')
                        .map(imp => (
                          <div
                            key={imp.uid}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 11.5,
                              color: '#fff',
                              background: 'rgba(255,255,255,0.05)',
                              padding: '5px 8px',
                              borderRadius: 8,
                            }}
                          >
                            <AmongUsVisor color={imp.color || '#c62828'} size={18} isAlive={imp.isAlive} />
                            <span style={{ fontWeight: imp.uid === myUid ? 900 : 600 }}>
                              {imp.name} {imp.uid === myUid ? '(คุณ)' : ''}
                            </span>
                          </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10.5, color: '#ffccbc', fontWeight: 700 }}>
                      <i className="fas fa-radiation" style={{ marginRight: 5 }} />
                      วิธีใช้สกิล: แตะที่แถบ TOTAL TASKS COMPLETED ด้านบนเพื่อเปิดเมนูก่อวินาศกรรม (Sabotage)
                    </div>
                  </div>
                )}

                {/* Sheriff Ammo Status */}
                {myRole === 'sheriff' && (
                  <div style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    background: 'rgba(255,193,7,0.12)',
                    borderRadius: 12,
                    border: '1.5px solid rgba(255,193,7,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#ffe082', fontWeight: 800 }}>
                      <i className="fas fa-crosshairs" style={{ color: '#ffd54f' }} />
                      <span>สถานะกระสุน:</span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: (me?.sheriffShots !== undefined ? me.sheriffShots : 1) > 0 ? '#fbc02d' : 'rgba(255,255,255,0.1)',
                        color: (me?.sheriffShots !== undefined ? me.sheriffShots : 1) > 0 ? '#111' : '#aaa',
                        fontWeight: 900,
                        fontSize: 11,
                      }}>
                        {(me?.sheriffShots !== undefined ? me.sheriffShots : 1) > 0 ? '1 นัด พร้อมยิง' : 'ใช้สิทธิ์แล้ว'}
                      </span>
                    </div>
                    <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
                      แตะที่แถบ TOTAL TASKS COMPLETED ด้านบนเพื่อสั่งยิง
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div
                onPointerDown={() => setHoldRevealed(true)}
                onPointerUp={() => setHoldRevealed(false)}
                onPointerCancel={() => setHoldRevealed(false)}
                onPointerLeave={() => setHoldRevealed(false)}
                onTouchStart={() => setHoldRevealed(true)}
                onTouchEnd={() => setHoldRevealed(false)}
                onClick={handleToggleRevealRole}
                className="au-role-hidden"
                style={{
                  background: 'linear-gradient(135deg, #101726 0%, #172033 100%)',
                  border: '2.5px dashed #384d6b',
                  borderRadius: 16,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  boxShadow: '0 6px 0 #0a0e17, 0 8px 18px rgba(0,0,0,0.5)',
                  transition: 'all 0.15s ease',
                }}
                title="แตะค้างไว้เพื่อดูบทบาท (ปล่อยมือเพื่อซ่อนทันที)"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: '#090e17',
                    border: '2px solid #28374d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#80d8ff',
                    fontSize: 20,
                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6)',
                  }}>
                    <i className="fas fa-fingerprint" style={{ animation: 'scanPulse 1.8s infinite ease-in-out' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.04em' }}>
                      ความลับบทบาท (SECRET ROLE)
                    </div>
                    <div style={{ fontSize: 11, color: '#80d8ff', marginTop: 2, fontWeight: 700 }}>
                      แตะค้างเพื่อสแกนดูบทบาท (HOLD TO REVEAL)
                    </div>
                  </div>
                </div>
                <div style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: 'rgba(128, 216, 255, 0.12)',
                  border: '1.5px solid rgba(128, 216, 255, 0.3)',
                  color: '#80d8ff',
                  fontSize: 11,
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}>
                  <i className="fas fa-hand-pointer" />
                  <span>แตะค้าง</span>
                </div>
              </div>
            )}

            {/* ─── ACTION HUB (PROMINENT CENTER STAGE) ─── */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              margin: '2px 0',
            }}>
              {isAlive && (
                <div>
                  {/* Giant 3D Beveled Red REPORT Button (100% Equal UI for all roles) */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedReportVictim(null)
                      setShowReportModal(true)
                    }}
                    className="au-btn au-btn-red"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 12,
                    }}
                    title="รายงานการพบศพ (Report Dead Body)"
                  >
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.4)',
                    }}>
                      <i className="fas fa-bullhorn" />
                    </div>
                    <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '0.04em' }}>REPORT ศพ</div>
                      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>แจ้งพบลูกเรือเสียชีวิต</div>
                    </div>
                  </button>
                </div>
              )}

              {/* Self-Report Eliminated Button */}
              {isAlive && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (killCooldownSec > 0) {
                        showToast(`อยู่ในช่วงเวลาห้ามฆ่า (เหลืออีก ${killCooldownSec} วินาที) ยังไม่มีใครสามารถฆ่าได้`, 'error')
                        return
                      }
                      setShowSelfDeathConfirm(true)
                    }}
                    className="au-btn au-btn-dark"
                    style={{
                      padding: '8px 16px',
                      fontSize: 11,
                      color: '#b0bec5',
                      borderRadius: 12,
                    }}
                    title="แจ้งว่าคุณถูกกำจัดในชีวิตจริงแล้ว (ไม่มีแจ้งเตือนคนอื่น รู้พร้อมกันตอนประชุม)"
                  >
                    <i className="fas fa-skull" style={{ color: '#ef5350' }} />
                    <span>ฉันถูกกำจัดแล้ว (Self-Report Death)</span>
                  </button>
                </div>
              )}
            </div>

            {/* My Personal Tasks List (Skeld Terminal Style) */}
            <div className="au-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 13.5, fontWeight: 900, color: '#ffd54f', letterSpacing: '0.06em' }}>
                  <i className="fas fa-clipboard-list" style={{ marginRight: 6 }} />
                  ภารกิจส่วนตัว (YOUR TASKS)
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 800 }}>
                  3 ภารกิจ
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
                แตะที่หัวข้อภารกิจเมื่อทำเสร็จ เพื่อแสดง QR Code ให้แอดมินสแกนยืนยัน
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(me.tasks || []).map((t, idx) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (!t.verified) setActiveTaskModal(t)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 14,
                      background: t.verified ? 'rgba(46, 125, 50, 0.15)' : '#0d131d',
                      border: `2px solid ${t.verified ? '#2e7d32' : '#1f2c42'}`,
                      color: '#fff', textAlign: 'left', cursor: t.verified ? 'default' : 'pointer',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: t.verified ? '#2e7d32' : '#1e293b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 13, fontWeight: 900,
                      border: '1.5px solid rgba(255,255,255,0.15)',
                    }}>
                      {t.verified ? <i className="fas fa-check" /> : `${idx + 1}`}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 6,
                          background: 'rgba(251, 192, 45, 0.15)',
                          border: '1px solid rgba(251, 192, 45, 0.3)',
                          color: '#fbc02d', fontSize: 10.5, fontWeight: 900,
                        }}>
                          <i className="fas fa-map-marker-alt" style={{ fontSize: 9 }} />
                          ชั้น {t.floor || 1} · {t.room || 'โซนหน้า'}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 13.5, fontWeight: 800,
                        textDecoration: t.verified ? 'line-through' : 'none',
                        color: t.verified ? '#81c784' : '#ffffff',
                      }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                        {t.desc}
                      </div>
                    </div>
                    <div>
                      {t.verified ? (
                        <span style={{ fontSize: 10.5, fontWeight: 900, color: '#81c784', background: 'rgba(46,125,50,0.2)', padding: '4px 8px', borderRadius: 8, border: '1px solid #2e7d32' }}>
                          <i className="fas fa-check" style={{ marginRight: 4 }} /> เสร็จแล้ว
                        </span>
                      ) : (
                        <span className="au-btn au-btn-yellow" style={{ fontSize: 10.5, padding: '5px 10px' }}>
                          แสดง QR
                        </span>
                      )}
                    </div>
                  </button>
                ))}

                {(me.tasks || []).length === 0 && (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    ยังไม่มีภารกิจ รอแอดมินแจกภารกิจ
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── MEETING FULL-SCREEN OVERLAY (THE SKELD TABLET) ──────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {/* Floating Meeting Pill for Admin when Minimized */}
        {adminMeetingMinimized && hasAdminPerm && (gameDoc.status === 'meeting_called' ||
          gameDoc.status === 'meeting_discussion' ||
          gameDoc.status === 'meeting_voting' ||
          gameDoc.status === 'meeting_result') && (
          <div style={{
            position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, background: '#121722', border: '2px solid #ef5350',
            borderRadius: 30, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 6px 24px rgba(0,0,0,0.85)',
            animation: 'auEmergencyPulse 1.8s infinite',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 12, fontWeight: 800 }}>
              <i className="fas fa-bullhorn" style={{ color: '#ef5350' }} />
              <span>การประชุมกำลังดำเนินอยู่ ({fmtTime(meetingTimeSec)})</span>
            </div>
            <button
              type="button"
              onClick={() => setAdminMeetingMinimized(false)}
              className="au-btn au-btn-yellow"
              style={{ padding: '4px 12px', fontSize: 11, borderRadius: 20 }}
            >
              <i className="fas fa-expand-alt" style={{ marginRight: 4 }} />
              กลับเข้าห้องประชุม
            </button>
          </div>
        )}

        {(gameDoc.status === 'meeting_called' ||
          gameDoc.status === 'meeting_discussion' ||
          gameDoc.status === 'meeting_voting' ||
          gameDoc.status === 'meeting_result') && !adminMeetingMinimized && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(4, 7, 15, 0.98)',
            backgroundImage: `
              radial-gradient(1.5px 1.5px at 30px 40px, #ffffff, rgba(0,0,0,0)),
              radial-gradient(1px 1px at 80px 100px, #80d8ff, rgba(0,0,0,0)),
              radial-gradient(2px 2px at 150px 70px, #ffe082, rgba(0,0,0,0)),
              radial-gradient(1.5px 1.5px at 240px 180px, #ffffff, rgba(0,0,0,0))
            `,
            backgroundRepeat: 'repeat',
            backgroundSize: '350px 350px',
            backdropFilter: 'blur(16px)',
            display: 'flex', flexDirection: 'column',
            padding: '16px 12px', overflowY: 'auto',
          }}>
            {/* Admin Minimize Button */}
            {hasAdminPerm && (
              <button
                type="button"
                onClick={() => setAdminMeetingMinimized(true)}
                className="au-btn au-btn-dark"
                style={{
                  position: 'fixed',
                  top: 14,
                  right: 14,
                  padding: '7px 12px',
                  fontSize: 11.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  zIndex: 130,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
                }}
                title="ย่อหน้าต่างประชุมเพื่อกลับไปดูแดชบอร์ดหลักของแอดมิน"
              >
                <i className="fas fa-compress-alt" />
                <span>ย่อหน้าต่าง / แดชบอร์ดแอดมิน</span>
              </button>
            )}

            <div style={{ maxWidth: 560, width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>

              {/* Meeting Phase 1: Siren Alarm / Called */}
              {gameDoc.status === 'meeting_called' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px 0' }}>
                  <div style={{
                    width: 100, height: 100, borderRadius: '50%',
                    background: 'radial-gradient(circle at 40% 30%, #ff5252 0%, #c62828 60%, #7a0813 100%)',
                    border: '4px solid #fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 42, marginBottom: 20,
                    animation: 'auEmergencyPulse 1.5s infinite ease-in-out',
                    boxShadow: '0 0 35px rgba(229, 57, 53, 0.9)',
                  }}>
                    <i className={`fas fa-${gameDoc.meeting?.type === 'body_report' ? 'skull' : 'bullhorn'}`} />
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#ff5252', letterSpacing: '0.08em', textShadow: '0 0 15px rgba(255, 82, 82, 0.6)' }}>
                    {gameDoc.meeting?.type === 'body_report' ? 'DEAD BODY REPORTED!' : 'EMERGENCY MEETING'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AmongUsVisor size={34} color={gameDoc.meeting?.calledBy?.color} isAlive={true} />
                      <span style={{ fontSize: 15, color: '#fff', fontWeight: 800 }}>
                        {gameDoc.meeting?.calledBy?.name}
                      </span>
                    </div>
                    {gameDoc.meeting?.type === 'body_report' && gameDoc.meeting?.reportedVictim ? (
                      <>
                        <span style={{ fontSize: 13, color: '#ff8a80', fontWeight: 700 }}>รายงานพบศพ</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AmongUsVisor size={34} color={gameDoc.meeting?.reportedVictim?.color} isAlive={false} />
                          <span style={{ fontSize: 15, color: '#eceff1', fontWeight: 800 }}>
                            {gameDoc.meeting?.reportedVictim?.name}
                          </span>
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 14, color: '#ffd54f', fontWeight: 700 }}>กดเรียกประชุมฉุกเฉิน!</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 10, maxWidth: 360 }}>
                    เวลาเกมหลักหยุดเดินชั่วคราว ให้ลูกเรือทุกคนมารวมตัวกันที่ห้องประชุม
                  </div>

                  {hasAdminPerm ? (
                    <button
                      type="button"
                      onClick={startDiscussionPhase}
                      className="au-btn au-btn-red"
                      style={{ marginTop: 32, padding: '14px 32px', fontSize: 15 }}
                    >
                      เริ่มจับเวลาประชุม (3 นาที)
                    </button>
                  ) : (
                    <div style={{ marginTop: 32, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                      <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />
                      รอแอดมินเริ่มการประชุม...
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={stopMeetingBuzzer}
                    className="au-btn au-btn-dark"
                    style={{ marginTop: 14, padding: '7px 16px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    title="ปิดเสียงไซเรนบนเครื่องนี้"
                  >
                    <i className="fas fa-volume-mute" />
                    <span>ปิดเสียงไซเรน</span>
                  </button>
                </div>
              )}

              {/* Meeting Phase 2 & 3: Discussion & Skeld Voting Table */}
              {(gameDoc.status === 'meeting_discussion' || gameDoc.status === 'meeting_voting') && (
                <div className="au-card" style={{ padding: 18, border: '3.5px solid #28374d', borderRadius: 22 }}>
                  {/* Tablet Header & 3-Phase Informative Banner */}
                  <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '0.08em', color: '#fff', marginBottom: 8 }}>
                      WHO IS AN IMPOSTOR?
                    </div>

                    {/* 3-Phase Meeting Flow Indicator */}
                    {(() => {
                      const isVoting = gameDoc.status === 'meeting_voting' || meetingTimeSec <= 60
                      const isReporterBriefing = !isVoting && meetingTimeSec > 180
                      const reporterName = gameDoc.meeting?.calledBy?.name || 'ผู้แจ้ง'
                      const isReportType = gameDoc.meeting?.type === 'body_report'

                      if (isReporterBriefing) {
                        return (
                          <div style={{
                            background: 'rgba(239, 83, 80, 0.2)',
                            border: '2px solid #ef5350',
                            borderRadius: 14,
                            padding: '10px 14px',
                            marginBottom: 10,
                            boxShadow: '0 4px 16px rgba(239, 83, 80, 0.25)',
                            animation: 'auEmergencyPulse 1.8s infinite',
                          }}>
                            <div style={{ fontSize: 13, fontWeight: 900, color: '#ffcdd2', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <i className="fas fa-microphone" style={{ color: '#ff5252' }} />
                              <span>ช่วง 30 วินาทีแรก: ให้เฉพาะผู้แจ้งพูดเท่านั้น!</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: '#fff', marginTop: 3, fontWeight: 700 }}>
                              {isReportType ? `ผู้พบศพ (${reporterName})` : `ผู้เรียกประชุม (${reporterName})`} กำลังอธิบายเหตุการณ์ — ห้ามผู้อื่นขัดจังหวะ
                            </div>
                            <div style={{ fontSize: 10.5, color: '#ffab91', marginTop: 3 }}>
                              เหลือเวลาชี้แจงเดี่ยวอีก: <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 12.5, color: '#fff' }}>{meetingTimeSec - 180}</span>s
                            </div>
                          </div>
                        )
                      }

                      if (!isVoting) {
                        return (
                          <div style={{
                            background: 'rgba(251, 192, 45, 0.15)',
                            border: '2px solid #fbc02d',
                            borderRadius: 14,
                            padding: '10px 14px',
                            marginBottom: 10,
                          }}>
                            <div style={{ fontSize: 13, fontWeight: 900, color: '#ffe082', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <i className="fas fa-comments" style={{ color: '#fbc02d' }} />
                              <span>ช่วงพูดคุยสอบสวนและอภิปรายทั่วไป (2 นาที)</span>
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                              ทุกคนพูดคุย ซักถาม และแลกเปลี่ยนข้อมูลได้อิสระ (ยังไม่เปิดโหวต)
                            </div>
                            <div style={{ fontSize: 10.5, color: '#ffe082', marginTop: 2 }}>
                              เหลือเวลาคุยอีก: <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 12, color: '#fff' }}>{meetingTimeSec - 60}</span>s ก่อนเริ่มโหวต
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div style={{
                          background: 'rgba(229, 57, 53, 0.2)',
                          border: '2px solid #ff5252',
                          borderRadius: 14,
                          padding: '10px 14px',
                          marginBottom: 10,
                          animation: 'auEmergencyPulse 1.5s infinite',
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: '#ff5252', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <i className="fas fa-vote-yea" />
                            <span>ช่วงลงคะแนนโหวต (1 นาทีสุดท้าย)</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                            กดเลือกผู้เล่นที่ต้องการโหวตออก หรือกด SKIP VOTE เพื่อข้าม
                          </div>
                        </div>
                      )
                    })()}

                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      เวลาประชุมที่เหลือ
                    </div>
                    <div style={{
                      fontSize: 34, fontWeight: 900, color: '#ff5252',
                      fontFamily: 'monospace', letterSpacing: '0.06em', marginTop: 2,
                      textShadow: '0 0 10px rgba(255, 82, 82, 0.5)',
                    }}>
                      {fmtTime(meetingTimeSec)}
                    </div>
                  </div>

                  {/* Fast forward voting trigger for admin */}
                  {hasAdminPerm && gameDoc.status === 'meeting_discussion' && (
                    <button
                      type="button"
                      onClick={openVotingPhaseNow}
                      className="au-btn au-btn-yellow"
                      style={{ width: '100%', padding: '10px', fontSize: 12, marginBottom: 14 }}
                    >
                      เปิดโหวตทันที (ข้ามเวลาคุย)
                    </button>
                  )}

                  {/* Skeld Voting Candidates Grid (Shows All Players with Dead Status) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 14 }}>
                    {allPlayersList.map(p => {
                      const isTargetDead = !p.isAlive
                      const hasMyVote = gameDoc.meeting?.votes?.[myUid] === p.uid
                      const hasVotedAnyone = !!gameDoc.meeting?.votes?.[p.uid]
                      const isSelected = selectedVoteTarget === p.uid

                      return (
                        <div
                          key={p.uid}
                          onClick={() => {
                            if (!isTargetDead && gameDoc.status === 'meeting_voting' && isAlive && !gameDoc.meeting?.votes?.[myUid]) {
                              setSelectedVoteTarget(isSelected ? null : p.uid)
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 12px', borderRadius: 12,
                            background: isTargetDead
                              ? 'rgba(20, 20, 20, 0.45)'
                              : (hasMyVote ? 'rgba(229, 57, 53, 0.25)' : (isSelected ? '#1c283c' : '#0d131d')),
                            border: isTargetDead
                              ? '1.5px dashed rgba(255, 82, 82, 0.35)'
                              : `2.5px solid ${hasMyVote ? '#ff5252' : (isSelected ? '#0288d1' : '#1f2c42')}`,
                            color: '#fff',
                            opacity: isTargetDead ? 0.55 : 1,
                            cursor: (!isTargetDead && gameDoc.status === 'meeting_voting' && isAlive && !gameDoc.meeting?.votes?.[myUid]) ? 'pointer' : 'default',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <AmongUsVisor role={p.role} isAlive={p.isAlive} size={34} color={p.color || null} />
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <div style={{ fontSize: 13.5, fontWeight: 800, color: isTargetDead ? 'rgba(255,255,255,0.6)' : '#fff' }}>
                                {p.name} {p.uid === myUid && <span style={{ fontSize: 10.5, color: '#80d8ff' }}>(คุณ)</span>}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {/* Admin In-Meeting Alive/Dead Toggle */}
                            {hasAdminPerm && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  const newAlive = !p.isAlive
                                  const updates = {
                                    [`players.${p.uid}.isAlive`]: newAlive,
                                  }
                                  // If marking player dead during voting, remove their vote if they already voted
                                  if (!newAlive && gameDoc.meeting?.votes?.[p.uid]) {
                                    updates[`meeting.votes.${p.uid}`] = deleteField()
                                  }
                                  try {
                                    await updateDoc(doc(db, 'all_of_us_games', 'active_game'), updates)
                                    showToast(`ปรับสถานะ ${p.name} เป็น ${newAlive ? 'ยังมีชีวิต' : 'เสียชีวิตแล้ว'}`)
                                  } catch (err) {
                                    showToast('ปรับสถานะล้มเหลว: ' + err.message, 'error')
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  fontSize: 10,
                                  fontWeight: 800,
                                  background: p.isAlive ? 'rgba(239, 83, 80, 0.2)' : 'rgba(76, 175, 80, 0.25)',
                                  color: p.isAlive ? '#ff8a80' : '#81c784',
                                  border: `1px solid ${p.isAlive ? '#ef5350' : '#66bb6a'}`,
                                  cursor: 'pointer',
                                }}
                                title={p.isAlive ? 'คลิกเพื่อเปลี่ยนเป็นสถานะ: ตาย' : 'คลิกเพื่อเปลี่ยนเป็นสถานะ: ชุบชีวิต'}
                              >
                                {p.isAlive ? 'ระบุว่าตาย' : 'ชุบชีวิต'}
                              </button>
                            )}

                            {/* DEAD Badge if player was eliminated */}
                            {isTargetDead && (
                              <span style={{
                                fontSize: 9.5, fontWeight: 900, color: '#fff',
                                background: '#c62828', padding: '2px 6px', borderRadius: 4,
                                letterSpacing: '0.04em',
                              }}>
                                DEAD
                              </span>
                            )}

                            {/* Ghost Spectator Mode: Dead players can see who voted for this target */}
                            {!isAlive && (
                              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                                {Object.entries(gameDoc.meeting?.votes || {})
                                  .filter(([voterUid, target]) => target === p.uid)
                                  .map(([voterUid]) => {
                                    const voter = gameDoc.players?.[voterUid]
                                    return voter ? (
                                      <AmongUsVisor key={voterUid} color={voter.color || '#fff'} size={18} isAlive={true} />
                                    ) : null
                                  })}
                              </div>
                            )}

                            {/* Red VOTED stamp if this player has cast their vote (hides target from alive players) */}
                            {!isTargetDead && hasVotedAnyone && (
                              <span style={{
                                fontSize: 9, fontWeight: 900, color: '#fff',
                                background: '#c51111', padding: '2px 5px', borderRadius: 4,
                                border: '1px solid #ff5252', letterSpacing: '0.04em',
                              }}>
                                VOTED
                              </span>
                            )}

                            {/* Vote Confirmation Checkmark Button (Only for living players) */}
                            {!isTargetDead && isSelected && gameDoc.status === 'meeting_voting' && isAlive && !gameDoc.meeting?.votes?.[myUid] && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  castVote(p.uid)
                                  setSelectedVoteTarget(null)
                                }}
                                className="au-btn au-btn-green"
                                style={{ width: 32, height: 32, borderRadius: 8, padding: 0 }}
                                title="ยืนยันโหวตคนนี้"
                              >
                                <i className="fas fa-check" />
                              </button>
                            )}

                            {/* Checkmark if current player voted for this target */}
                            {hasMyVote && <i className="fas fa-check-circle" style={{ color: '#ff5252', fontSize: 16 }} />}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Skip Vote Button Card */}
                  <div style={{ marginBottom: 14 }}>
                    {gameDoc.status === 'meeting_voting' && isAlive && (
                      <button
                        type="button"
                        onClick={() => castVote('skip')}
                        disabled={!!gameDoc.meeting?.votes?.[myUid]}
                        className="au-btn au-btn-dark"
                        style={{
                          width: '100%', padding: '12px 14px',
                          border: `2.5px solid ${gameDoc.meeting?.votes?.[myUid] === 'skip' ? '#9e9e9e' : '#1f2c42'}`,
                          background: gameDoc.meeting?.votes?.[myUid] === 'skip' ? 'rgba(158,158,158,0.25)' : '#0d131d',
                          fontSize: 13,
                        }}
                      >
                        <i className="fas fa-forward" style={{ marginRight: 8 }} />
                        SKIP VOTE (งดออกเสียง)
                      </button>
                    )}

                    {/* Ghost Spectator Mode: Dead players see who skipped */}
                    {!isAlive && (
                      <div style={{
                        marginTop: 6,
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 10,
                        border: '1px dashed rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>ผู้เล่นที่เลือก SKIP:</span>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {Object.entries(gameDoc.meeting?.votes || {})
                            .filter(([voterUid, target]) => target === 'skip')
                            .map(([voterUid]) => {
                              const voter = gameDoc.players?.[voterUid]
                              return voter ? (
                                <AmongUsVisor key={voterUid} color={voter.color || '#9e9e9e'} size={18} isAlive={true} />
                              ) : null
                            })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Admin Force Conclude Votes Button */}
                  {hasAdminPerm && (
                    <button
                      type="button"
                      onClick={concludeVoting}
                      className="au-btn au-btn-red"
                      style={{ width: '100%', padding: '12px', fontSize: 13 }}
                    >
                      สรุปผลโหวตทันที
                    </button>
                  )}
                </div>
              )}

              {/* Meeting Phase 4: Outer Space Ejection Reveal Screen */}
              {gameDoc.status === 'meeting_result' && (() => {
                const res = gameDoc.meeting?.result || {}
                const victim = res?.eliminatedUid ? gameDoc.players?.[res.eliminatedUid] : null
                const remainingImpostorsCount = Object.values(gameDoc.players || {}).filter(p => p.role === 'impostor' && p.isAlive).length
                const wasImpostor = res?.eliminatedRole === 'impostor'

                return (
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                    padding: '24px 0', minHeight: 360,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Floating Ejected Crewmate Sprite tumbling through space */}
                    <div style={{
                      width: 70, height: 70,
                      marginBottom: 24,
                      animation: 'auEjectSpin 4.5s linear infinite',
                    }}>
                      <AmongUsVisor
                        role={res?.eliminatedRole || 'crewmate'}
                        isAlive={true}
                        size={60}
                        color={victim?.color || (res?.eliminatedUid ? gameDoc.players?.[res.eliminatedUid]?.color : null) || null}
                      />
                    </div>

                    {/* Classic Reveal Text Banner */}
                    {victim ? (
                      <div style={{ maxWidth: 420, padding: '0 16px' }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.04em', lineHeight: 1.3, marginBottom: 6 }}>
                          {res?.eliminatedRole === 'dodo'
                            ? `${victim.name} was The Dodo!`
                            : wasImpostor
                            ? `${victim.name} was An Impostor.`
                            : `${victim.name} was not An Impostor.`}
                        </div>
                        {res?.eliminatedRole === 'dodo' ? (
                          <div style={{ fontSize: 16, fontWeight: 900, color: '#ce93d8', marginBottom: 12 }}>
                            ฝ่ายโดโด้ชนะเกมทันที!
                          </div>
                        ) : (
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#80d8ff', marginBottom: 12 }}>
                            {remainingImpostorsCount} Impostor{remainingImpostorsCount === 1 ? '' : 's'} remain{remainingImpostorsCount === 1 ? 's' : ''}.
                          </div>
                        )}
                        <div style={{ fontSize: 14, color: res?.eliminatedRole === 'dodo' ? '#ce93d8' : wasImpostor ? '#ff5252' : '#a5d6a7', fontWeight: 800 }}>
                          {res?.outcomeText}
                        </div>
                      </div>
                    ) : (
                      <div style={{ maxWidth: 420, padding: '0 16px' }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.04em', marginBottom: 8 }}>
                          No one was ejected. ({res?.isTie ? 'Tie' : 'Skipped'})
                        </div>
                        <div style={{ fontSize: 14.5, color: '#ffd54f', fontWeight: 800 }}>
                          {res?.outcomeText || 'ไม่มีใครถูกขับออกจากยาน'}
                        </div>
                      </div>
                    )}

                    {/* Anonymous Vote Tally Result Box (shows count per target, conceals voter identities) */}
                    {res?.voteCounts && Object.keys(res.voteCounts).length > 0 && (
                      <div style={{
                        marginTop: 20,
                        background: 'rgba(13, 19, 29, 0.85)',
                        borderRadius: 14,
                        padding: '12px 16px',
                        border: '1.5px solid rgba(255,255,255,0.12)',
                        maxWidth: 380,
                        width: '100%',
                        textAlign: 'left',
                      }}>
                        <div style={{ fontSize: 11.5, fontWeight: 900, color: 'rgba(255,255,255,0.7)', marginBottom: 8, letterSpacing: '0.04em' }}>
                          <i className="fas fa-poll" style={{ marginRight: 6, color: '#ffd54f' }} />
                          สรุปผลคะแนนโหวต (ANONYMOUS TALLY)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {Object.entries(res.voteCounts).map(([targetUid, count]) => {
                            const p = targetUid === 'skip' ? null : gameDoc.players?.[targetUid]
                            return (
                              <div key={targetUid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {p ? (
                                    <>
                                      <AmongUsVisor color={p.color || '#78909c'} size={24} isAlive={true} />
                                      <span style={{ fontWeight: 700 }}>{p.name}</span>
                                    </>
                                  ) : (
                                    <>
                                      <i className="fas fa-forward" style={{ color: '#9e9e9e', fontSize: 13 }} />
                                      <span style={{ fontWeight: 700, color: '#9e9e9e' }}>SKIP VOTE</span>
                                    </>
                                  )}
                                </div>
                                <span style={{ fontWeight: 900, color: '#ff5252', background: 'rgba(255,82,82,0.18)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,82,82,0.3)', fontSize: 11.5 }}>
                                  {count} เสียง
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {hasAdminPerm && (
                      <button
                        type="button"
                        onClick={handleResumeGame}
                        className="au-btn au-btn-green"
                        style={{ marginTop: 32, padding: '14px 32px', fontSize: 14 }}
                      >
                        <i className="fas fa-play" style={{ marginRight: 8 }} />
                        เล่นเกมต่อ (เวลาเดินต่อ)
                      </button>
                    )}
                  </div>
                )
              })()}

            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── GAME OVER / VICTORY SCREEN (AUTHENTIC AMONG US) ─────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {gameDoc.status === 'ended' && (() => {
          const isDodoWin = gameDoc.winner === 'dodo'
          const isCrewWin = gameDoc.winner === 'crewmate'
          const isImpWin = gameDoc.winner === 'impostor'

          const dodoPlayer = isDodoWin ? Object.values(gameDoc.players || {}).find(p => p.role === 'dodo') : null
          const themeColor = isDodoWin ? '#ab47bc' : (isCrewWin ? '#0288d1' : '#c51111')
          const themeTextColor = isDodoWin ? '#ce93d8' : (isCrewWin ? '#80d8ff' : '#ff5252')
          const titleText = isDodoWin ? 'VICTORY' : (isCrewWin ? 'VICTORY' : 'DEFEAT / VICTORY')
          const badgeText = isDodoWin
            ? 'ฝ่ายโดโด้ชนะเกมทันที! (DODO SOLO WIN)'
            : isCrewWin
            ? 'ฝ่ายคนดีเป็นผู้ชนะ! (CREWMATES WIN)'
            : 'ฝ่ายคนร้ายเป็นผู้ชนะ! (IMPOSTORS WIN)'

          return (
            <div style={{
              position: 'fixed',
              inset: 0,
              zIndex: 130,
              background: 'rgba(5, 8, 16, 0.98)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              overflowY: 'auto',
              padding: '36px 16px 80px',
              boxSizing: 'border-box',
            }}>
              <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
                {/* Giant Animated Visor */}
                <div style={{
                  margin: '0 auto 16px',
                  width: 90, height: 90,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: `drop-shadow(0 0 24px ${themeColor})`,
                }}>
                  <AmongUsVisor
                    role={gameDoc.winner || 'crewmate'}
                    size={84}
                    color={isDodoWin ? (dodoPlayer?.color || '#8e24aa') : null}
                    isAlive={true}
                  />
                </div>

                {/* Title */}
                <div style={{
                  fontSize: 34,
                  fontWeight: 900,
                  color: themeTextColor,
                  letterSpacing: '0.08em',
                  textShadow: `0 0 20px ${themeColor}, 0 0 40px ${themeColor}`,
                  lineHeight: 1.1,
                }}>
                  {titleText}
                </div>

                {/* Subtitle Badge */}
                <div style={{
                  display: 'inline-block',
                  background: `rgba(${isDodoWin ? '171, 71, 188' : isCrewWin ? '2, 136, 209' : '197, 17, 17'}, 0.22)`,
                  border: `1.5px solid ${themeColor}`,
                  borderRadius: 20,
                  padding: '6px 18px',
                  color: '#fff',
                  fontSize: 13.5,
                  fontWeight: 900,
                  marginTop: 10,
                  marginBottom: 16,
                  letterSpacing: '0.04em',
                }}>
                  {badgeText}
                </div>

                {/* Win Reason Box */}
                <div style={{
                  fontSize: 14,
                  color: '#fff',
                  lineHeight: 1.6,
                  fontWeight: 700,
                  marginBottom: 20,
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: `1.5px solid ${themeColor}`,
                  borderRadius: 14,
                  padding: '12px 16px',
                }}>
                  {gameDoc.winReason || (isDodoWin && dodoPlayer ? `${dodoPlayer.name} คือโดโด้! หลอกให้ที่ประชุมโหวตขับตนเองออกได้สำเร็จ ทำให้ฝ่ายโดโด้ชนะเกมทันที!` : 'จบเกม')}
                </div>

                {/* Vote Tally Box (if game ended via vote) */}
                {gameDoc.meeting?.result?.voteCounts && Object.keys(gameDoc.meeting.result.voteCounts).length > 0 && (
                  <div style={{
                    background: '#0d131d',
                    borderRadius: 14,
                    padding: '14px 16px',
                    border: '1.5px solid #1f2c42',
                    textAlign: 'left',
                    marginBottom: 20,
                  }}>
                    <div style={{ fontSize: 11.5, fontWeight: 900, color: '#ffd54f', marginBottom: 10, letterSpacing: '0.04em' }}>
                      <i className="fas fa-poll" style={{ marginRight: 6 }} />
                      สรุปผลคะแนนโหวตในที่ประชุม (VOTE TALLY)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(gameDoc.meeting.result.voteCounts).map(([targetUid, count]) => {
                        const p = targetUid === 'skip' ? null : gameDoc.players?.[targetUid]
                        const isTargetDodo = p?.role === 'dodo'
                        return (
                          <div key={targetUid} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            fontSize: 13, color: '#fff',
                            padding: '6px 10px', borderRadius: 8,
                            background: isTargetDodo ? 'rgba(171, 71, 188, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                            border: isTargetDodo ? '1px solid #ab47bc' : '1px solid rgba(255, 255, 255, 0.05)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {p ? (
                                <>
                                  <AmongUsVisor color={p.color || '#78909c'} size={24} isAlive={p.isAlive} />
                                  <span style={{ fontWeight: 800 }}>
                                    {p.name} {isTargetDodo && <span style={{ color: '#ce93d8', fontSize: 11.5 }}>(โดโด้)</span>}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-forward" style={{ color: '#9e9e9e', fontSize: 12 }} />
                                  <span style={{ fontWeight: 800, color: '#9e9e9e' }}>SKIP VOTE</span>
                                </>
                              )}
                            </div>
                            <span style={{
                              fontWeight: 900,
                              color: isTargetDodo ? '#ce93d8' : '#ff5252',
                              background: isTargetDodo ? 'rgba(171, 71, 188, 0.35)' : 'rgba(255, 82, 82, 0.18)',
                              padding: '2px 8px', borderRadius: 6,
                              border: `1px solid ${isTargetDodo ? '#ab47bc' : 'rgba(255, 82, 82, 0.3)'}`,
                              fontSize: 12,
                            }}>
                              {count} เสียง
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Reveal All Roles */}
                <div style={{
                  background: '#0d131d',
                  borderRadius: 16,
                  padding: 16,
                  border: '2px solid #1f2c42',
                  textAlign: 'left',
                  marginBottom: 20,
                }}>
                  <div style={{ fontSize: 11.5, fontWeight: 900, color: '#fbc02d', marginBottom: 12, letterSpacing: '0.06em' }}>
                    <i className="fas fa-id-card" style={{ marginRight: 6 }} />
                    เฉลยบทบาทผู้เล่นทุกคน ({allPlayersList.length} คน)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {allPlayersList.map(p => {
                      const roleColor = p.role === 'impostor' ? '#ff5252' : (p.role === 'dodo' ? '#ce93d8' : (p.role === 'sheriff' ? '#ffd54f' : '#80d8ff'))
                      const roleLabel = p.role === 'impostor' ? 'คนร้าย (Impostor)' : (p.role === 'dodo' ? 'โดโด้ (Dodo)' : (p.role === 'sheriff' ? 'นายอำเภอ (Sheriff)' : 'คนดี (Crewmate)'))
                      return (
                        <div key={p.uid} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', borderRadius: 10,
                          background: p.role === 'dodo' ? 'rgba(171, 71, 188, 0.18)' : 'rgba(255,255,255,0.03)',
                          border: p.role === 'dodo' ? '1px solid rgba(206, 147, 216, 0.4)' : '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <AmongUsVisor role={p.role} isAlive={p.isAlive} size={28} color={p.color || null} />
                            <div>
                              <div style={{ fontWeight: 800, color: '#fff', fontSize: 13.5 }}>{p.name}</div>
                              <div style={{ fontSize: 10.5, color: p.isAlive ? '#81c784' : '#e57373', fontWeight: 700 }}>
                                {p.isAlive ? 'รอดชีวิต' : 'ถูกกำจัด'}
                              </div>
                            </div>
                          </div>
                          <span style={{ fontWeight: 900, color: roleColor, fontSize: 12, letterSpacing: '0.02em' }}>
                            {roleLabel}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Action Buttons */}
                {hasAdminPerm ? (
                  <button
                    type="button"
                    onClick={handleResetGame}
                    className="au-btn au-btn-red"
                    style={{ width: '100%', padding: '14px', fontSize: 14.5, fontWeight: 900 }}
                  >
                    <i className="fas fa-redo-alt" style={{ marginRight: 8 }} />
                    เริ่มเกมรอบใหม่ (กลับสู่ล็อบบี้)
                  </button>
                ) : (
                  <div style={{
                    padding: '14px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}>
                    <i className="fas fa-spinner fa-spin" style={{ color: themeTextColor }} />
                    กำลังรอ Game Master เริ่มเกมรอบใหม่...
                  </div>
                )}
              </div>
            </div>
          )
        })()}

      </main>

      {/* ─── TASK VERIFICATION QR CODE MODAL (FOR PLAYERS) ─── */}
      {activeTaskModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 120,
          background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setActiveTaskModal(null)}>
          <div className="au-card" style={{
            padding: 24,
            maxWidth: 340, width: '100%', textAlign: 'center',
            border: '3px solid #0288d1',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#ffd54f', letterSpacing: '0.08em' }}>
              TASK VERIFICATION QR
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginTop: 4, marginBottom: 4 }}>
              {activeTaskModal.title}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 8,
              background: 'rgba(251, 192, 45, 0.15)',
              border: '1px solid rgba(251, 192, 45, 0.3)',
              color: '#fbc02d', fontSize: 11.5, fontWeight: 900,
              marginBottom: 10,
            }}>
              <i className="fas fa-map-marker-alt" />
              สถานที่: ชั้น {activeTaskModal.floor || 1} · {activeTaskModal.room || 'โซนหน้า'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
              ยื่นหน้านี้ให้แอดมินสแกนด้วยกล้อง เพื่อยืนยันว่าทำภารกิจสำเร็จ
            </div>

            <div style={{
              background: '#fff', padding: 16, borderRadius: 18,
              display: 'inline-block', marginBottom: 18,
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            }}>
              <QRCodeSVG
                value={JSON.stringify({
                  type: 'allofus_task',
                  playerUid: myUid,
                  taskId: activeTaskModal.id,
                  taskTitle: activeTaskModal.title,
                })}
                size={200}
                level="M"
              />
            </div>

            <button
              type="button"
              onClick={() => setActiveTaskModal(null)}
              className="au-btn au-btn-dark"
              style={{ width: '100%', padding: '10px', fontSize: 13 }}
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* ─── SECRET SABOTAGE PICKER MODAL (FOR IMPOSTOR) ─── */}
      {showSabotageModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 120,
          background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setShowSabotageModal(false)}>
          <div className="au-card" style={{
            padding: 22,
            maxWidth: 380, width: '100%',
            border: '3px solid #c51111',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ff5252', marginBottom: 4 }}>
              <i className="fas fa-radiation" />
              <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em' }}>IMPOSTOR SABOTAGE</span>
            </div>
            <div style={{ fontSize: 16.5, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
              เลือกสถานการณ์ก่อกวน
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>
              คำขอจะถูกส่งให้แอดมินตรวจสอบ โดยแอดมินต้องเป็นผู้กดยืนยันอนุมัติเสมอ สัญญาณเตือนจึงจะเริ่มทำงาน
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 300, overflowY: 'auto' }}>
              {(gameDoc.sabotagePool || DEFAULT_SABOTAGE_POOL).map(s => (
                <button
                  key={s.id || s.title}
                  type="button"
                  onClick={() => requestSabotage(s.title, s.desc, s.countdownSeconds, s.timeoutAction)}
                  style={{
                    padding: '11px 14px', borderRadius: 12,
                    background: '#0d131d',
                    border: '2px solid #1f2c42',
                    color: '#fff', textAlign: 'left', cursor: 'pointer',
                    transition: 'border-color 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ff8a80' }}>{s.title}</div>
                    <span style={{ fontSize: 10, color: '#ffcc80', background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 6, fontWeight: 800 }}>
                      {s.countdownSeconds || 90} วินาที
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{s.desc}</div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowSabotageModal(false)}
              className="au-btn au-btn-dark"
              style={{ width: '100%', padding: '10px', fontSize: 12.5 }}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* ─── REPORT DEAD BODY MODAL (FOR PLAYERS) ─── */}
      {showReportModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 130,
          background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setShowReportModal(false)}>
          <div className="au-card" style={{
            padding: 22,
            maxWidth: 420, width: '100%',
            border: '2.5px solid #ff5252',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(255, 82, 82, 0.2)', border: '1.5px solid #ff5252',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#ff5252', fontSize: 18,
              }}>
                <i className="fas fa-bullhorn" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>รายงานการพบศพ (REPORT BODY)</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>เลือกผู้เล่นที่คุณพบศพในบริเวณร้าน</div>
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 193, 7, 0.1)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 11,
              color: '#ffe082',
              marginBottom: 12,
              lineHeight: 1.4,
            }}>
              <i className="fas fa-info-circle" style={{ marginRight: 6 }} />
              ระบบแสดงรายชื่อผู้เล่นทุกคนโดยปิดบังสถานะการมีชีวิต เพื่อความลับในเกม
            </div>

            {/* Candidate list with identical neutral styling */}
            <div style={{
              flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
              paddingRight: 4, marginBottom: 16, maxHeight: 300,
            }}>
              {[...allPlayersList]
                .filter(p => p.uid !== myUid)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(p => {
                  const isSelected = selectedReportVictim?.uid === p.uid
                  return (
                    <button
                      key={p.uid}
                      type="button"
                      onClick={() => setSelectedReportVictim(p)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: isSelected ? 'rgba(255, 82, 82, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        border: isSelected ? '2px solid #ff5252' : '1px solid rgba(255, 255, 255, 0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AmongUsVisor color={p.color || '#78909c'} size={32} isAlive={true} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{p.name}</div>
                          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)' }}>ผู้เล่น</div>
                        </div>
                      </div>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: isSelected ? '2px solid #ff5252' : '2px solid rgba(255,255,255,0.3)',
                        background: isSelected ? '#ff5252' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <i className="fas fa-check" style={{ color: '#fff', fontSize: 10 }} />}
                      </div>
                    </button>
                  )
                })}
            </div>

            {/* Optional Player Emergency Button inside Modal */}
            <div style={{ marginBottom: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
              <button
                type="button"
                disabled={emergencyCooldownSec > 0 || Boolean(gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active')}
                onClick={async () => {
                  if (emergencyCooldownSec > 0) {
                    showToast(`อยู่ในช่วงคูลดาวน์ห้ามเรียกประชุมฉุกเฉิน (เหลืออีก ${emergencyCooldownSec} วินาที)`, 'error')
                    return
                  }
                  if (gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active') {
                    showToast('ไม่สามารถกดปุ่มเรียกประชุมฉุกเฉินได้ขณะมีสัญญาณ Sabotage! ต้องแก้ไขก่อน', 'error')
                    return
                  }
                  if (!window.confirm('ยืนยันกดปุ่มเรียกประชุมฉุกเฉิน (Emergency Meeting)?')) return
                  await callEmergencyMeeting(false)
                  setShowReportModal(false)
                }}
                className="au-btn au-btn-dark"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: 11.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: (emergencyCooldownSec > 0 || (gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active')) ? 0.5 : 1,
                  cursor: (emergencyCooldownSec > 0 || (gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active')) ? 'not-allowed' : 'pointer',
                }}
              >
                <i className={`fas fa-${emergencyCooldownSec > 0 ? 'clock' : 'bullhorn'}`} style={{ color: '#ef5350' }} />
                <span>
                  {emergencyCooldownSec > 0
                    ? `คูลดาวน์ห้ามประชุมฉุกเฉิน (${emergencyCooldownSec}s)`
                    : 'กดปุ่มประชุมฉุกเฉิน (EMERGENCY MEETING)'}
                </span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setShowReportModal(false)
                  setSelectedReportVictim(null)
                }}
                className="au-btn au-btn-dark"
                style={{ flex: 1, padding: 12, fontSize: 13 }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={!selectedReportVictim}
                onClick={async () => {
                  if (!selectedReportVictim) return
                  await callEmergencyMeeting(true, selectedReportVictim)
                  setShowReportModal(false)
                  setSelectedReportVictim(null)
                }}
                className="au-btn au-btn-red"
                style={{
                  flex: 2, padding: 12, fontSize: 13,
                  opacity: selectedReportVictim ? 1 : 0.4,
                  cursor: selectedReportVictim ? 'pointer' : 'not-allowed',
                }}
              >
                <i className="fas fa-bullhorn" style={{ marginRight: 6 }} />
                ยืนยันพบศพ {selectedReportVictim ? selectedReportVictim.name : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SELF-REPORT DEATH CONFIRMATION MODAL ─── */}
      {showSelfDeathConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 130,
          background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setShowSelfDeathConfirm(false)}>
          <div className="au-card" style={{
            padding: 22,
            maxWidth: 380, width: '100%',
            border: '2.5px solid #ef5350',
            textAlign: 'center',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              width: 50, height: 50, borderRadius: '50%',
              background: 'rgba(239, 83, 80, 0.2)', border: '2px solid #ef5350',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#ef5350', fontSize: 24, marginBottom: 12,
            }}>
              <i className="fas fa-skull" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
              ยืนยันว่าคุณถูกกำจัดแล้ว?
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 18 }}>
              หน้าจอของคุณจะเปลี่ยนเป็นสถานะวิญญาณ (Ghost) คุณยังสามารถทำภารกิจส่วนตัวช่วยฝ่ายคนดีได้เงียบๆ โดยจะไม่มีการแจ้งเตือนผู้อื่น และทุกคนจะทราบสถานะในที่ประชุมเท่านั้น
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowSelfDeathConfirm(false)}
                className="au-btn au-btn-dark"
                style={{ flex: 1, padding: 11, fontSize: 12.5 }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmSelfDeath}
                className="au-btn au-btn-red"
                style={{ flex: 1.5, padding: 11, fontSize: 12.5 }}
              >
                ยืนยัน (ฉันถูกกำจัด)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SHERIFF SECRET KILL MODAL ─── */}
      {showSheriffKillModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 130,
          background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setShowSheriffKillModal(false)}>
          <div className="au-card" style={{
            padding: 22,
            maxWidth: 420, width: '100%',
            border: '2.5px solid #fbc02d',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(251, 192, 45, 0.2)', border: '1.5px solid #fbc02d',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#ffd54f', fontSize: 18,
              }}>
                <i className="fas fa-star" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>นายอำเภอสั่งยิง (SHERIFF SHOOT)</div>
                <div style={{ fontSize: 11, color: '#ffe082' }}>กระสุน 1 นัดต่อรอบประชุม (ยิงคนดีตายทั้งคู่)</div>
              </div>
            </div>

            <div style={{
              background: 'rgba(239, 83, 80, 0.1)',
              border: '1px solid rgba(239, 83, 80, 0.3)',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 11,
              color: '#ffcdd2',
              marginBottom: 12,
              lineHeight: 1.4,
            }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: 6, color: '#ff5252' }} />
              คำเตือน: หากเลือกยิงผู้เล่นฝ่ายคนดี ทั้งคุณและเป้าหมายจะเสียชีวิตทันที! ระบบปิดบังสถานะการมีชีวิตเพื่อความลับ
            </div>

            {/* Candidate list with identical neutral styling */}
            <div style={{
              flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
              paddingRight: 4, marginBottom: 16, maxHeight: 300,
            }}>
              {[...allPlayersList]
                .filter(p => p.uid !== myUid)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(p => {
                  const isSelected = selectedSheriffTarget?.uid === p.uid
                  return (
                    <button
                      key={p.uid}
                      type="button"
                      onClick={() => setSelectedSheriffTarget(p)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: isSelected ? 'rgba(251, 192, 45, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        border: isSelected ? '2px solid #fbc02d' : '1px solid rgba(255, 255, 255, 0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AmongUsVisor color={p.color || '#78909c'} size={32} isAlive={true} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{p.name}</div>
                          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)' }}>ผู้เล่น</div>
                        </div>
                      </div>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: isSelected ? '2px solid #fbc02d' : '2px solid rgba(255,255,255,0.3)',
                        background: isSelected ? '#fbc02d' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <i className="fas fa-check" style={{ color: '#000', fontSize: 10 }} />}
                      </div>
                    </button>
                  )
                })}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setShowSheriffKillModal(false)
                  setSelectedSheriffTarget(null)
                }}
                className="au-btn au-btn-dark"
                style={{ flex: 1, padding: 12, fontSize: 13 }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={!selectedSheriffTarget}
                onClick={() => {
                  if (!selectedSheriffTarget) return
                  if (window.confirm(`ยืนยันยิง ${selectedSheriffTarget.name}? (หากคนนี้เป็นคนดี ทั้งคุณและเป้าหมายจะตายทันที)`)) {
                    handleSheriffKill(selectedSheriffTarget.uid)
                  }
                }}
                className="au-btn au-btn-yellow"
                style={{
                  flex: 2, padding: 12, fontSize: 13,
                  opacity: selectedSheriffTarget ? 1 : 0.4,
                  cursor: selectedSheriffTarget ? 'pointer' : 'not-allowed',
                }}
              >
                <i className="fas fa-crosshairs" style={{ marginRight: 6 }} />
                ลั่นไกยิง {selectedSheriffTarget ? selectedSheriffTarget.name : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT TASK MODAL (FOR ADMIN) ─── */}
      {editingTask && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 130,
          background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setEditingTask(null)}>
          <div className="au-card" style={{
            padding: 22,
            maxWidth: 400, width: '100%',
            border: '2.5px solid #0288d1',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginBottom: 14 }}>
              แก้ไขภารกิจ
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                  ชื่อภารกิจ
                </label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    background: '#0d131d', border: '2px solid #1f2c42',
                    color: '#fff', fontSize: 13, fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                  รายละเอียดภารกิจ
                </label>
                <textarea
                  rows={2}
                  value={editingTask.desc}
                  onChange={e => setEditingTask({ ...editingTask, desc: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    background: '#0d131d', border: '2px solid #1f2c42',
                    color: '#fff', fontSize: 12, resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                    ชั้น (1 - 5)
                  </label>
                  <select
                    value={editingTask.floor}
                    onChange={e => {
                      const fl = Number(e.target.value)
                      const rooms = BUILDING_FLOORS.find(b => b.floor === fl)?.rooms || []
                      setEditingTask({
                        ...editingTask,
                        floor: fl,
                        room: rooms[0] || '',
                      })
                    }}
                    style={{
                      width: '100%', padding: '7px 8px', borderRadius: 8,
                      background: '#0d131d', color: '#fff',
                      border: '2px solid #1f2c42', fontSize: 12,
                      fontFamily: 'inherit',
                    }}
                  >
                    {BUILDING_FLOORS.map(b => (
                      <option key={b.floor} value={b.floor}>{b.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                    ห้อง / โซน
                  </label>
                  <select
                    value={editingTask.room}
                    onChange={e => setEditingTask({ ...editingTask, room: e.target.value })}
                    style={{
                      width: '100%', padding: '7px 8px', borderRadius: 8,
                      background: '#0d131d', color: '#fff',
                      border: '2px solid #1f2c42', fontSize: 12,
                      fontFamily: 'inherit',
                    }}
                  >
                    {(BUILDING_FLOORS.find(b => b.floor === Number(editingTask.floor))?.rooms || []).map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                    ซ้ำได้สูงสุด
                  </label>
                  <select
                    value={editingTask.maxAssignedCount || 3}
                    onChange={e => setEditingTask({ ...editingTask, maxAssignedCount: Number(e.target.value) })}
                    style={{
                      width: '100%', padding: '7px 8px', borderRadius: 8,
                      background: '#0d131d', color: '#fff',
                      border: '2px solid #1f2c42', fontSize: 12,
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value={1}>1 คน (ไม่ซ้ำ)</option>
                    <option value={2}>2 คน</option>
                    <option value={3}>3 คน (สูงสุด)</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleUpdateTaskInPool}
                className="au-btn au-btn-blue"
                style={{ flex: 1, padding: '10px', fontSize: 13 }}
              >
                บันทึกการแก้ไข
              </button>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="au-btn au-btn-dark"
                style={{ padding: '10px 16px', fontSize: 13 }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT SABOTAGE MODAL (FOR ADMIN) ─── */}
      {editingSabotage && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 130,
          background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setEditingSabotage(null)}>
          <div className="au-card" style={{
            padding: 22,
            maxWidth: 400, width: '100%',
            border: '2.5px solid #c51111',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginBottom: 14 }}>
              แก้ไข Sabotage
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                  ชื่อ Sabotage
                </label>
                <input
                  type="text"
                  value={editingSabotage.title}
                  onChange={e => setEditingSabotage({ ...editingSabotage, title: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    background: '#0d131d', border: '2px solid #1f2c42',
                    color: '#fff', fontSize: 13, fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                  คำอธิบาย / อาการ
                </label>
                <textarea
                  rows={2}
                  value={editingSabotage.desc}
                  onChange={e => setEditingSabotage({ ...editingSabotage, desc: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    background: '#0d131d', border: '2px solid #1f2c42',
                    color: '#fff', fontSize: 12, resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 3, display: 'block' }}>
                  เวลานับถอยหลัง (วินาที)
                </label>
                <input
                  type="number"
                  value={editingSabotage.countdownSeconds}
                  onChange={e => setEditingSabotage({ ...editingSabotage, countdownSeconds: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    background: '#0d131d', border: '2px solid #1f2c42',
                    color: '#fff', fontSize: 12, fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 5, display: 'block' }}>
                  ผลเมื่อหมดเวลา (Timeout Action)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setEditingSabotage({ ...editingSabotage, timeoutAction: 'end_game' })}
                    className={`au-btn ${editingSabotage.timeoutAction === 'end_game' ? 'au-btn-red' : 'au-btn-dark'}`}
                    style={{ padding: '8px 10px', fontSize: 11 }}
                  >
                    เกมจบ (คนร้ายชนะ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSabotage({ ...editingSabotage, timeoutAction: 'continue' })}
                    className={`au-btn ${editingSabotage.timeoutAction !== 'end_game' ? 'au-btn-green' : 'au-btn-dark'}`}
                    style={{ padding: '8px 10px', fontSize: 11 }}
                  >
                    เกมเดินต่อ (เคลียร์ปกติ)
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleUpdateSabotageInPool}
                className="au-btn au-btn-red"
                style={{ flex: 1, padding: '10px', fontSize: 13 }}
              >
                บันทึกการแก้ไข
              </button>
              <button
                type="button"
                onClick={() => setEditingSabotage(null)}
                className="au-btn au-btn-dark"
                style={{ padding: '10px 16px', fontSize: 13 }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── OFFICIAL GAME RULES MODAL ─── */}
      {showRulesModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 140,
          background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setShowRulesModal(false)}>
          <div className="au-card" style={{
            padding: 22,
            maxWidth: 480, width: '100%',
            maxHeight: '85vh', overflowY: 'auto',
            border: '2.5px solid #0288d1',
            boxSizing: 'border-box',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>
                  กฎและกติกาการเล่น All Of Us Will Die
                </div>
                <div style={{ fontSize: 11, color: '#80d8ff', fontWeight: 700, marginTop: 2 }}>
                  Among Us ในชีวิตจริง ณ คาเฟ่บอร์ดเกม SOFUN
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: 'none',
                  color: 'rgba(255,255,255,0.7)', width: 28, height: 28, borderRadius: 8,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <i className="fas fa-times" style={{ fontSize: 12 }} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)' }}>

              {/* Roles Section */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 900, color: '#ffd54f', marginBottom: 8 }}>
                  <i className="fas fa-users" style={{ marginRight: 6 }} /> บทบาทและเป้าหมายการเอาชนะ
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>
                    <strong style={{ color: '#29b6f6' }}>คนดี (Crewmate):</strong> ปฏิบัติภารกิจในสถานที่จริงให้ครบ 100% หรือจับคนร้ายโหวตออกให้หมดทุกคน
                  </div>
                  <div>
                    <strong style={{ color: '#e53935' }}>คนร้าย (Impostor):</strong> ลอบกำจัดคนดีและโดโด้จนเหลือจำนวนรอดชีวิตเท่ากันหรือน้อยกว่าคนร้าย ปะปนเนียน และลอบส่งสัญญาณก่อกวนระบบ (Sabotage)
                  </div>
                  <div>
                    <strong style={{ color: '#ffd54f' }}>นายอำเภอ (Sheriff):</strong> อยู่ฝ่ายคนดี มีสิทธิ์ลั่นไกกำจัดคนร้าย 1 นัดต่อ 1 รอบประชุม โดยแตะที่แถบ TOTAL TASKS ด้านบน (<span style={{ color: '#ff5252' }}>คำเตือน: หากยิงคนดีจะตายตกตามกันทันที</span>)
                  </div>
                  <div>
                    <strong style={{ color: '#ce93d8' }}>โดโด้ (Dodo):</strong> ฝ่ายอิสระ ชนะเดี่ยวทันทีหากสามารถปั่นหัวหลอกให้ที่ประชุมโหวตขับไล่ตนเองออกได้สำเร็จ
                  </div>
                </div>
              </div>

              {/* Tasks Section */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 900, color: '#81c784', marginBottom: 8 }}>
                  <i className="fas fa-tasks" style={{ marginRight: 6 }} /> กฎภารกิจและการกระจายตัว
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>ผู้เล่นแต่ละคนจะได้รับ 3 ภารกิจ กระจายอยู่คนละชั้นแบบสุ่ม (3 ชั้นไม่ซ้ำกันต่อคน)</li>
                  <li>แต่ละภารกิจจำกัดโควตาผู้เล่นทำซ้ำตามที่แอดมินกำหนด (1 - 3 คน) ห้ามเกินโควตา</li>
                  <li>เมื่อทำภารกิจในสถานที่จริงเสร็จ ให้แสดง QR Code ภารกิจให้แอดมินหรือ DM สแกนเพื่อยืนยัน</li>
                </ul>
              </div>

              {/* Silent Death Report Section */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 900, color: '#ff8a80', marginBottom: 8 }}>
                  <i className="fas fa-skull" style={{ marginRight: 6 }} /> กฎการถูกกำจัดและการรายงานตัว
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>หากถูกคนร้ายกำจัด ให้กดปุ่ม "ฉันถูกกำจัดแล้ว" บนหน้าจอเงียบๆ โดยไม่มีสัญญาณเตือนดังรบกวน</li>
                  <li>ผู้เล่นอื่นจะไม่ทราบว่าใครเสียชีวิตจนกว่าจะมีการกดประชุมฉุกเฉิน</li>
                  <li>ผู้ตายจะกลายเป็นวิญญาณ ไม่สามารถโหวตได้ แต่สามารถเป็นผู้สังเกตการณ์ดูได้สดๆ ว่าใครโหวตใครในที่ประชุม</li>
                </ul>
              </div>

              {/* Anonymous Meeting & Voting Section */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 900, color: '#64b5f6', marginBottom: 8 }}>
                  <i className="fas fa-vote-yea" style={{ marginRight: 6 }} /> กฎการประชุมฉุกเฉินและการโหวต (Anonymous Voting)
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>เมื่อกดปุ่ม Emergency Meeting ทุกคนต้องมารวมตัวกันที่โต๊ะประชุมทันที</li>
                  <li>ผู้เล่นที่เสียชีวิตจะขึ้นป้าย DEAD ชัดเจน และถูกล็อคไม่ให้ลงคะแนนโหวต</li>
                  <li>ระหว่างการโหวต คะแนนจะถูกปิดเป็นความลับ เห็นเฉพาะสถานะว่าใครโหวตแล้ว</li>
                  <li>ผลคะแนนจะสรุปเมื่อหมดเวลาหรือทุกคนโหวตเสร็จ โดยแจ้งจำนวนเสียงของแต่ละคน แต่ไม่เปิดเผยว่าใครโหวตใคร</li>
                  <li>สามารถกด REPORT ศพได้ตลอดเวลา แม้จะเกิดสัญญาณ Sabotage อยู่ (การ Report ศพจะยกเลิก Sabotage ทันทีเพื่อเข้าสู่การประชุม)</li>
                  <li>หากหมดเวลาการเล่นหลัก (00:00) ก่อนที่ฝ่ายคนดีจะทำภารกิจครบ 100% ฝ่ายคนร้ายจะเป็นผู้ชนะเกมทันที</li>
                </ul>
              </div>

            </div>

            <button
              type="button"
              onClick={() => setShowRulesModal(false)}
              className="au-btn au-btn-blue"
              style={{ width: '100%', marginTop: 16, padding: '10px', fontSize: 13 }}
            >
              รับทราบกฎกติกา
            </button>
          </div>
        </div>
      )}

      {/* ─── ADMIN CAMERA QR SCANNER MODAL ─── */}
      {scannerOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 150,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', marginBottom: 10 }}>
              ส่องกล้องไปที่ QR Code ภารกิจของผู้เล่น
            </div>
            <div
              id="allofus-admin-qr-reader"
              style={{
                width: '100%',
                borderRadius: 18,
                overflow: 'hidden',
                background: '#000',
                marginBottom: 16,
                border: '3px solid #ff5252',
                boxShadow: '0 0 20px rgba(255, 82, 82, 0.4)',
              }}
            />
            <button
              type="button"
              onClick={() => setScannerOpen(false)}
              className="au-btn au-btn-red"
              style={{ padding: '10px 28px', fontSize: 13 }}
            >
              ปิดกล้อง
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
