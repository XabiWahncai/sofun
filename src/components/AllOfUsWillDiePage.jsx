import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  doc, onSnapshot, setDoc, updateDoc, getDoc,
  collection, query, where, getDocs, serverTimestamp,
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

// ── Default Tasks Pool for Real Life Boardgame Cafe ───
const DEFAULT_TASKS_POOL = [
  { id: 't1', title: 'จัดเรียงแก้วน้ำ 5 ใบ', desc: 'ไปจัดเรียงแก้วน้ำที่จุดบริการน้ำดื่มให้เป็นระเบียบเรียบร้อย' },
  { id: 't2', title: 'ถ่ายรูปคู่กับ DM 1 รูป', desc: 'เดินไปหา DM ประจำห้อง Europe แล้วขอถ่ายรูปคู่เป็นหลักฐาน' },
  { id: 't3', title: 'นับจำนวนเก้าอี้ในห้อง', desc: 'นับจำนวนเก้าอี้ทั้งหมดในห้องแล้วไปตอบตัวเลขกับแอดมิน' },
  { id: 't4', title: 'หากล่องเกมสีแดง 3 กล่อง', desc: 'เดินหาบอร์ดเกมที่มีหน้ากล่องสีแดง 3 กล่องบนชั้นวาง' },
  { id: 't5', title: 'ทิ้งขยะลงถังให้เรียบร้อย', desc: 'ตรวจสอบความสะอาดรอบโต๊ะและนำเศษขยะไปทิ้งที่ถังขยะ' },
  { id: 't6', title: 'เติมน้ำเปล่าใส่แก้ว 1 แก้ว', desc: 'เดินไปกดน้ำดื่มใส่แก้วของตัวเองให้เต็ม' },
  { id: 't7', title: 'หาลูกเต๋า 20 หน้า (D20)', desc: 'หาลูกเต๋า 20 หน้าจากกล่องอุปกรณ์แล้วนำมาแสดงให้แอดมินดู' },
  { id: 't8', title: 'โพสต์ท่าปริศนาให้เพื่อนทาย', desc: 'ทำท่าทางบอร์ดเกม 1 ท่าให้เพื่อนในตี้ทายถูก 1 คน' },
  { id: 't9', title: 'เช็ดทำความสะอาดโต๊ะเล่นเกม', desc: 'ใช้ทิชชู่หรือผ้าสะอาดเช็ดโต๊ะบอร์ดเกมบริเวณที่ว่าง' },
  { id: 't10', title: 'จัดเรียงการ์ดเกมให้ตรงหมวด', desc: 'จัดเรียงการ์ดในกล่องเกมที่เปิดอยู่ให้หันหน้าไปทางเดียวกัน' },
]

export default function AllOfUsWillDiePage({ lineUser, firebaseUser, isAdmin: isAppAdmin, showToast, showPage }) {
  const [activeParty, setActiveParty] = useState(null)
  const [gameDoc, setGameDoc] = useState(null)
  const [myUid, setMyUid] = useState(() => {
    return localStorage.getItem('allofus_player_uid') || lineUser?.uid || lineUser?.userId || lineUser?.id || ''
  })
  const [myName, setMyName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [isAdminView, setIsAdminView] = useState(false)
  const [activeTaskModal, setActiveTaskModal] = useState(null)
  const [showSabotageModal, setShowSabotageModal] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [meetingTimeSec, setMeetingTimeSec] = useState(0)
  const [sabotageTimeSec, setSabotageTimeSec] = useState(0)

  // Determine effective admin permission
  const hasAdminPerm = isAppAdmin || lineUser?.role === 'admin' || !!firebaseUser
  const qrScannerRef = useRef(null)

  // ── 1. Find Special Event Active Party / Order ───────────
  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'active'))
    const unsub = onSnapshot(q, snap => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const specialEvent = orders.find(o => {
        const title = (o.scriptTitle || '').toLowerCase()
        const room = (o.room || '').toLowerCase()
        return title.includes('special event') || room.includes('special')
      })
      if (specialEvent) {
        setActiveParty(specialEvent)
      } else {
        // Fallback: check all active orders, take the newest active order
        const fallback = orders[0] || null
        setActiveParty(fallback)
      }
    }, err => console.warn('Special event party query error:', err))
    return unsub
  }, [])

  // ── 2. Listen to Game State Document in Realtime ─────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'all_of_us_games', 'active_game'), snap => {
      if (snap.exists()) {
        const data = snap.data()
        setGameDoc(data)
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

  // Admin starts the game: randomly distributes 3 tasks per player
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

    const durationMins = gameDoc.gameDurationMinutes || 20
    const durationSecs = durationMins * 60

    // Randomize 3 tasks for each player
    const updatedPlayers = { ...gameDoc.players }
    allPlayersList.forEach(p => {
      const shuffled = [...pool].sort(() => 0.5 - Math.random())
      const assigned = shuffled.slice(0, 3).map((t, idx) => ({
        id: `${p.uid}_t${idx + 1}_${Date.now()}`,
        poolTaskId: t.id,
        title: t.title,
        desc: t.desc,
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
  const requestSabotage = async (title, desc) => {
    try {
      await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
        sabotage: {
          active: true,
          id: `sab_${Date.now()}`,
          title,
          desc,
          requestedBy: myUid,
          status: 'pending_approval',
          countdownSeconds: 90,
          startedAt: 0,
        }
      })
      setShowSabotageModal(false)
      showToast('ส่งคำขอ Sabotage ถึงแอดมินแล้ว')
    } catch (e) {
      showToast('ส่ง Sabotage ล้มเหลว', 'error')
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
            'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: false },
          })
        } else if (remainingImpostors.length >= remainingCrew.length) {
          // Impostors win!
          await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'ended',
            players: updatedPlayers,
            winner: 'impostor',
            winReason: 'จำนวนคนร้ายเท่ากับคนดีแล้ว! ฝ่ายคนร้ายชนะ!',
            'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: false },
          })
        } else {
          // Move to meeting result screen
          await updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
            status: 'meeting_result',
            players: updatedPlayers,
            'meeting.result': { eliminatedUid, eliminatedRole, outcomeText, dodoWon: false },
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

  // ── Add task to pool ────────────────────────────────────
  const handleAddTaskToPool = async () => {
    if (!newTaskTitle.trim()) return
    const pool = gameDoc?.taskPool || DEFAULT_TASKS_POOL
    const item = {
      id: `t_${Date.now()}`,
      title: newTaskTitle.trim(),
      desc: newTaskDesc.trim() || 'ทำภารกิจให้สำเร็จและให้แอดมินสแกนยืนยัน'
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

  // Delete task from pool
  const handleDeleteTaskFromPool = async (taskId) => {
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

  if (!gameDoc) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0d14', color: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Sarabun', sans-serif"
      }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: 32, color: '#e53935', marginBottom: 16 }} />
        <div style={{ fontSize: 16, fontWeight: 700 }}>กำลังเชื่อมต่อฐานข้อมูล ALL OF US WILL DIE...</div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#090b10',
      color: '#e0e6ed',
      fontFamily: "'Sarabun', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflowX: 'hidden'
    }}>

      {/* ─── GLOBAL HEADER BAR ─── */}
      <header style={{
        background: 'rgba(15, 20, 31, 0.95)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #c62828 0%, #d32f2f 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 900,
            boxShadow: '0 2px 8px rgba(198, 40, 40, 0.4)'
          }}>
            <i className="fas fa-biohazard" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.06em', color: '#ff5252', lineHeight: 1.1 }}>
              ALL OF US WILL DIE
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {activeParty ? `ตี้: ${activeParty.room || activeParty.scriptTitle || 'Special Event'}` : 'SPECIAL EVENT'}
            </div>
          </div>
        </div>

        {/* Right Action: Admin Toggle & Secret Impostor Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Secret Impostor Sabotage Icon Button (Clean and natural) */}
          {myRole === 'impostor' && gameDoc.status === 'playing' && isAlive && (
            <button
              type="button"
              onClick={() => setShowSabotageModal(true)}
              title="Sabotage"
              style={{
                width: 34, height: 34, borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <i className="fas fa-satellite-dish" style={{ fontSize: 13 }} />
            </button>
          )}

          {/* Admin Switcher */}
          {hasAdminPerm && (
            <button
              type="button"
              onClick={() => setIsAdminView(v => !v)}
              style={{
                padding: '5px 10px', borderRadius: 8,
                background: isAdminView ? '#c62828' : 'rgba(255,255,255,0.06)',
                color: '#fff',
                border: `1px solid ${isAdminView ? '#c62828' : 'rgba(255,255,255,0.12)'}`,
                fontSize: 11, fontWeight: 800,
                display: 'flex', alignItems: 'center', gap: 5,
                cursor: 'pointer',
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
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="กลับหน้าหลัก"
          >
            <i className="fas fa-times" style={{ fontSize: 12 }} />
          </button>
        </div>
      </header>

      {/* ─── ACTIVE SABOTAGE BANNER ─── */}
      {gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active' && (
        <div style={{
          background: 'linear-gradient(90deg, #b71c1c 0%, #d32f2f 50%, #b71c1c 100%)',
          color: '#fff',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid #ff5252',
          animation: 'pulse 1.5s infinite',
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
            background: 'rgba(0,0,0,0.4)',
            padding: '3px 8px', borderRadius: 6,
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
          <div style={{
            background: '#121722',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 20,
            textAlign: 'center',
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px', color: '#ff5252', fontSize: 22,
            }}>
              <i className="fas fa-user-astronaut" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
              เลือกชื่อของคุณจากสมาชิกตี้ Special Event
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
              ไม่ต้องล็อกอิน แตะชื่อของคุณเพื่อเข้าสู่ระบบเกมมือถือ
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(activeParty?.members || []).map(m => (
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
                    padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {m.avatar ? (
                    <img src={m.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#37474f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>
                      <i className="fas fa-user" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>สมาชิกตี้ Special Event</div>
                  </div>
                  <i className="fas fa-chevron-right" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }} />
                </button>
              ))}

              {(!activeParty?.members || activeParty.members.length === 0) && (
                <div style={{ padding: '16px 0', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                  ไม่พบสมาชิกในตี้ Special Event กรุณาให้แอดมินเพิ่มสมาชิกที่ POS
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── ADMIN / GAME MASTER CONTROL PANEL ─────────────────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {isAdminView && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Admin Header Card */}
            <div style={{
              background: '#121722',
              borderRadius: 16,
              padding: 16,
              border: '1px solid rgba(255, 213, 79, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 11, color: '#ffd54f', fontWeight: 800, letterSpacing: '0.05em' }}>
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
                style={{
                  padding: '9px 14px', borderRadius: 10,
                  background: '#c62828', color: '#fff',
                  border: 'none', fontSize: 12.5, fontWeight: 800,
                  display: 'flex', alignItems: 'center', gap: 6,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(198, 40, 40, 0.4)',
                }}
              >
                <i className="fas fa-qrcode" />
                <span>สแกนตรวจภารกิจ</span>
              </button>
            </div>

            {/* Admin Quick Game Controls */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 16,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
                การควบคุมเวลาและสถานะเกม
              </div>

              {gameDoc.status === 'waiting' ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>ตั้งเวลาเล่นเกม:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameDurationMinutes: Math.max(5, (gameDoc.gameDurationMinutes || 20) - 5),
                          gameSecondsRemaining: Math.max(5, (gameDoc.gameDurationMinutes || 20) - 5) * 60,
                        })}
                        style={{ width: 32, height: 32, borderRadius: 8, background: '#1c2230', color: '#fff', border: 'none', fontWeight: 800 }}
                      >-5</button>
                      <span style={{ fontSize: 16, fontWeight: 900, color: '#ff5252' }}>
                        {gameDoc.gameDurationMinutes || 20} นาที
                      </span>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameDurationMinutes: (gameDoc.gameDurationMinutes || 20) + 5,
                          gameSecondsRemaining: ((gameDoc.gameDurationMinutes || 20) + 5) * 60,
                        })}
                        style={{ width: 32, height: 32, borderRadius: 8, background: '#1c2230', color: '#fff', border: 'none', fontWeight: 800 }}
                      >+5</button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartGame}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 12,
                      background: 'linear-gradient(135deg, #c62828 0%, #e53935 100%)',
                      color: '#fff', fontSize: 14, fontWeight: 900,
                      border: 'none', cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(198, 40, 40, 0.4)',
                    }}
                  >
                    <i className="fas fa-play" style={{ marginRight: 8 }} />
                    เริ่มเกม (สุ่มแจกคนละ 3 ภารกิจและเริ่มนับเวลา)
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#ff5252', fontFamily: 'monospace' }}>
                      {fmtTime(currentTimeSec)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameSecondsRemaining: currentTimeSec + 60,
                          timerUpdatedAt: Date.now(),
                        })}
                        style={{ padding: '6px 10px', borderRadius: 8, background: '#1c2230', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700 }}
                      >+1 นาที</button>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameSecondsRemaining: Math.max(0, currentTimeSec - 60),
                          timerUpdatedAt: Date.now(),
                        })}
                        style={{ padding: '6px 10px', borderRadius: 8, background: '#1c2230', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700 }}
                      >-1 นาที</button>
                      <button
                        type="button"
                        onClick={() => updateDoc(doc(db, 'all_of_us_games', 'active_game'), {
                          gameTimerRunning: !gameDoc.gameTimerRunning,
                          timerUpdatedAt: Date.now(),
                        })}
                        style={{ padding: '6px 12px', borderRadius: 8, background: gameDoc.gameTimerRunning ? '#ff9800' : '#4caf50', color: '#fff', border: 'none', fontSize: 11, fontWeight: 800 }}
                      >
                        {gameDoc.gameTimerRunning ? 'หยุดเวลาชั่วคราว' : 'เดินเวลาต่อ'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => callEmergencyMeeting(false)}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 10,
                        background: '#e53935', color: '#fff',
                        border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                      }}
                    >
                      <i className="fas fa-bullhorn" style={{ marginRight: 6 }} /> เรียกประชุมด่วน
                    </button>
                    <button
                      type="button"
                      onClick={handleResetGame}
                      style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
                        border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      รีเซ็ตเกม
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Admin Sabotage Pending Approval Alert */}
            {gameDoc.sabotage?.active && gameDoc.sabotage.status === 'pending_approval' && (
              <div style={{
                background: '#211216', border: '1px solid #c62828',
                borderRadius: 16, padding: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ff5252', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                  <i className="fas fa-radiation fa-spin" /> มีคำขอ Sabotage จากคนร้าย!
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{gameDoc.sabotage.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{gameDoc.sabotage.desc}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={approveSabotage}
                    style={{
                      flex: 1, padding: '9px', borderRadius: 8,
                      background: '#c62828', color: '#fff',
                      border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    }}
                  >
                    อนุมัติ Sabotage
                  </button>
                  <button
                    type="button"
                    onClick={resolveSabotage}
                    style={{
                      padding: '9px 14px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.08)', color: '#fff',
                      border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    ปฏิเสธ / ปิด
                  </button>
                </div>
              </div>
            )}

            {/* Admin Active Sabotage Controls */}
            {gameDoc.sabotage?.active && gameDoc.sabotage.status === 'active' && (
              <div style={{
                background: '#1b1318', border: '1px solid #d32f2f',
                borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#ff5252', fontWeight: 800 }}>SABOTAGE กำลังทำงาน</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{gameDoc.sabotage.title}</div>
                </div>
                <button
                  type="button"
                  onClick={resolveSabotage}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: '#2e7d32', color: '#fff',
                    border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  }}
                >
                  <i className="fas fa-check" style={{ marginRight: 6 }} /> ยืนยันคนดีแก้สำเร็จ (ยกเลิก Sabotage)
                </button>
              </div>
            )}

            {/* Admin Player List & Role Inspector */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 16,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                  รายชื่อผู้เล่น ({allPlayersList.length} คน)
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  ความคืบหน้าภารกิจรวม: {progressPercent}% ({completedTasksCount}/{totalTasksCount})
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
                        padding: 12, borderRadius: 12,
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${p.isAlive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}`,
                        opacity: p.isAlive ? 1 : 0.6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {p.avatar ? (
                            <img src={p.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#37474f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                              <i className="fas fa-user" />
                            </div>
                          )}
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <i className={`fas fa-${t.verified ? 'check-circle' : 'circle'}`} style={{ fontSize: 9, color: t.verified ? '#4caf50' : '#ffa726' }} />
                                <span>{t.title}</span>
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
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 10 }}>
                คลังภารกิจทั้งหมด ({gameDoc.taskPool?.length || 0} ภารกิจ)
              </div>

              {/* Add New Task Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="ชื่อภารกิจใหม่ (เช่น เช็ดโต๊ะ, นับเก้าอี้)"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', fontSize: 12.5, outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="รายละเอียดภารกิจ (ถ้ามี)"
                    value={newTaskDesc}
                    onChange={e => setNewTaskDesc(e.target.value)}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#fff', fontSize: 12, outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddTaskToPool}
                    style={{
                      padding: '8px 14px', borderRadius: 8,
                      background: '#c62828', color: '#fff',
                      border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    }}
                  >
                    เพิ่ม
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {(gameDoc.taskPool || []).map(t => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{t.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTaskFromPool(t.id)}
                      style={{
                        background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                        cursor: 'pointer', padding: 4,
                      }}
                    >
                      <i className="fas fa-trash-alt" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── PLAYER VIEW: LOBBY (WAITING STATE) ─────────────────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {!isAdminView && gameDoc.status === 'waiting' && me && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Player Identity Card */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {me.avatar ? (
                  <img src={me.avatar} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ff5252' }} />
                ) : (
                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#263238', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff' }}>
                    <i className="fas fa-user-astronaut" />
                  </div>
                )}
                <div>
                  {editingName ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <input
                        type="text"
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        placeholder="พิมพ์ชื่อของคุณ"
                        style={{ padding: '4px 8px', borderRadius: 6, background: '#1c2230', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', fontSize: 12 }}
                      />
                      <button
                        type="button"
                        onClick={saveMyName}
                        style={{ padding: '4px 10px', borderRadius: 6, background: '#c62828', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700 }}
                      >บันทึก</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{me.name}</span>
                      <button
                        type="button"
                        onClick={() => { setNameInput(me.name); setEditingName(true) }}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 2 }}
                        title="แก้ไขชื่อ"
                      >
                        <i className="fas fa-pencil-alt" style={{ fontSize: 11 }} />
                      </button>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    สมาชิกตี้ Special Event
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('allofus_player_uid')
                  setMyUid('')
                }}
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                  fontSize: 11, cursor: 'pointer',
                }}
              >
                สลับชื่อ
              </button>
            </div>

            {/* Secret Role Selection (In Real Life) */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 18,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                เลือกบทบาทที่คุณได้รับในชีวิตจริง
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>
                เลือกบทบาทที่สุ่มได้จากการจับฉลาก เพื่อให้ระบบแสดงปุ่มและความสามารถที่ถูกต้อง
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Crewmate */}
                <button
                  type="button"
                  onClick={() => setMyRole('crewmate')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12,
                    background: myRole === 'crewmate' ? 'rgba(41, 182, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${myRole === 'crewmate' ? '#29b6f6' : 'rgba(255,255,255,0.08)'}`,
                    color: '#fff', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: '#0288d1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, color: '#fff',
                  }}>
                    <i className="fas fa-shield-alt" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>ฝ่ายคนดี (Crewmate)</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>ทำภารกิจส่วนตัวให้ครบ 100% หรือจับคนร้าย</div>
                  </div>
                  {myRole === 'crewmate' && <i className="fas fa-check-circle" style={{ color: '#29b6f6', fontSize: 16 }} />}
                </button>

                {/* Impostor */}
                <button
                  type="button"
                  onClick={() => setMyRole('impostor')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12,
                    background: myRole === 'impostor' ? 'rgba(229, 57, 53, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${myRole === 'impostor' ? '#e53935' : 'rgba(255,255,255,0.08)'}`,
                    color: '#fff', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: '#c62828', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, color: '#fff',
                  }}>
                    <i className="fas fa-skull" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>คนร้าย (Impostor)</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>เนียนทำภารกิจ และแอบกด Sabotage ป่วนระบบ</div>
                  </div>
                  {myRole === 'impostor' && <i className="fas fa-check-circle" style={{ color: '#e53935', fontSize: 16 }} />}
                </button>

                {/* Dodo */}
                <button
                  type="button"
                  onClick={() => setMyRole('dodo')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12,
                    background: myRole === 'dodo' ? 'rgba(171, 71, 188, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${myRole === 'dodo' ? '#ab47bc' : 'rgba(255,255,255,0.08)'}`,
                    color: '#fff', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: '#7b1fa2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, color: '#fff',
                  }}>
                    <i className="fas fa-mask" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>โดโด้ (Dodo / Jester)</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>ทำตัวให้สงสัยเพื่อให้ที่ประชุมโหวตคุณออก ชนะทันที!</div>
                  </div>
                  {myRole === 'dodo' && <i className="fas fa-check-circle" style={{ color: '#ab47bc', fontSize: 16 }} />}
                </button>
              </div>
            </div>

            {/* Waiting for admin indicator */}
            <div style={{
              textAlign: 'center', padding: '18px 0',
              color: 'rgba(255,255,255,0.5)', fontSize: 13,
            }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: 8, color: '#ff5252' }} />
              รอแอดมินตรวจสอบรายชื่อและเริ่มเกม...
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ─── PLAYER VIEW: IN-GAME HUD (CREWMATE / IMPOSTOR / DODO) ── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {!isAdminView && gameDoc.status === 'playing' && me && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Ghost Mode Notice */}
            {!isAlive && (
              <div style={{
                background: 'rgba(158, 158, 158, 0.12)',
                border: '1px solid rgba(158, 158, 158, 0.3)',
                borderRadius: 14, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <i className="fas fa-ghost" style={{ fontSize: 20, color: '#b0bec5' }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#eceff1' }}>สถานะ: วิญญาณ (GHOST)</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                    คุณถูกกำจัดแล้ว แต่ยังสามารถทำภารกิจส่วนตัวให้ครบเพื่อช่วยฝ่ายคนดีได้
                  </div>
                </div>
              </div>
            )}

            {/* Status & Timer Card */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 16,
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                  เวลาเล่นเกมคงเหลือ
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 900, color: '#ff5252',
                  fontFamily: 'monospace', letterSpacing: '0.04em', lineHeight: 1.1, marginTop: 2,
                }}>
                  {fmtTime(currentTimeSec)}
                </div>
              </div>

              {/* Emergency Report Body Button */}
              {isAlive && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('ยืนยัน REPORT ศพหรือเรียกประชุมฉุกเฉิน?')) {
                      callEmergencyMeeting(true)
                    }
                  }}
                  style={{
                    padding: '10px 16px', borderRadius: 12,
                    background: 'linear-gradient(135deg, #c62828 0%, #e53935 100%)',
                    color: '#fff', fontSize: 13, fontWeight: 900,
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 4px 12px rgba(198, 40, 40, 0.4)',
                  }}
                >
                  <i className="fas fa-bullhorn" />
                  <span>REPORT ศพ</span>
                </button>
              )}
            </div>

            {/* Total Tasks Progress Bar */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 14,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                  ความคืบหน้าภารกิจรวมทั้งหมด
                </span>
                <span style={{ fontSize: 12, fontWeight: 900, color: '#4caf50' }}>
                  {progressPercent}%
                </span>
              </div>
              <div style={{
                height: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 999,
                overflow: 'hidden', padding: 2,
              }}>
                <div style={{
                  height: '100%', borderRadius: 999,
                  background: 'linear-gradient(90deg, #2e7d32 0%, #4caf50 100%)',
                  width: `${progressPercent}%`,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            {/* My Personal Tasks List (3 Tasks) */}
            <div style={{
              background: '#121722', borderRadius: 16, padding: 16,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                ภารกิจส่วนตัวของคุณ (3 ภารกิจ)
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
                      padding: '12px 14px', borderRadius: 12,
                      background: t.verified ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1.5px solid ${t.verified ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                      color: '#fff', textAlign: 'left', cursor: t.verified ? 'default' : 'pointer',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: t.verified ? '#2e7d32' : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 13, fontWeight: 800,
                    }}>
                      {t.verified ? <i className="fas fa-check" /> : `${idx + 1}`}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13.5, fontWeight: 700,
                        textDecoration: t.verified ? 'line-through' : 'none',
                        color: t.verified ? '#a5d6a7' : '#fff',
                      }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                        {t.desc}
                      </div>
                    </div>
                    <div>
                      {t.verified ? (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#81c784', background: 'rgba(76,175,80,0.15)', padding: '3px 8px', borderRadius: 999 }}>
                          เสร็จแล้ว
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#ffa726', background: 'rgba(255,167,38,0.15)', padding: '3px 8px', borderRadius: 999 }}>
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
        {/* ─── MEETING FULL-SCREEN OVERLAY ─────────────────────────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {(gameDoc.status === 'meeting_called' ||
          gameDoc.status === 'meeting_discussion' ||
          gameDoc.status === 'meeting_voting' ||
          gameDoc.status === 'meeting_result') && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(10, 13, 20, 0.98)',
            backdropFilter: 'blur(16px)',
            display: 'flex', flexDirection: 'column',
            padding: '20px 16px', overflowY: 'auto',
          }}>
            <div style={{ maxWidth: 540, width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>

              {/* Meeting Phase 1: Alarm / Called */}
              {gameDoc.status === 'meeting_called' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div style={{
                    width: 90, height: 90, borderRadius: '50%',
                    background: 'rgba(229, 57, 53, 0.15)',
                    border: '3px solid #e53935',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#ff5252', fontSize: 38, marginBottom: 20,
                  }}>
                    <i className="fas fa-bullhorn fa-shake" />
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#ff5252', letterSpacing: '0.05em' }}>
                    EMERGENCY MEETING
                  </div>
                  <div style={{ fontSize: 15, color: '#fff', fontWeight: 700, marginTop: 8 }}>
                    {gameDoc.meeting?.calledBy?.name} กดเรียกประชุมฉุกเฉิน!
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                    เวลาเกมหลักหยุดเดินชั่วคราว ให้ทุกคนมารวมตัวกันที่ห้อง
                  </div>

                  {hasAdminPerm ? (
                    <button
                      type="button"
                      onClick={startDiscussionPhase}
                      style={{
                        marginTop: 32, padding: '14px 28px', borderRadius: 12,
                        background: '#c62828', color: '#fff', fontSize: 15, fontWeight: 900,
                        border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(198, 40, 40, 0.4)',
                      }}
                    >
                      เริ่มจับเวลาประชุม (3 นาที)
                    </button>
                  ) : (
                    <div style={{ marginTop: 32, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                      <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />
                      รอแอดมินเริ่มการประชุม...
                    </div>
                  )}
                </div>
              )}

              {/* Meeting Phase 2 & 3: Discussion & Voting */}
              {(gameDoc.status === 'meeting_discussion' || gameDoc.status === 'meeting_voting') && (
                <div>
                  {/* Meeting Header */}
                  <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: gameDoc.status === 'meeting_voting' ? '#ff5252' : '#ffd54f', letterSpacing: '0.06em' }}>
                      {gameDoc.status === 'meeting_voting' ? 'ช่วงลงคะแนนโหวต (1 นาทีสุดท้าย)' : 'ช่วงสอบสวนและอภิปราย (ยังไม่เปิดโหวต)'}
                    </div>
                    <div style={{
                      fontSize: 34, fontWeight: 900, color: '#fff',
                      fontFamily: 'monospace', letterSpacing: '0.05em', marginTop: 4,
                    }}>
                      {fmtTime(meetingTimeSec)}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                      {gameDoc.status === 'meeting_voting' ? 'แตะชื่อผู้เล่นที่คุณสงสัย หรือเลือก SKIP' : 'พูดคุยหาเบาะแสก่อนเปิดระบบโหวต'}
                    </div>
                  </div>

                  {/* Fast forward voting trigger for admin */}
                  {hasAdminPerm && gameDoc.status === 'meeting_discussion' && (
                    <button
                      type="button"
                      onClick={openVotingPhaseNow}
                      style={{
                        width: '100%', padding: '10px', borderRadius: 10,
                        background: 'rgba(255, 213, 79, 0.1)', color: '#ffd54f',
                        border: '1px solid rgba(255, 213, 79, 0.3)',
                        fontSize: 12, fontWeight: 800, marginBottom: 14, cursor: 'pointer',
                      }}
                    >
                      เปิดโหวตทันที (ข้ามเวลาคุย)
                    </button>
                  )}

                  {/* Voting Candidates List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {allPlayersList.filter(p => p.isAlive).map(p => {
                      const hasMyVote = gameDoc.meeting?.votes?.[myUid] === p.uid
                      const voteCount = Object.values(gameDoc.meeting?.votes || {}).filter(v => v === p.uid).length

                      return (
                        <button
                          key={p.uid}
                          type="button"
                          disabled={gameDoc.status !== 'meeting_voting' || !isAlive}
                          onClick={() => castVote(p.uid)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 14px', borderRadius: 12,
                            background: hasMyVote ? 'rgba(229, 57, 53, 0.2)' : 'rgba(255,255,255,0.04)',
                            border: `1.5px solid ${hasMyVote ? '#e53935' : 'rgba(255,255,255,0.08)'}`,
                            color: '#fff', cursor: (gameDoc.status === 'meeting_voting' && isAlive) ? 'pointer' : 'default',
                            opacity: (gameDoc.status === 'meeting_voting' && isAlive) ? 1 : 0.8,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {p.avatar ? (
                              <img src={p.avatar} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#37474f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                                <i className="fas fa-user" />
                              </div>
                            )}
                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                              {p.name} {p.uid === myUid && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>(คุณ)</span>}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {/* Live Vote Tally (visible for admin or upon voting) */}
                            {voteCount > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#ff5252', background: 'rgba(229,57,53,0.15)', padding: '2px 8px', borderRadius: 999 }}>
                                {voteCount} โหวต
                              </span>
                            )}
                            {hasMyVote && <i className="fas fa-check-circle" style={{ color: '#ff5252' }} />}
                          </div>
                        </button>
                      )
                    })}

                    {/* Skip Vote Button */}
                    {gameDoc.status === 'meeting_voting' && isAlive && (
                      <button
                        type="button"
                        onClick={() => castVote('skip')}
                        style={{
                          padding: '12px 14px', borderRadius: 12,
                          background: gameDoc.meeting?.votes?.[myUid] === 'skip' ? 'rgba(158,158,158,0.2)' : 'rgba(255,255,255,0.02)',
                          border: `1.5px solid ${gameDoc.meeting?.votes?.[myUid] === 'skip' ? '#9e9e9e' : 'rgba(255,255,255,0.08)'}`,
                          color: '#fff', fontSize: 13, fontWeight: 800,
                          cursor: 'pointer', textAlign: 'center', marginTop: 4,
                        }}
                      >
                        <i className="fas fa-forward" style={{ marginRight: 8 }} />
                        SKIP VOTE (งดออกเสียง)
                      </button>
                    )}
                  </div>

                  {/* Admin Force Conclude Votes Button */}
                  {hasAdminPerm && (
                    <button
                      type="button"
                      onClick={concludeVoting}
                      style={{
                        width: '100%', padding: '12px', borderRadius: 10,
                        background: '#c62828', color: '#fff',
                        border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                      }}
                    >
                      สรุปผลโหวตทันที
                    </button>
                  )}
                </div>
              )}

              {/* Meeting Phase 4: Result Reveal */}
              {gameDoc.status === 'meeting_result' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div style={{
                    width: 76, height: 76, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 32, color: '#ff5252', marginBottom: 16,
                  }}>
                    <i className="fas fa-poll" />
                  </div>

                  <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 8 }}>
                    ผลการประชุมและคะแนนโหวต
                  </div>
                  <div style={{ fontSize: 15, color: '#ff5252', fontWeight: 800, maxWidth: 360, lineHeight: 1.4 }}>
                    {gameDoc.meeting?.result?.outcomeText || 'การประชุมเสร็จสิ้น'}
                  </div>

                  {hasAdminPerm && (
                    <button
                      type="button"
                      onClick={handleResumeGame}
                      style={{
                        marginTop: 32, padding: '14px 28px', borderRadius: 12,
                        background: '#2e7d32', color: '#fff', fontSize: 14, fontWeight: 900,
                        border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(46, 125, 50, 0.4)',
                      }}
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
        {/* ─── GAME OVER / VICTORY SCREEN ─────────────────────────── */}
        {/* ─────────────────────────────────────────────────────────── */}
        {gameDoc.status === 'ended' && (
          <div style={{
            background: '#121722', borderRadius: 20, padding: 24,
            border: '2px solid rgba(255,255,255,0.1)',
            textAlign: 'center', marginTop: 10,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: gameDoc.winner === 'dodo' ? '#7b1fa2' : (gameDoc.winner === 'crewmate' ? '#0288d1' : '#c62828'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 32, margin: '0 auto 16px',
            }}>
              <i className={`fas fa-${gameDoc.winner === 'dodo' ? 'mask' : (gameDoc.winner === 'crewmate' ? 'shield-alt' : 'skull')}`} />
            </div>

            <div style={{
              fontSize: 22, fontWeight: 900,
              color: gameDoc.winner === 'dodo' ? '#ce93d8' : (gameDoc.winner === 'crewmate' ? '#81d4fa' : '#ff8a80'),
              letterSpacing: '0.04em',
            }}>
              {gameDoc.winner === 'dodo' ? 'โดโด้เป็นฝ่ายชนะ!' : (gameDoc.winner === 'crewmate' ? 'ฝ่ายคนดีเป็นฝ่ายชนะ!' : 'ฝ่ายคนร้ายเป็นฝ่ายชนะ!')}
            </div>

            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 6, marginBottom: 20 }}>
              {gameDoc.winReason}
            </div>

            {/* Reveal All Roles */}
            <div style={{
              background: 'rgba(0,0,0,0.3)', borderRadius: 14, padding: 14,
              textAlign: 'left', marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.4)', marginBottom: 8, letterSpacing: '0.05em' }}>
                เฉลยบทบาทผู้เล่นทุกคน
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allPlayersList.map(p => {
                  const roleColor = p.role === 'impostor' ? '#e53935' : (p.role === 'dodo' ? '#ab47bc' : '#29b6f6')
                  const roleLabel = p.role === 'impostor' ? 'คนร้าย (Impostor)' : (p.role === 'dodo' ? 'โดโด้ (Dodo)' : 'คนดี (Crewmate)')
                  return (
                    <div key={p.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{p.name}</span>
                      <span style={{ fontWeight: 800, color: roleColor }}>{roleLabel}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {hasAdminPerm && (
              <button
                type="button"
                onClick={handleResetGame}
                style={{
                  width: '100%', padding: '12px', borderRadius: 12,
                  background: '#c62828', color: '#fff', fontSize: 14, fontWeight: 900,
                  border: 'none', cursor: 'pointer',
                }}
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
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setActiveTaskModal(null)}>
          <div style={{
            background: '#121722', borderRadius: 20, padding: 24,
            maxWidth: 340, width: '100%', textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.1)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#ff5252', letterSpacing: '0.05em' }}>
              QR CODE ยืนยันภารกิจ
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4, marginBottom: 2 }}>
              {activeTaskModal.title}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
              ยื่นหน้านี้ให้แอดมินสแกนด้วยกล้อง เพื่อบันทึกว่าทำสำเร็จ
            </div>

            <div style={{
              background: '#fff', padding: 16, borderRadius: 16,
              display: 'inline-block', marginBottom: 16,
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
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                background: 'rgba(255,255,255,0.08)', color: '#fff',
                border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
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
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setShowSabotageModal(false)}>
          <div style={{
            background: '#121722', borderRadius: 20, padding: 22,
            maxWidth: 380, width: '100%',
            border: '1px solid rgba(229, 57, 53, 0.4)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ff5252', marginBottom: 4 }}>
              <i className="fas fa-radiation" />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.05em' }}>IMPOSTOR SABOTAGE</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
              เลือกสถานการณ์ก่อกวน
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>
              คำขอจะถูกส่งให้แอดมินตรวจสอบ เมื่อแอดมินอนุมัติ สัญญาณเตือนจะดังขึ้นบนโทรศัพท์ของทุกคน
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                { title: 'ไฟดับ (Lights Out)', desc: 'ลดการมองเห็น คนดีต้องรีบไปแก้ปัญหากับแอดมิน' },
                { title: 'อากาศรั่ว (O2 Depletion)', desc: 'มีเวลานับถอยหลัง คนดีต้องรีบไปกู้สถานการณ์' },
                { title: 'ประตูล็อค (Doors Locked)', desc: 'ประตูปิดกั้น คนดีต้องช่วยกันเคลียร์ทาง' },
                { title: 'ป่วนระบบสื่อสาร (Comms Jammed)', desc: 'แถบความคืบหน้าภารกิจจะถูกซ่อนชั่วคราว' },
              ].map(s => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => requestSabotage(s.title, s.desc)}
                  style={{
                    padding: '11px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ff8a80' }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{s.desc}</div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowSabotageModal(false)}
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
                border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ยกเลิก
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
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              ส่องกล้องไปที่ QR Code ภารกิจของผู้เล่น
            </div>
            <div
              id="allofus-admin-qr-reader"
              style={{
                width: '100%',
                borderRadius: 16,
                overflow: 'hidden',
                background: '#000',
                marginBottom: 16,
              }}
            />
            <button
              type="button"
              onClick={() => setScannerOpen(false)}
              style={{
                padding: '10px 24px', borderRadius: 10,
                background: '#c62828', color: '#fff',
                border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}
            >
              ปิดกล้อง
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
