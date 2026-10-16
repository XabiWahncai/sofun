import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  doc, onSnapshot, setDoc, updateDoc, getDoc,
  collection, query, where, getDocs, serverTimestamp, deleteField,
} from 'firebase/firestore'
import { db } from '../firebase'
import { QRCodeSVG } from 'qrcode.react'
import { Html5Qrcode } from 'html5-qrcode'

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

function playAlarmSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    const now = ctx.currentTime
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.35)
    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.36)
  } catch {}
}

function playMeetingBuzzer() {
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
    : '#0288d1'

  const bodyColor = color || defaultBody

  const shadowColor = !isAlive
    ? '#455a64'
    : role === 'impostor'
    ? '#7a0813'
    : role === 'dodo'
    ? '#4a148c'
    : (color ? '#000000' : '#01579b')

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
      {/* Backpack on the side */}
      <div
        style={{
          position: 'absolute',
          left: -4,
          top: '25%',
          width: 5,
          height: '50%',
          borderRadius: 3,
          background: shadowColor,
          border: '1.5px solid #0a0e17',
        }}
      />

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
  { id: 'sab_lights', title: 'ไฟดับ (Lights Out)', desc: 'ลดการมองเห็น คนดีต้องรีบไปแก้ปัญหากับแอดมินที่เคาน์เตอร์', countdownSeconds: 90 },
  { id: 'sab_o2', title: 'อากาศรั่ว (O2 Depletion)', desc: 'มีเวลานับถอยหลัง คนดีต้องรีบไปกู้สถานการณ์กับแอดมิน', countdownSeconds: 90 },
  { id: 'sab_doors', title: 'ประตูล็อค (Doors Locked)', desc: 'ประตูปิดกั้น คนดีต้องช่วยกันเคลียร์ทางกับแอดมิน', countdownSeconds: 90 },
  { id: 'sab_comms', title: 'ป่วนระบบสื่อสาร (Comms Jammed)', desc: 'แถบความคืบหน้าภารกิจจะถูกซ่อนชั่วคราว', countdownSeconds: 90 },
]

// ── Default Tasks Pool for Real Life Boardgame Cafe ───
export const DEFAULT_TASKS_POOL = [
  { id: 't1', title: 'จัดเรียงแก้วน้ำ 5 ใบ', desc: 'ไปจัดเรียงแก้วน้ำที่จุดบริการน้ำดื่มให้เป็นระเบียบเรียบร้อย', floor: 1, room: 'โซนหน้า' },
  { id: 't2', title: 'ตรวจสอบชุดแต่งตัว', desc: 'เดินไปเช็คความเรียบร้อยของชุดแต่งตัวในห้อง', floor: 1, room: 'ห้องแต่งตัว' },
  { id: 't3', title: 'นับกล่องเกมโซนหลัง', desc: 'เดินไปนับกล่องเกมที่วางอยู่บริเวณโซนหลัง 3 กล่อง', floor: 1, room: 'โซนหลัง' },
  { id: 't4', title: 'ตรวจตราโถงทางเดินชั้น 2', desc: 'เดินสำรวจความเรียบร้อยบริเวณโถงทางเดินชั้น 2', floor: 2, room: 'โถงทางเดิน' },
  { id: 't5', title: 'นับเบาะนั่งห้องญี่ปุ่น', desc: 'เดินไปนับจำนวนเบาะนั่งในห้องญี่ปุ่นแล้วจำมาตอบ', floor: 2, room: 'ห้องญี่ปุ่น' },
  { id: 't6', title: 'ตรวจตราโต๊ะห้องจีน', desc: 'เดินไปสำรวจโต๊ะเล่นเกมในห้องจีน', floor: 3, room: 'ห้องจีน' },
  { id: 't7', title: 'ถ่ายรูปคู่กับ DM ห้องยุโรป', desc: 'เดินไปหา DM ประจำห้องยุโรปแล้วขอถ่ายรูปคู่เป็นหลักฐาน', floor: 3, room: 'ห้องยุโรป' },
  { id: 't8', title: 'สำรวจห้องผี', desc: 'เดินเข้าไปในห้องผีและถ่ายรูปสัญลักษณ์ที่กำหนด', floor: 4, room: 'ห้องผี' },
  { id: 't9', title: 'สำรวจห้องแคบ', desc: 'เดินไปส่องดูความเรียบร้อยในห้องแคบชั้น 4', floor: 4, room: 'ห้องแคบ' },
  { id: 't10', title: 'ตรวจห้องวินเทจ', desc: 'เดินไปสำรวจของตกแต่งในห้องวินเทจชั้น 5', floor: 5, room: 'ห้องวินเทจ' },
  { id: 't11', title: 'เช็คห้องโปรเจคเตอร์', desc: 'เดินขึ้นไปดูภาพโปรเจคเตอร์ที่ห้องโปรเจคเตอร์ชั้น 5', floor: 5, room: 'ห้องโปรเจคเตอร์' },
]

export default function AllOfUsWillDiePage({ lineUser, firebaseUser, isAdmin: isAppAdmin, showToast, showPage }) {
  const [activeParty, setActiveParty] = useState(null)
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
    return localStorage.getItem('allofus_player_uid') || lineUser?.uid || lineUser?.userId || lineUser?.id || ''
  })
  const [myName, setMyName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [directJoinName, setDirectJoinName] = useState('')
  const [isAdminView, setIsAdminView] = useState(false)
  const [activeTaskModal, setActiveTaskModal] = useState(null)
  const [showSabotageModal, setShowSabotageModal] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskFloor, setNewTaskFloor] = useState(1)
  const [newTaskRoom, setNewTaskRoom] = useState(BUILDING_FLOORS[0].rooms[0])
  const [taskFloorFilter, setTaskFloorFilter] = useState('all')
  const [editingTask, setEditingTask] = useState(null)

  const [newSabTitle, setNewSabTitle] = useState('')
  const [newSabDesc, setNewSabDesc] = useState('')
  const [newSabCountdown, setNewSabCountdown] = useState(90)
  const [editingSabotage, setEditingSabotage] = useState(null)

  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [meetingTimeSec, setMeetingTimeSec] = useState(0)
  const [sabotageTimeSec, setSabotageTimeSec] = useState(0)
  const [selectedVoteTarget, setSelectedVoteTarget] = useState(null)
  const [showRolePicker, setShowRolePicker] = useState(false)

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

  // ── 1. Find Special Event Active Party / Order (pos_live or orders) ───
  useEffect(() => {
    let posSession = null
    let orderSession = null

    const evaluateParty = (pos, ord) => {
      if (pos) {
        const title = (pos.scriptTitle || pos.eventName || pos.label || '').toLowerCase().trim()
        const scriptId = (pos.scriptId || '').toLowerCase().trim()
        const room = (pos.room || '').toLowerCase().trim()
        const isSpecial = (
          title.includes('special event') ||
          title.includes('secial event') ||
          title.includes('spacial event') ||
          title.includes('all of us') ||
          scriptId.includes('special') ||
          scriptId.includes('allofus') ||
          room.includes('special')
        )
        if (isSpecial) return pos
      }

      if (ord) {
        const title = (ord.scriptTitle || '').toLowerCase().trim()
        const scriptId = (ord.scriptId || '').toLowerCase().trim()
        const room = (ord.room || '').toLowerCase().trim()
        const isSpecial = (
          title.includes('special event') ||
          title.includes('secial event') ||
          title.includes('spacial event') ||
          title.includes('all of us') ||
          scriptId.includes('special') ||
          scriptId.includes('allofus') ||
          room.includes('special')
        )
        if (isSpecial) return ord
      }

      return pos || ord || null
    }

    // 1. Listen to pos_live/current (active real-time session from POS)
    const unsubPos = onSnapshot(doc(db, 'pos_live', 'current'), snap => {
      if (snap.exists()) {
        const data = snap.data()
        const sessions = data.sessions || []
        const special = sessions.find(s => {
          const title = (s.scriptTitle || s.eventName || s.label || '').toLowerCase().trim()
          const scriptId = (s.scriptId || '').toLowerCase().trim()
          const room = (s.room || '').toLowerCase().trim()
          return (
            title.includes('special event') ||
            title.includes('secial event') ||
            title.includes('spacial event') ||
            title.includes('all of us') ||
            scriptId.includes('special') ||
            scriptId.includes('allofus') ||
            room.includes('special')
          )
        })
        posSession = special || (sessions.length > 0 ? sessions[0] : null)
      } else {
        posSession = null
      }
      setActiveParty(evaluateParty(posSession, orderSession))
    }, err => console.warn('pos_live sync error:', err))

    // 2. Listen to orders (confirmed active orders)
    const q = query(collection(db, 'orders'), where('status', '==', 'active'))
    const unsubOrders = onSnapshot(q, snap => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const specialEvent = orders.find(o => {
        const title = (o.scriptTitle || '').toLowerCase().trim()
        const scriptId = (o.scriptId || '').toLowerCase().trim()
        const room = (o.room || '').toLowerCase().trim()
        return (
          title.includes('special event') ||
          title.includes('secial event') ||
          title.includes('spacial event') ||
          title.includes('all of us') ||
          scriptId.includes('special') ||
          scriptId.includes('allofus') ||
          room.includes('special')
        )
      })
      orderSession = specialEvent || orders[0] || null
      setActiveParty(evaluateParty(posSession, orderSession))
    }, err => console.warn('Special event party query error:', err))

    return () => {
      unsubPos()
      unsubOrders()
    }
  }, [])

  // ── 2. Listen to Game State Document in Realtime ─────────
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

  // ── 3. Auto-populate player into game if in party ────────
  useEffect(() => {
    if (!gameDoc || !activeParty) return
    const members = activeParty.members || []
    if (members.length === 0) return

    // Ensure myUid has valid player in party
    let effectiveUid = myUid
    if (!effectiveUid && members.length > 0) {
      const matchingLine = members.find(m => m.uid === lineUser?.uid)
      if (matchingLine) {
        effectiveUid = matchingLine.uid
        setMyUid(matchingLine.uid)
        localStorage.setItem('allofus_player_uid', matchingLine.uid)
      }
    }

    // Synchronize party members into gameDoc.players if in waiting state
    if (gameDoc.status === 'waiting') {
      const currentPlayers = gameDoc.players || {}
      let changed = false
      const updatedPlayers = { ...currentPlayers }

      members.forEach(m => {
        if (!updatedPlayers[m.uid]) {
          updatedPlayers[m.uid] = {
            uid: m.uid,
            name: m.name || 'ผู้เล่น',
            avatar: m.avatar || '',
            role: 'crewmate',
            isAlive: true,
            tasks: [],
            ready: false,
          }
          changed = true
        }
      })

      if (changed) {
        updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
          players: updatedPlayers
        }).catch(() => {})
      }
    }
  }, [gameDoc?.status, activeParty, myUid, lineUser?.uid])

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
        if (rem === 0 && hasAdminPerm && gameDoc.winner === null) {
          // Time expired -> Impostors Win!
          handleEndGame('impostor', 'หมดเวลาเกม! ฝ่ายคนร้ายชนะ!')
        }
      } else {
        setCurrentTimeSec(gameDoc.gameSecondsRemaining || 0)
      }

      // Sabotage Timer
      if (gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active') {
        const sabElapsed = Math.floor((now - (gameDoc.sabotage.startedAt || now)) / 1000)
        const sabRem = Math.max(0, (gameDoc.sabotage.countdownSeconds || 90) - sabElapsed)
        setSabotageTimeSec(sabRem)
        if (sabRem === 0 && hasAdminPerm && gameDoc.winner === null) {
          handleEndGame('impostor', `กู้สถานการณ์ Sabotage ไม่ทัน! ${gameDoc.sabotage.title} ทำให้ฝ่ายคนร้ายชนะ!`)
        }
      }

      // Meeting Discussion / Voting Timer
      if (gameDoc.meeting && (gameDoc.status === 'meeting_discussion' || gameDoc.status === 'meeting_voting')) {
        const meetElapsed = Math.floor((now - (gameDoc.meeting.startTime || now)) / 1000)
        const totalDuration = gameDoc.meeting.durationSeconds || 180 // 3 minutes total
        const meetRem = Math.max(0, totalDuration - meetElapsed)
        setMeetingTimeSec(meetRem)

        // Automatically switch from discussion to voting in last 60 seconds
        if (meetRem <= 60 && gameDoc.status === 'meeting_discussion' && hasAdminPerm) {
          updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'meeting_voting',
          }).catch(() => {})
        }

        // Automatically conclude votes when time hits 0
        if (meetRem === 0 && gameDoc.status === 'meeting_voting' && hasAdminPerm) {
          concludeVoting()
        }
      }
    }, 500)

    return () => clearInterval(interval)
  }, [gameDoc, hasAdminPerm])

  // Play audio alerts on meeting call or sabotage
  const prevStatusRef = useRef(gameDoc?.status)
  const prevSabotageRef = useRef(gameDoc?.sabotage?.active)
  useEffect(() => {
    if (!gameDoc) return
    if (prevStatusRef.current !== 'meeting_called' && gameDoc.status === 'meeting_called') {
      playMeetingBuzzer()
    }
    if (!prevSabotageRef.current && gameDoc.sabotage?.active && gameDoc.sabotage?.status === 'active') {
      playAlarmSound()
    }
    prevStatusRef.current = gameDoc.status
    prevSabotageRef.current = gameDoc.sabotage?.active
  }, [gameDoc?.status, gameDoc?.sabotage?.active, gameDoc?.sabotage?.status])

  // ── Derived Player Information ──────────────────────────
  const me = (gameDoc?.players && myUid) ? gameDoc.players[myUid] : null
  const myRole = me?.role || 'crewmate'
  const isAlive = me?.isAlive !== false
  const allPlayersList = useMemo(() => {
    return Object.values(gameDoc?.players || {})
  }, [gameDoc?.players])

  // Total Task Progress Calculation
  const { totalTasksCount, completedTasksCount, progressPercent } = useMemo(() => {
    let total = 0
    let completed = 0
    allPlayersList.forEach(p => {
      // Calculate progress based on all non-impostor players or all tasks
      (p.tasks || []).forEach(t => {
        total++
        if (t.verified) completed++
      })
    })
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return { totalTasksCount: total, completedTasksCount: completed, progressPercent: pct }
  }, [allPlayersList])

  // Auto-check Crewmate win condition on 100% tasks
  useEffect(() => {
    if (hasAdminPerm && gameDoc?.status === 'playing' && totalTasksCount > 0 && completedTasksCount >= totalTasksCount && !gameDoc.winner) {
      handleEndGame('crewmate', 'ภารกิจทั้งหมดเสร็จสมบูรณ์ 100%! ฝ่ายคนดีชนะ!')
    }
  }, [hasAdminPerm, gameDoc?.status, totalTasksCount, completedTasksCount, gameDoc?.winner])

  // Format MM:SS
  const fmtTime = (secs) => {
    const s = Math.max(0, secs)
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
  }

  // ── Game Flow Actions ───────────────────────────────────

  // Player role selection in lobby
  const setMyRole = async (role) => {
    if (!myUid || !gameDoc) return
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        [`players.${myUid}.role`]: role,
        [`players.${myUid}.ready`]: true,
      })
      setShowRolePicker(false)
      showToast(`เลือกบทบาทเรียบร้อย`)
    } catch (e) {
      showToast('บันทึกบทบาทล้มเหลว: ' + e.message, 'error')
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

  // Direct join game by entering name
  const handleDirectJoin = async () => {
    const trimmed = (directJoinName || '').trim()
    if (!trimmed) {
      showToast('กรุณาระบุชื่อของคุณ', 'error')
      return
    }
    const newUid = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6)
    setMyUid(newUid)
    localStorage.setItem('allofus_player_uid', newUid)
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        [`players.${newUid}`]: {
          uid: newUid,
          name: trimmed,
          avatar: '',
          role: 'crewmate',
          isAlive: true,
          tasks: [],
          ready: false,
        }
      })
      setDirectJoinName('')
      showToast(`ยินดีต้อนรับ ${trimmed}`)
    } catch (e) {
      showToast('เข้าร่วมเกมล้มเหลว: ' + e.message, 'error')
    }
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

  // Admin: Sync / Overwrite players strictly from active POS party
  const handleSyncFromPos = async () => {
    if (!activeParty || !activeParty.members || activeParty.members.length === 0) {
      showToast('ไม่พบสมาชิกในปาร์ตี้ POS ปัจจุบัน', 'error')
      return
    }
    if (!window.confirm(`ยืนยันซิงค์รายชื่อจาก POS (${activeParty.members.length} คน) แทนที่รายชื่อเดิม?`)) return
    try {
      const newPlayers = {}
      activeParty.members.forEach(m => {
        newPlayers[m.uid] = {
          uid: m.uid,
          name: m.name || 'ผู้เล่น',
          avatar: m.avatar || '',
          role: 'crewmate',
          isAlive: true,
          tasks: [],
          ready: false,
        }
      })
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        players: newPlayers
      })
      showToast(`ซิงค์สมาชิก ${activeParty.members.length} คนจาก POS เรียบร้อย`)
    } catch (e) {
      showToast('ซิงค์ล้มเหลว: ' + e.message, 'error')
    }
  }

  // Admin starts the game: randomly distributes 3 tasks per player (unique floors guaranteed)
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

    // Randomize 3 tasks with unique floors for each player
    const updatedPlayers = { ...gameDoc.players }
    allPlayersList.forEach(p => {
      // Pick 3 unique floors randomly
      const shuffledFloors = [...availableFloors].sort(() => 0.5 - Math.random())
      const chosenFloors = shuffledFloors.slice(0, 3)

      // Pick 1 random task from each chosen floor
      const assignedTasks = chosenFloors.map(floorNum => {
        const floorTasks = tasksByFloor[floorNum]
        return floorTasks[Math.floor(Math.random() * floorTasks.length)]
      })

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
      updatedPlayers[p.uid] = {
        ...p,
        isAlive: true,
        tasks: assigned,
      }
    })

    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'playing',
        players: updatedPlayers,
        gameSecondsRemaining: durationSecs,
        gameTimerRunning: true,
        timerUpdatedAt: Date.now(),
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

  // Impostor requests Sabotage
  const requestSabotage = async (title, desc, countdownSeconds = 90) => {
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
          startedAt: 0,
        }
      })
      setShowSabotageModal(false)
      showToast('ส่งคำขอ Sabotage ถึงแอดมินแล้ว')
    } catch (e) {
      showToast('ส่งคำขอ Sabotage ล้มเหลว', 'error')
    }
  }

  // Admin approves Sabotage
  const approveSabotage = async () => {
    if (!gameDoc?.sabotage) return
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        'sabotage.status': 'active',
        'sabotage.startedAt': Date.now(),
      })
      playAlarmSound()
      showToast('อนุมัติ Sabotage แล้ว! กระจายสัญญาณเตือนทุกคน')
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
      showToast('ยกเลิก Sabotage สำเร็จ คนดีกู้ภัยเรียบร้อย')
    } catch (e) {
      showToast('ยกเลิกล้มเหลว', 'error')
    }
  }

  // Call Emergency Meeting or Report Body
  const callEmergencyMeeting = async (isReport = false) => {
    if (gameDoc.status !== 'playing') return
    try {
      const now = Date.now()
      // Pause main game timer during meeting
      const elapsedSec = Math.floor((now - (gameDoc.timerUpdatedAt || now)) / 1000)
      const currentRemaining = Math.max(0, (gameDoc.gameSecondsRemaining || 0) - elapsedSec)

      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'meeting_called',
        gameSecondsRemaining: currentRemaining,
        gameTimerRunning: false,
        meeting: {
          calledBy: { uid: myUid, name: me?.name || 'ผู้เล่น' },
          type: isReport ? 'body_report' : 'emergency_button',
          startTime: now,
          durationSeconds: 180, // 3 minutes
          votes: {},
          result: null,
        }
      })
      playMeetingBuzzer()
      showToast(isReport ? 'REPORT ศพสำเร็จ! เรียกทุกคนเข้าที่ประชุม' : 'เปิดประชุมฉุกเฉินสำเร็จ')
    } catch (e) {
      showToast('เรียกประชุมล้มเหลว: ' + e.message, 'error')
    }
  }

  // Admin officially starts discussion countdown (3 mins)
  const startDiscussionPhase = async () => {
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'meeting_discussion',
        'meeting.startTime': Date.now(),
        'meeting.durationSeconds': 180,
      })
      showToast('เริ่มจับเวลาประชุม 3 นาทีแล้ว')
    } catch (e) {
      showToast('เริ่มประชุมล้มเหลว', 'error')
    }
  }

  // Fast forward to voting phase (1 min remaining)
  const openVotingPhaseNow = async () => {
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'meeting_voting',
        'meeting.startTime': Date.now() - 120000, // advance clock to last 60s
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
          outcomeText = `${victim.name} คือโดโด้! โดโด้ถูกโหวตออกและเป็นผู้ชนะเกมทันที!`
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
          'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: true },
        })
      } else {
        // Check if all impostors eliminated
        const remainingImpostors = Object.values(updatedPlayers).filter(p => p.role === 'impostor' && p.isAlive)
        const remainingCrew = Object.values(updatedPlayers).filter(p => p.role !== 'impostor' && p.isAlive)

        if (remainingImpostors.length === 0) {
          // Crewmates win!
          await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'ended',
            players: updatedPlayers,
            winner: 'crewmate',
            winReason: 'โหวตคนร้ายออกหมดแล้ว! ฝ่ายคนดีเป็นผู้ชนะ!',
            'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: false, isTie, electedTarget },
          })
        } else if (remainingImpostors.length >= remainingCrew.length) {
          // Impostors win!
          await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'ended',
            players: updatedPlayers,
            winner: 'impostor',
            winReason: 'จำนวนคนร้ายเท่ากับคนดีแล้ว! ฝ่ายคนร้ายชนะ!',
            'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: false, isTie, electedTarget },
          })
        } else {
          // Move to meeting result screen
          await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'meeting_result',
            players: updatedPlayers,
            'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: false, isTie, electedTarget },
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
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'playing',
        gameTimerRunning: true,
        timerUpdatedAt: Date.now(),
        meeting: null,
      })
      showToast('เล่นเกมต่อแล้ว เวลาเดินต่อ')
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
          isAlive: true,
          tasks: [],
          ready: false,
        }
      })
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        status: 'waiting',
        gameSecondsRemaining: (gameDoc.gameDurationMinutes || 20) * 60,
        gameTimerRunning: false,
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
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        [`players.${playerUid}.tasks`]: updatedTasks
      })
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
    }
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        taskPool: [...pool, item]
      })
      setNewTaskTitle('')
      setNewTaskDesc('')
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
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .au-btn {
          font-family: inherit;
          font-weight: 900;
          border: 2.5px solid #080d16;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.08s ease-in-out;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          user-select: none;
        }
        .au-btn:active {
          transform: translateY(2px);
          box-shadow: none !important;
        }
        .au-btn-red {
          background: #c51111;
          color: #ffffff;
          border-bottom: 4.5px solid #7a0813;
          box-shadow: 0 4px 0 #7a0813, 0 6px 16px rgba(197, 17, 17, 0.4);
        }
        .au-btn-green {
          background: #2e7d32;
          color: #ffffff;
          border-bottom: 4.5px solid #1b5e20;
          box-shadow: 0 4px 0 #1b5e20, 0 6px 16px rgba(46, 125, 50, 0.4);
        }
        .au-btn-blue {
          background: #0288d1;
          color: #ffffff;
          border-bottom: 4.5px solid #01579b;
          box-shadow: 0 4px 0 #01579b, 0 6px 16px rgba(2, 136, 209, 0.4);
        }
        .au-btn-purple {
          background: #8e24aa;
          color: #ffffff;
          border-bottom: 4.5px solid #4a148c;
          box-shadow: 0 4px 0 #4a148c, 0 6px 16px rgba(142, 36, 170, 0.4);
        }
        .au-btn-yellow {
          background: #fbc02d;
          color: #111827;
          border-bottom: 4.5px solid #f57f17;
          box-shadow: 0 4px 0 #f57f17, 0 6px 16px rgba(251, 192, 45, 0.4);
        }
        .au-btn-dark {
          background: #1e293b;
          color: #ffffff;
          border-bottom: 4.5px solid #0f172a;
          box-shadow: 0 4px 0 #0f172a;
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
            role={gameDoc.status === 'waiting' ? 'crewmate' : (myRole || 'crewmate')}
            color={gameDoc.status === 'waiting' ? '#546e7a' : null}
            isAlive={isAlive}
            size={30}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', color: '#ff5252', lineHeight: 1.1 }}>
              ALL OF US WILL DIE
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              {activeParty ? `ตี้: ${activeParty.room || activeParty.scriptTitle || 'Special Event'}` : 'SPECIAL EVENT'}
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
            onClick={() => showPage(activeParty ? 'order' : 'home')}
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
            if (myRole === 'impostor' && gameDoc.status === 'playing' && isAlive) {
              setShowSabotageModal(true)
            }
          }}
          style={{
            background: '#0d131d',
            border: '2.5px solid #233147',
            borderRadius: 14,
            padding: '8px 12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            cursor: (myRole === 'impostor' && gameDoc.status === 'playing' && isAlive) ? 'pointer' : 'default',
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

      {/* ─── ACTIVE SABOTAGE BANNER ─── */}
      {gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active' && (
        <div style={{
          background: 'linear-gradient(90deg, #b71c1c 0%, #d32f2f 50%, #b71c1c 100%)',
          color: '#fff',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2.5px solid #ff5252',
          animation: 'auAlarmBlink 1.2s infinite',
          marginTop: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: 18, color: '#ffebee' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 900 }}>
                {gameDoc.sabotage.title}
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

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <main style={{ flex: 1, padding: '14px 16px 80px', maxWidth: 640, width: '100%', margin: '0 auto' }}>

        {/* ── SELECT / IDENTIFY PLAYER MODAL (If player not bound yet) ── */}
        {(!myUid || !me) && !isAdminView && (
          <div className="au-card" style={{
            padding: 22,
            marginBottom: 20,
            textAlign: 'center',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <AmongUsVisor role="crewmate" isAlive={true} size={50} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
              เลือกตัวละครของคุณ
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
              แตะชื่อของคุณจากสมาชิกตี้ Special Event เพื่อเข้าสู่ยาน
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(activeParty?.members || []).map((m, idx) => {
                const colors = ['#0288d1', '#c51111', '#2e7d32', '#fbc02d', '#8e24aa', '#ff9800', '#009688', '#e91e63']
                const assignedColor = colors[idx % colors.length]
                return (
                  <button
                    key={m.uid}
                    type="button"
                    onClick={() => {
                      setMyUid(m.uid)
                      localStorage.setItem('allofus_player_uid', m.uid)
                      showToast(`ยินดีต้อนรับ ${m.name}`)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.03)',
                      border: '2px solid #1f2c42',
                      color: '#fff', cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <AmongUsVisor size={36} color={assignedColor} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>สมาชิกตี้ Special Event</div>
                    </div>
                    <i className="fas fa-chevron-right" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }} />
                  </button>
                )
              })}

              {(!activeParty?.members || activeParty.members.length === 0) && (
                <div style={{ padding: '16px 0', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                  ไม่พบสมาชิกในตี้ Special Event กรุณาให้แอดมินเพิ่มสมาชิกที่ POS หรือพิมพ์ชื่อของคุณด้านล่าง
                </div>
              )}
            </div>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
                หรือพิมพ์ชื่อเพื่อเข้าร่วมยานโดยตรง
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อของคุณ..."
                  value={directJoinName}
                  onChange={e => setDirectJoinName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleDirectJoin() }}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10,
                    background: '#0d131d', color: '#fff',
                    border: '2px solid #233147', fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={handleDirectJoin}
                  className="au-btn au-btn-red"
                  style={{ padding: '10px 18px', fontSize: 13 }}
                >
                  เข้าร่วม
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── ADMIN / GAME MASTER CONTROL PANEL ─────────────────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {isAdminView && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
                    <button
                      type="button"
                      onClick={() => callEmergencyMeeting(false)}
                      className="au-btn au-btn-red"
                      style={{ flex: 1, padding: '11px', fontSize: 12.5 }}
                    >
                      <i className="fas fa-bullhorn" style={{ marginRight: 6 }} /> เรียกประชุมด่วน
                    </button>
                    <button
                      type="button"
                      onClick={handleResetGame}
                      className="au-btn au-btn-dark"
                      style={{ padding: '11px 14px', fontSize: 12.5 }}
                    >
                      รีเซ็ตเกม
                    </button>
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

            {/* Admin Player List & Role Inspector */}
            <div className="au-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                    รายชื่อผู้เล่น ({allPlayersList.length} คน)
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    ความคืบหน้าภารกิจรวม: {progressPercent}% ({completedTasksCount}/{totalTasksCount})
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={handleSyncFromPos}
                    className="au-btn au-btn-dark"
                    style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
                    title="ซิงค์รายชื่อจากปาร์ตี้ POS ปัจจุบัน"
                  >
                    <i className="fas fa-sync-alt" />
                    <span>ซิงค์จาก POS</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllPlayers}
                    className="au-btn au-btn-dark"
                    style={{ padding: '6px 10px', fontSize: 11, color: '#ff5252', display: 'flex', alignItems: 'center', gap: 5 }}
                    title="ล้างรายชื่อผู้เล่นทั้งหมดในห้อง"
                  >
                    <i className="fas fa-trash-alt" />
                    <span>ล้างทั้งหมด</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {allPlayersList.map(p => {
                  const roleColor = p.role === 'impostor' ? '#e53935' : (p.role === 'dodo' ? '#ab47bc' : '#29b6f6')
                  const roleLabel = p.role === 'impostor' ? 'คนร้าย' : (p.role === 'dodo' ? 'โดโด้' : 'คนดี')
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <AmongUsVisor role={p.role} isAlive={p.isAlive} size={32} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                              {p.name} {!p.isAlive && <span style={{ color: '#9e9e9e', fontSize: 10 }}>(ตาย)</span>}
                            </div>
                            <div style={{ fontSize: 11, color: roleColor, fontWeight: 800 }}>
                              {roleLabel}
                            </div>
                          </div>
                        </div>

                        {/* Admin Role Changer Dropdown */}
                        <div style={{ display: 'flex', gap: 4 }}>
                          {['crewmate', 'impostor', 'dodo'].map(r => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                                [`players.${p.uid}.role`]: r
                              })}
                              style={{
                                padding: '3px 8px', borderRadius: 6,
                                background: p.role === r ? roleColor : 'rgba(255,255,255,0.06)',
                                color: '#fff', border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                              }}
                            >
                              {r === 'impostor' ? 'ร้าย' : (r === 'dodo' ? 'โดโด้' : 'ดี')}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                              [`players.${p.uid}.isAlive`]: !p.isAlive
                            })}
                            style={{
                              padding: '3px 8px', borderRadius: 6,
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

            {/* Task Pool Management */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 16,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                    คลังภารกิจทั้งหมด ({gameDoc.taskPool?.length || 0} ภารกิจ)
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    กำหนดชื่อ รายละเอียด ชั้น 1-5 และห้อง เพื่อให้คนดีไปทำภารกิจในสถานที่จริง
                  </div>
                </div>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                        width: '100%', padding: '7px 10px', borderRadius: 8,
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
                        width: '100%', padding: '7px 10px', borderRadius: 8,
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '1px 6px', borderRadius: 4,
                            background: 'rgba(33, 150, 243, 0.15)',
                            color: '#64b5f6', fontSize: 10, fontWeight: 800,
                          }}>
                            <i className="fas fa-map-marker-alt" style={{ fontSize: 8 }} />
                            ชั้น {t.floor || 1} · {t.room || 'โซนหน้า'}
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

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── PLAYER VIEW: LOBBY (WAITING STATE) ─────────────────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {!isAdminView && gameDoc.status === 'waiting' && me && (() => {
          const hasSelectedRole = Boolean(me.ready && me.role)
          const isWaitingScreen = hasSelectedRole && !showRolePicker

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Player Identity Card */}
              <div className="au-card" style={{
                padding: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <AmongUsVisor color="#546e7a" isAlive={isAlive} size={48} />
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
                        <button
                          type="button"
                          onClick={saveMyName}
                          className="au-btn au-btn-red"
                          style={{ padding: '6px 12px', fontSize: 11 }}
                        >บันทึก</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>{me.name}</span>
                        <button
                          type="button"
                          onClick={() => { setNameInput(me.name); setEditingName(true) }}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 2 }}
                          title="แก้ไขชื่อ"
                        >
                          <i className="fas fa-pencil-alt" style={{ fontSize: 12 }} />
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                      สมาชิกตี้ Special Event · {hasSelectedRole ? 'บันทึกบทบาทลับแล้ว' : 'ยังไม่เลือกบทบาท'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('allofus_player_uid')
                    setMyUid('')
                  }}
                  className="au-btn au-btn-dark"
                  style={{ padding: '6px 10px', fontSize: 11 }}
                >
                  สลับชื่อ
                </button>
              </div>

              {isWaitingScreen ? (
                /* Private Waiting Screen (Anti-peeking mode) */
                <div className="au-card" style={{ padding: '26px 20px', textAlign: 'center' }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'rgba(41, 182, 246, 0.12)',
                    border: '2px solid rgba(41, 182, 246, 0.3)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                  }}>
                    <i className="fas fa-shield-alt" style={{ fontSize: 28, color: '#29b6f6' }} />
                  </div>

                  <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
                    บันทึกบทบาทเรียบร้อยแล้ว
                  </div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
                    ระบบได้บันทึกข้อมูลบทบาทของคุณเรียบร้อยแล้ว กรุณารอแอดมินเริ่มเกมเพื่อเปิดเผยภารกิจ
                  </div>

                  {/* Anti-Peeking Alert */}
                  <div style={{
                    background: 'rgba(255, 193, 7, 0.08)',
                    border: '1px solid rgba(255, 193, 7, 0.25)',
                    borderRadius: 14,
                    padding: '12px 16px',
                    margin: '20px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: 'rgba(255, 193, 7, 0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <i className="fas fa-eye-slash" style={{ color: '#ffc107', fontSize: 16 }} />
                    </div>
                    <div style={{ fontSize: 12, color: '#ffecb3', lineHeight: 1.5 }}>
                      <strong>คำแนะนำ:</strong> คว่ำหน้าจอโทรศัพท์ลงเพื่อไม่ให้เพื่อนร่วมตี้แอบมองเห็นบทบาทของคุณ
                    </div>
                  </div>

                  {/* Waiting Indicator */}
                  <div style={{
                    padding: '14px 18px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 20,
                  }}>
                    <i className="fas fa-spinner fa-spin" style={{ color: '#ff5252' }} />
                    กำลังรอแอดมินเริ่มเกม...
                  </div>

                  {/* Back button to change role */}
                  <button
                    type="button"
                    onClick={() => setShowRolePicker(true)}
                    className="au-btn au-btn-dark"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <i className="fas fa-undo" />
                    ย้อนกลับไปเลือกบทบาทใหม่
                  </button>
                </div>
              ) : (
                /* Role Picker View */
                <div className="au-card" style={{ padding: 18 }}>
                  {hasSelectedRole && (
                    <div style={{ marginBottom: 14 }}>
                      <button
                        type="button"
                        onClick={() => setShowRolePicker(false)}
                        className="au-btn au-btn-dark"
                        style={{ width: '100%', padding: '10px 14px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <i className="fas fa-arrow-left" />
                        กลับไปหน้ารอเริ่มเกม (ไม่เปลี่ยนบทบาท)
                      </button>
                    </div>
                  )}

                  <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                    เลือกบทบาทที่คุณได้รับในชีวิตจริง
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>
                    เลือกบทบาทที่สุ่มได้จากการจับฉลาก เพื่อให้ระบบแสดงปุ่มและความสามารถที่ถูกต้อง
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Crewmate */}
                    <button
                      type="button"
                      onClick={() => setMyRole('crewmate')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 14,
                        background: myRole === 'crewmate' && hasSelectedRole ? 'rgba(2, 136, 209, 0.18)' : 'rgba(255,255,255,0.03)',
                        border: `2.5px solid ${myRole === 'crewmate' && hasSelectedRole ? '#0288d1' : '#1f2c42'}`,
                        color: '#fff', cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <AmongUsVisor role="crewmate" size={40} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 900, color: '#fff' }}>ฝ่ายคนดี (Crewmate)</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>ทำภารกิจส่วนตัวให้ครบ 100% หรือจับคนร้าย</div>
                      </div>
                      {myRole === 'crewmate' && hasSelectedRole && <i className="fas fa-check-circle" style={{ color: '#29b6f6', fontSize: 18 }} />}
                    </button>

                    {/* Impostor */}
                    <button
                      type="button"
                      onClick={() => setMyRole('impostor')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 14,
                        background: myRole === 'impostor' && hasSelectedRole ? 'rgba(197, 17, 17, 0.2)' : 'rgba(255,255,255,0.03)',
                        border: `2.5px solid ${myRole === 'impostor' && hasSelectedRole ? '#c51111' : '#1f2c42'}`,
                        color: '#fff', cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <AmongUsVisor role="impostor" size={40} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 900, color: '#fff' }}>คนร้าย (Impostor)</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>เนียนทำภารกิจ และแอบกด Sabotage ป่วนระบบ</div>
                      </div>
                      {myRole === 'impostor' && hasSelectedRole && <i className="fas fa-check-circle" style={{ color: '#e53935', fontSize: 18 }} />}
                    </button>

                    {/* Dodo */}
                    <button
                      type="button"
                      onClick={() => setMyRole('dodo')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 14,
                        background: myRole === 'dodo' && hasSelectedRole ? 'rgba(142, 36, 170, 0.2)' : 'rgba(255,255,255,0.03)',
                        border: `2.5px solid ${myRole === 'dodo' && hasSelectedRole ? '#8e24aa' : '#1f2c42'}`,
                        color: '#fff', cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <AmongUsVisor role="dodo" size={40} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 900, color: '#fff' }}>โดโด้ (Dodo / Jester)</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>ทำตัวให้สงสัยเพื่อให้ที่ประชุมโหวตคุณออก ชนะทันที!</div>
                      </div>
                      {myRole === 'dodo' && hasSelectedRole && <i className="fas fa-check-circle" style={{ color: '#ce93d8', fontSize: 18 }} />}
                    </button>
                  </div>

                  <div style={{
                    textAlign: 'center', padding: '14px 0 4px',
                    color: 'rgba(255,255,255,0.45)', fontSize: 12,
                  }}>
                    <i className="fas fa-lock" style={{ marginRight: 6 }} />
                    ระบบจะสลับเข้าสู่หน้าจอปิดบังข้อมูลทันทีที่เลือก
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

            {/* Futuristic Spaceship Monitor & Big Red Emergency Dome Button */}
            <div className="au-card" style={{
              padding: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 800, letterSpacing: '0.06em' }}>
                  GAME TIME REMAINING
                </div>
                <div style={{
                  fontSize: 32, fontWeight: 900, color: '#ff5252',
                  fontFamily: 'monospace', letterSpacing: '0.04em', lineHeight: 1.1, marginTop: 4,
                  textShadow: '0 0 10px rgba(255, 82, 82, 0.4)',
                }}>
                  {fmtTime(currentTimeSec)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <AmongUsVisor role={myRole || 'crewmate'} isAlive={isAlive} size={22} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: myRole === 'impostor' ? '#ff5252' : (myRole === 'dodo' ? '#ce93d8' : '#80d8ff') }}>
                    {myRole === 'impostor' ? 'คนร้าย' : (myRole === 'dodo' ? 'โดโด้' : 'คนดี')}
                  </span>
                </div>
              </div>

              {/* Action Button: Emergency Dome */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Iconic Big Red Emergency Dome Button */}
                {isAlive && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('ยืนยัน REPORT ศพหรือกดปุ่มเรียกประชุมฉุกเฉิน?')) {
                        callEmergencyMeeting(true)
                      }
                    }}
                    style={{
                      width: 76, height: 76,
                      borderRadius: '50%',
                      background: 'repeating-linear-gradient(45deg, #181818, #181818 7px, #fbc02d 7px, #fbc02d 14px)',
                      padding: 5,
                      border: '3px solid #080d16',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    title="Emergency Meeting / Report"
                  >
                    <div style={{
                      width: '100%', height: '100%',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle at 40% 30%, #ff5252 0%, #c62828 60%, #7a0813 100%)',
                      border: '2px solid rgba(255,255,255,0.4)',
                      boxShadow: 'inset 0 3px 6px rgba(255,255,255,0.6), 0 3px 6px rgba(0,0,0,0.6)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                      color: '#fff',
                      animation: 'auEmergencyPulse 2s infinite ease-in-out',
                    }}>
                      <i className="fas fa-bullhorn" style={{ fontSize: 20 }} />
                      <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.04em' }}>REPORT</span>
                    </div>
                  </button>
                )}
              </div>
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
        {(gameDoc.status === 'meeting_called' ||
          gameDoc.status === 'meeting_discussion' ||
          gameDoc.status === 'meeting_voting' ||
          gameDoc.status === 'meeting_result') && (
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
                    <i className="fas fa-bullhorn" />
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#ff5252', letterSpacing: '0.08em', textShadow: '0 0 15px rgba(255, 82, 82, 0.6)' }}>
                    EMERGENCY MEETING
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                    <AmongUsVisor size={38} />
                    <span style={{ fontSize: 17, color: '#fff', fontWeight: 800 }}>
                      {gameDoc.meeting?.calledBy?.name} กดเรียกประชุมฉุกเฉิน!
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 8, maxWidth: 360 }}>
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
                </div>
              )}

              {/* Meeting Phase 2 & 3: Discussion & Skeld Voting Table */}
              {(gameDoc.status === 'meeting_discussion' || gameDoc.status === 'meeting_voting') && (
                <div className="au-card" style={{ padding: 18, border: '3.5px solid #28374d', borderRadius: 22 }}>
                  {/* Tablet Header */}
                  <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '0.08em', color: '#fff' }}>
                      WHO IS AN IMPOSTOR?
                    </div>
                    <div style={{
                      display: 'inline-block',
                      marginTop: 4,
                      padding: '2px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 900,
                      background: gameDoc.status === 'meeting_voting' ? 'rgba(229, 57, 53, 0.2)' : 'rgba(251, 192, 45, 0.15)',
                      color: gameDoc.status === 'meeting_voting' ? '#ff5252' : '#fbc02d',
                      border: `1px solid ${gameDoc.status === 'meeting_voting' ? '#ff5252' : '#fbc02d'}`,
                    }}>
                      {gameDoc.status === 'meeting_voting' ? 'ช่วงลงคะแนนโหวต (1 นาทีสุดท้าย)' : 'ช่วงสอบสวนและอภิปราย (ยังไม่เปิดโหวต)'}
                    </div>
                    <div style={{
                      fontSize: 34, fontWeight: 900, color: '#ff5252',
                      fontFamily: 'monospace', letterSpacing: '0.06em', marginTop: 4,
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

                  {/* Skeld Voting Candidates Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 14 }}>
                    {allPlayersList.filter(p => p.isAlive).map(p => {
                      const hasMyVote = gameDoc.meeting?.votes?.[myUid] === p.uid
                      const voteCount = Object.values(gameDoc.meeting?.votes || {}).filter(v => v === p.uid).length
                      const hasVotedAnyone = !!gameDoc.meeting?.votes?.[p.uid]
                      const isSelected = selectedVoteTarget === p.uid

                      return (
                        <div
                          key={p.uid}
                          onClick={() => {
                            if (gameDoc.status === 'meeting_voting' && isAlive && !gameDoc.meeting?.votes?.[myUid]) {
                              setSelectedVoteTarget(isSelected ? null : p.uid)
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 12px', borderRadius: 12,
                            background: hasMyVote ? 'rgba(229, 57, 53, 0.25)' : (isSelected ? '#1c283c' : '#0d131d'),
                            border: `2.5px solid ${hasMyVote ? '#ff5252' : (isSelected ? '#0288d1' : '#1f2c42')}`,
                            color: '#fff',
                            cursor: (gameDoc.status === 'meeting_voting' && isAlive && !gameDoc.meeting?.votes?.[myUid]) ? 'pointer' : 'default',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <AmongUsVisor role={p.role} isAlive={p.isAlive} size={34} />
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>
                                {p.name} {p.uid === myUid && <span style={{ fontSize: 10.5, color: '#80d8ff' }}>(คุณ)</span>}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {/* Live Vote Count Badge */}
                            {voteCount > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 900, color: '#ff5252', background: 'rgba(229,57,53,0.18)', padding: '2px 7px', borderRadius: 8, border: '1px solid #ff5252' }}>
                                {voteCount}
                              </span>
                            )}

                            {/* Red VOTED stamp if this player has cast their vote */}
                            {hasVotedAnyone && (
                              <span style={{
                                fontSize: 9, fontWeight: 900, color: '#fff',
                                background: '#c51111', padding: '2px 5px', borderRadius: 4,
                                border: '1px solid #ff5252', letterSpacing: '0.04em',
                              }}>
                                VOTED
                              </span>
                            )}

                            {/* Vote Confirmation Checkmark Button (Authentic Among Us Mechanic) */}
                            {isSelected && gameDoc.status === 'meeting_voting' && isAlive && !gameDoc.meeting?.votes?.[myUid] && (
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
                  {gameDoc.status === 'meeting_voting' && isAlive && (
                    <div style={{ marginBottom: 14 }}>
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
                        {Object.values(gameDoc.meeting?.votes || {}).filter(v => v === 'skip').length > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 6 }}>
                            {Object.values(gameDoc.meeting?.votes || {}).filter(v => v === 'skip').length} โหวต
                          </span>
                        )}
                      </button>
                    </div>
                  )}

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
              {gameDoc.status === 'meeting_result' && (
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
                      role={gameDoc.meeting?.result?.eliminatedRole || 'crewmate'}
                      isAlive={true}
                      size={60}
                    />
                  </div>

                  {/* Classic Reveal Text Banner */}
                  {(() => {
                    const res = gameDoc.meeting?.result
                    const victim = res?.eliminatedUid ? gameDoc.players?.[res.eliminatedUid] : null
                    const remainingImpostorsCount = Object.values(gameDoc.players || {}).filter(p => p.role === 'impostor' && p.isAlive).length

                    if (victim) {
                      const wasImpostor = res?.eliminatedRole === 'impostor'
                      return (
                        <div style={{ maxWidth: 420, padding: '0 16px' }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.04em', lineHeight: 1.3, marginBottom: 6 }}>
                            {victim.name} was {wasImpostor ? 'An Impostor.' : 'not An Impostor.'}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#80d8ff', marginBottom: 12 }}>
                            {remainingImpostorsCount} Impostor{remainingImpostorsCount === 1 ? '' : 's'} remain{remainingImpostorsCount === 1 ? 's' : ''}.
                          </div>
                          <div style={{ fontSize: 14, color: wasImpostor ? '#ff5252' : '#a5d6a7', fontWeight: 800 }}>
                            {res?.outcomeText}
                          </div>
                        </div>
                      )
                    } else {
                      return (
                        <div style={{ maxWidth: 420, padding: '0 16px' }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.04em', marginBottom: 8 }}>
                            No one was ejected. ({res?.isTie ? 'Tie' : 'Skipped'})
                          </div>
                          <div style={{ fontSize: 14.5, color: '#ffd54f', fontWeight: 800 }}>
                            {res?.outcomeText || 'ไม่มีใครถูกขับออกจากยาน'}
                          </div>
                        </div>
                      )
                    }
                  })()}

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
              )}

            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── GAME OVER / VICTORY SCREEN (AUTHENTIC AMONG US) ─────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {gameDoc.status === 'ended' && (
          <div className="au-card" style={{
            padding: 26,
            textAlign: 'center', marginTop: 10,
            border: `3px solid ${gameDoc.winner === 'dodo' ? '#8e24aa' : (gameDoc.winner === 'crewmate' ? '#0288d1' : '#c51111')}`,
          }}>
            <div style={{ marginBottom: 16 }}>
              <AmongUsVisor
                role={gameDoc.winner || 'crewmate'}
                size={70}
              />
            </div>

            <div style={{
              fontSize: 26, fontWeight: 900,
              color: gameDoc.winner === 'dodo' ? '#ce93d8' : (gameDoc.winner === 'crewmate' ? '#80d8ff' : '#ff5252'),
              letterSpacing: '0.06em',
              textShadow: '0 0 12px rgba(255,255,255,0.3)',
            }}>
              {gameDoc.winner === 'dodo' ? 'VICTORY - โดโด้ชนะ!' : (gameDoc.winner === 'crewmate' ? 'VICTORY - ฝ่ายคนดีชนะ!' : 'VICTORY - ฝ่ายคนร้ายชนะ!')}
            </div>

            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.75)', marginTop: 6, marginBottom: 20 }}>
              {gameDoc.winReason}
            </div>

            {/* Reveal All Roles */}
            <div style={{
              background: '#0d131d', borderRadius: 16, padding: 16,
              border: '2px solid #1f2c42',
              textAlign: 'left', marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#fbc02d', marginBottom: 10, letterSpacing: '0.06em' }}>
                <i className="fas fa-id-card" style={{ marginRight: 6 }} />
                เฉลยบทบาทผู้เล่นทุกคน
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allPlayersList.map(p => {
                  const roleColor = p.role === 'impostor' ? '#ff5252' : (p.role === 'dodo' ? '#ce93d8' : '#80d8ff')
                  const roleLabel = p.role === 'impostor' ? 'คนร้าย (Impostor)' : (p.role === 'dodo' ? 'โดโด้ (Dodo)' : 'คนดี (Crewmate)')
                  return (
                    <div key={p.uid} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 10px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AmongUsVisor role={p.role} isAlive={p.isAlive} size={26} />
                        <span style={{ fontWeight: 800, color: '#fff', fontSize: 13 }}>{p.name}</span>
                      </div>
                      <span style={{ fontWeight: 900, color: roleColor, fontSize: 12 }}>{roleLabel}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {hasAdminPerm && (
              <button
                type="button"
                onClick={handleResetGame}
                className="au-btn au-btn-red"
                style={{ width: '100%', padding: '13px', fontSize: 14 }}
              >
                เริ่มเกมรอบใหม่ (กลับสู่ล็อบบี้)
              </button>
            )}
          </div>
        )}

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
              คำขอจะถูกส่งให้แอดมินตรวจสอบ เมื่อแอดมินอนุมัติ สัญญาณเตือนจะดังขึ้นบนโทรศัพท์ของทุกคน
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 300, overflowY: 'auto' }}>
              {(gameDoc.sabotagePool || DEFAULT_SABOTAGE_POOL).map(s => (
                <button
                  key={s.id || s.title}
                  type="button"
                  onClick={() => requestSabotage(s.title, s.desc, s.countdownSeconds)}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                      width: '100%', padding: '7px 10px', borderRadius: 8,
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
                      width: '100%', padding: '7px 10px', borderRadius: 8,
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
