import { useState, useEffect, useMemo } from 'react'
import { db, storage } from '../firebase'
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

const toWsrv = (fileId) =>
  `https://wsrv.nl/?url=https://drive.usercontent.google.com/download?id=${fileId}%26export%3Dview&w=600&output=webp`

const convertImageUrl = (url) => {
  if (!url) return url
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^=?/]+)/)
  if (lh3) return toWsrv(lh3[1])
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (m1) return toWsrv(m1[1])
  const m2 = url.match(/[?&]id=([^&]+)/)
  if (m2) return toWsrv(m2[1])
  return url
}

const ALL_ROOMS = [
  { name: 'Waiting Area 1', icon: 'fa-couch' },
  { name: 'Waiting Area 2', icon: 'fa-couch' },
  { name: '404 Bar', icon: 'fa-glass-martini-alt' },
  { name: 'Japanese Room', icon: 'fa-torii-gate' },
  { name: 'Chinese Room', icon: 'fa-dragon' },
  { name: 'Europe Room', icon: 'fa-chess-rook' },
  { name: 'Ghost Room', icon: 'fa-ghost' },
  { name: 'Projector Room', icon: 'fa-film' },
  { name: '5 Floor', icon: 'fa-building' },
  { name: 'Yang', icon: 'fa-yin-yang' },
  { name: 'Chinese DM', icon: 'fa-user-secret' },
  { name: 'Thai DM', icon: 'fa-user-tie' }
]

const DIFFICULTIES = [
  { id: 'Beginner', label: 'Beginner', desc: 'ง่าย / เริ่มต้น', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: 'fa-seedling' },
  { id: 'Normal',   label: 'Normal',   desc: 'ปานกลาง / ทั่วไป', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', icon: 'fa-compass' },
  { id: 'Hard',     label: 'Hard',     desc: 'ท้าทาย / ซับซ้อน', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: 'fa-puzzle-piece' },
  { id: 'Expert',   label: 'Expert',   desc: 'ระดับเซียน / เข้มข้น', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', icon: 'fa-fire' }
]

const QUICK_TAG_SUGGESTIONS = [
  'Detective', 'Horror', 'Drama', 'Mystery', 'Thriller', 'Sci-Fi', 'Comedy', 'Fantasy', 'Emotional', 'Hardcore', 'Romance'
]

const QUICK_PLAYER_PRESETS = ['4-6 คน', '5-7 คน', '6-8 คน', '7 คน', '8 คน', '8-10 คน', '10+ คน']
const QUICK_TIME_PRESETS = ['2-3 ชั่วโมง', '3-4 ชั่วโมง', '4-5 ชั่วโมง', '5-6 ชั่วโมง', '6-7 ชั่วโมง', '7-9 ชั่วโมง']

const TRIGGER_PRESETS = [
  'มีเนื้อหาความรุนแรง',
  'มีฉากเลือด / การชันสูตร',
  'ธีมสยองขวัญ / ผี',
  'มีเนื้อหากระทบกระเทือนจิตใจ / ดราม่าหนัก',
  'เนื้อหาสำหรับผู้ใหญ่ (18+)',
  'มีแสงไฟกะพริบ / แฟลช'
]

const TABS = [
  { id: 'basic', label: 'ข้อมูลทั่วไป', icon: 'fa-info-circle' },
  { id: 'pricing', label: 'ราคา & ห้องเล่น', icon: 'fa-coins' },
  { id: 'story', label: 'เรื่องย่อ & คำเตือน', icon: 'fa-book-open' },
  { id: 'chars', label: 'ตัวละคร', icon: 'fa-users' },
  { id: 'media', label: 'สื่อ & หน้าปก', icon: 'fa-photo-video' }
]

export default function GameModal({ editingGame, onClose, showToast }) {
  const [activeTab, setActiveTab] = useState('basic')
  const [title, setTitle] = useState('')
  const [players, setPlayers] = useState('')
  const [time, setTime] = useState('')
  const [fullPrice, setFullPrice] = useState('')
  const [payPrice, setPayPrice] = useState('')
  const [difficulty, setDifficulty] = useState('Normal')
  const [detective, setDetective] = useState(3)
  const [roleplay, setRoleplay] = useState(3)
  const [synopsis, setSynopsis] = useState('')
  const [trigger, setTrigger] = useState('')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [imageMode, setImageMode] = useState('url') // default to 'url' for fast web Drive flow
  const [imageFile, setImageFile] = useState(null)
  const [imageDriveUrl, setImageDriveUrl] = useState('')
  const [videoFile, setVideoFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [videoPreview, setVideoPreview] = useState('')
  const [currentImageUrl, setCurrentImageUrl] = useState('')
  const [currentVideoUrl, setCurrentVideoUrl] = useState('')
  const [deposit, setDeposit] = useState('')
  const [selectedRooms, setSelectedRooms] = useState([])
  const [mainRoom, setMainRoom] = useState('')
  const [characters, setCharacters] = useState([])
  const [saving, setSaving] = useState(false)
  const [convertCopied, setConvertCopied] = useState(false)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const toggleRoom = (roomName) => {
    setSelectedRooms(prev => {
      if (prev.includes(roomName)) {
        const next = prev.filter(r => r !== roomName)
        setMainRoom(m => m === roomName ? (next[0] || '') : m)
        return next
      }
      const next = [...prev, roomName]
      setMainRoom(m => m || roomName)
      return next
    })
  }

  const selectAllRooms = () => {
    const all = ALL_ROOMS.map(r => r.name)
    setSelectedRooms(all)
    if (!mainRoom) setMainRoom(all[0])
  }

  const clearRooms = () => {
    setSelectedRooms([])
    setMainRoom('')
  }

  useEffect(() => {
    if (editingGame) {
      setTitle(editingGame.title || '')
      setPlayers(editingGame.players || '')
      setTime(editingGame.time || '')
      setFullPrice(editingGame.fullPrice ?? editingGame.price ?? '')
      setPayPrice(editingGame.payPrice ?? editingGame.price ?? '')
      setDifficulty(editingGame.difficulty || 'Normal')
      setDetective(editingGame.detective || 3)
      setRoleplay(editingGame.roleplay || 3)
      setSynopsis(editingGame.synopsis || editingGame.description || '')
      setTrigger(editingGame.trigger || editingGame.triggerWarning || '')
      setTags(editingGame.tags || [])
      setDeposit(editingGame.deposit ?? '')
      setSelectedRooms(editingGame.rooms || [])
      setMainRoom(editingGame.mainRoom || (editingGame.rooms?.[0] ?? ''))
      setCurrentImageUrl(editingGame.image || '')
      setCurrentVideoUrl(editingGame.videoUrl || '')
      setCharacters((editingGame.characters || []).map(c => {
        const isDrive = c.image && (c.image.includes('drive.google.com') || c.image.includes('wsrv.nl') || c.image.includes('googleusercontent.com'))
        return {
          ...c,
          imageFile: null,
          imagePreview: c.image ? convertImageUrl(c.image) : '',
          imageMode: isDrive ? 'url' : 'file',
          imageDriveUrl: isDrive ? c.image : ''
        }
      }))

      const img = editingGame.image || ''
      if (img.includes('drive.google.com') || img.includes('googleusercontent.com') || img.includes('wsrv.nl')) {
        setImageMode('url')
        setImageDriveUrl(img)
        setImagePreview(convertImageUrl(img))
      } else if (img) {
        setImageMode('file')
        setImagePreview(img)
      } else {
        setImageMode('url')
      }
      setVideoPreview(editingGame.videoUrl || '')
    } else {
      // Default initial state for new script
      setDifficulty('Normal')
      setDetective(3)
      setRoleplay(3)
      setSelectedRooms(['Europe Room', 'Japanese Room', 'Ghost Room'])
      setMainRoom('Europe Room')
    }
  }, [editingGame])

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = tagInput.trim().replace(',', '')
      if (val && !tags.includes(val)) setTags(prev => [...prev, val])
      setTagInput('')
    }
  }

  const addTagPreset = (t) => {
    if (!tags.includes(t)) setTags(prev => [...prev, t])
  }

  const removeTag = (t) => setTags(prev => prev.filter(x => x !== t))

  const addTriggerPreset = (t) => {
    if (!trigger.includes(t)) {
      setTrigger(prev => (prev ? prev.trim() + '\n' + t : t))
    }
  }

  const addCharacter = () => {
    setCharacters(prev => [
      ...prev,
      { name: '', role: '', image: '', imageFile: null, imagePreview: '', imageMode: 'url', imageDriveUrl: '' }
    ])
  }

  const removeCharacter = (idx) =>
    setCharacters(prev => prev.filter((_, i) => i !== idx))

  const updateCharacter = (idx, field, value) =>
    setCharacters(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))

  const handleCharacterDriveUrl = (idx, url) => {
    setCharacters(prev => prev.map((c, i) => i === idx ? {
      ...c, imageDriveUrl: url, imagePreview: convertImageUrl(url), imageFile: null
    } : c))
  }

  const handleCharacterImageChange = (idx, e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { showToast('ไฟล์รูปใหญ่เกินไป (สูงสุด 5MB)', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => setCharacters(prev => prev.map((c, i) => i === idx ? { ...c, imageFile: file, imagePreview: ev.target.result } : c))
    reader.readAsDataURL(file)
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { showToast('ไฟล์รูปใหญ่เกินไป (สูงสุด 5MB)', 'error'); return }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleVideoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { showToast('ไฟล์วิดีโอใหญ่เกินไป (สูงสุด 50MB)', 'error'); return }
    setVideoFile(file)
    setVideoPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!title.trim()) {
      showToast('กรุณาระบุชื่อเกม', 'error')
      setActiveTab('basic')
      return
    }
    setSaving(true)
    try {
      let imageUrl = currentImageUrl
      let videoUrl = currentVideoUrl
      if (imageFile) {
        const ref = storageRef(storage, `scripts/images/${Date.now()}_${imageFile.name}`)
        const snap = await uploadBytes(ref, imageFile)
        imageUrl = await getDownloadURL(snap.ref)
      } else if (imageMode === 'url' && imageDriveUrl.trim()) {
        imageUrl = imageDriveUrl.trim()
      }
      if (videoFile) {
        const ref = storageRef(storage, `scripts/videos/${Date.now()}_${videoFile.name}`)
        const snap = await uploadBytes(ref, videoFile)
        videoUrl = await getDownloadURL(snap.ref)
      }
      const savedChars = []
      for (const char of characters) {
        let imgUrl = char.image || ''
        if (char.imageFile) {
          const cRef = storageRef(storage, `scripts/characters/${Date.now()}_${char.imageFile.name}`)
          const cSnap = await uploadBytes(cRef, char.imageFile)
          imgUrl = await getDownloadURL(cSnap.ref)
        } else if (char.imageMode === 'url' && char.imageDriveUrl?.trim()) {
          imgUrl = char.imageDriveUrl.trim()
        }
        savedChars.push({ name: char.name || '', role: char.role || '', image: imgUrl })
      }
      const data = {
        title: title.trim(),
        players,
        time,
        fullPrice: parseFloat(fullPrice) || 0,
        payPrice: parseFloat(payPrice) || 0,
        price: parseFloat(fullPrice) || 0,
        deposit: parseFloat(deposit) || 0,
        difficulty,
        detective: parseInt(detective) || 3,
        roleplay: parseInt(roleplay) || 3,
        synopsis: synopsis.trim(),
        trigger: trigger.trim(),
        tags,
        image: imageUrl,
        videoUrl,
        characters: savedChars,
        rooms: selectedRooms,
        mainRoom: mainRoom || selectedRooms[0] || '',
        updatedAt: serverTimestamp()
      }
      if (editingGame) {
        await updateDoc(doc(db, 'scripts', editingGame.id), data)
        showToast('อัปเดตสคริปต์สำเร็จ')
      } else {
        data.createdAt = serverTimestamp()
        await addDoc(collection(db, 'scripts'), data)
        showToast('เพิ่มสคริปต์ใหม่สำเร็จ')
      }
      onClose()
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Active diff metadata
  const currentDiffObj = DIFFICULTIES.find(d => d.id === difficulty) || DIFFICULTIES[1]
  const charsWithImg = characters.filter(c => c.imagePreview || c.imageDriveUrl || c.image).length

  // Tab index navigation
  const currentTabIndex = TABS.findIndex(t => t.id === activeTab)
  const prevTab = currentTabIndex > 0 ? TABS[currentTabIndex - 1] : null
  const nextTab = currentTabIndex < TABS.length - 1 ? TABS[currentTabIndex + 1] : null

  return (
    <div
      className="sc-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sc-modal-container">
        {/* Scoped CSS for modern studio redesign */}
        <style>{`
          .sc-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 3100;
            background: rgba(4, 4, 8, 0.82);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            animation: scFadeIn 0.2s ease-out;
          }
          @keyframes scFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes scSlideUp {
            from { opacity: 0; transform: translateY(16px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }

          .sc-modal-container {
            background: #14141a;
            color: #f1f1f5;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            width: 100%;
            max-width: 980px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(198, 36, 25, 0.15);
            animation: scSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: 'Google Sans', 'Sarabun', sans-serif;
          }

          /* Header */
          .sc-modal-header {
            padding: 18px 24px 14px;
            background: #181822;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-shrink: 0;
          }
          .sc-header-left {
            display: flex;
            align-items: center;
            gap: 14px;
            min-width: 0;
          }
          .sc-header-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: linear-gradient(135deg, rgba(198,36,25,0.25), rgba(198,36,25,0.08));
            border: 1px solid rgba(198,36,25,0.4);
            color: #ff574d;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            flex-shrink: 0;
          }
          .sc-header-title-box {
            min-width: 0;
          }
          .sc-header-title {
            font-size: 17px;
            font-weight: 800;
            color: #ffffff;
            display: flex;
            align-items: center;
            gap: 8px;
            letter-spacing: -0.01em;
          }
          .sc-header-badge {
            font-size: 11px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 999px;
            background: rgba(198, 36, 25, 0.2);
            color: #ff7b72;
            border: 1px solid rgba(198, 36, 25, 0.4);
          }
          .sc-header-subtitle {
            font-size: 12.5px;
            color: #9292a8;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 460px;
          }
          .sc-header-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
          }
          .sc-close-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #9ea0b4;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.15s;
          }
          .sc-close-btn:hover {
            background: rgba(239, 68, 68, 0.15);
            border-color: rgba(239, 68, 68, 0.4);
            color: #ff6b6b;
            transform: rotate(90deg);
          }

          /* Tab Bar */
          .sc-tab-bar {
            background: #14141d;
            border-bottom: 1px solid rgba(255, 255, 255, 0.07);
            display: flex;
            padding: 4px 16px;
            gap: 6px;
            overflow-x: auto;
            flex-shrink: 0;
          }
          .sc-tab-btn {
            background: transparent;
            border: none;
            color: #8c8da6;
            font-size: 13px;
            font-weight: 700;
            font-family: inherit;
            padding: 10px 16px;
            border-radius: 10px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
            transition: all 0.15s;
            position: relative;
          }
          .sc-tab-btn:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.04);
          }
          .sc-tab-btn.active {
            color: #ffffff;
            background: rgba(198, 36, 25, 0.16);
            border: 1px solid rgba(198, 36, 25, 0.35);
          }
          .sc-tab-btn.active i {
            color: #ff574d;
          }
          .sc-tab-count {
            background: rgba(255, 255, 255, 0.12);
            font-size: 10.5px;
            padding: 2px 7px;
            border-radius: 999px;
            color: #fff;
          }
          .sc-tab-btn.active .sc-tab-count {
            background: var(--crimson-500);
          }

          /* Body Content */
          .sc-modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 22px;
          }

          /* Section Cards */
          .sc-section-card {
            background: #1a1a24;
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 14px;
            padding: 20px;
          }
          .sc-section-title {
            font-size: 13.5px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #9292ab;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .sc-section-title i {
            color: #ff574d;
          }

          /* Form Controls */
          .sc-form-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          .sc-form-grid-3 {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
          }
          @media (max-width: 680px) {
            .sc-form-grid-2, .sc-form-grid-3 {
              grid-template-columns: 1fr;
            }
          }

          .sc-form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .sc-form-label {
            font-size: 12px;
            font-weight: 700;
            color: #c4c5db;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .sc-label-sub {
            font-weight: 400;
            font-size: 11px;
            color: #7b7c94;
          }
          .sc-input-wrap {
            position: relative;
            display: flex;
            align-items: center;
          }
          .sc-input-icon {
            position: absolute;
            left: 14px;
            color: #6d6e87;
            font-size: 13px;
            pointer-events: none;
          }
          .sc-input {
            width: 100%;
            background: #111117;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #ffffff;
            font-family: inherit;
            font-size: 13.5px;
            padding: 10px 14px;
            border-radius: 9px;
            outline: none;
            transition: all 0.15s;
          }
          .sc-input.with-icon {
            padding-left: 38px;
          }
          .sc-input:focus {
            border-color: #ff574d;
            background: #13131c;
            box-shadow: 0 0 0 3px rgba(198, 36, 25, 0.2);
          }
          .sc-textarea {
            width: 100%;
            background: #111117;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #ffffff;
            font-family: inherit;
            font-size: 13.5px;
            line-height: 1.6;
            padding: 12px 14px;
            border-radius: 9px;
            outline: none;
            resize: vertical;
            min-height: 110px;
            transition: all 0.15s;
          }
          .sc-textarea:focus {
            border-color: #ff574d;
            background: #13131c;
            box-shadow: 0 0 0 3px rgba(198, 36, 25, 0.2);
          }

          /* Preset chips */
          .sc-preset-row {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
          }
          .sc-preset-chip {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #9da0bc;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 9px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
          }
          .sc-preset-chip:hover {
            background: rgba(198, 36, 25, 0.18);
            border-color: rgba(198, 36, 25, 0.4);
            color: #fff;
          }

          /* Difficulty Cards */
          .sc-diff-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
          }
          @media (max-width: 680px) {
            .sc-diff-grid { grid-template-columns: repeat(2, 1fr); }
          }
          .sc-diff-card {
            background: #121219;
            border: 1.5px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 12px;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            gap: 4px;
            transition: all 0.15s;
            position: relative;
            text-align: left;
          }
          .sc-diff-card:hover {
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-1px);
          }
          .sc-diff-card.selected {
            border-color: var(--diff-color);
            background: var(--diff-bg);
            box-shadow: 0 0 16px -4px var(--diff-border);
          }
          .sc-diff-card-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            font-weight: 800;
            color: #ffffff;
          }
          .sc-diff-desc {
            font-size: 11px;
            color: #8c8ea8;
          }

          /* Star Rating Rows */
          .sc-star-row {
            display: flex;
            align-items: center;
            gap: 8px;
            background: #111117;
            border: 1px solid rgba(255, 255, 255, 0.09);
            padding: 8px 14px;
            border-radius: 9px;
          }
          .sc-star-buttons {
            display: flex;
            gap: 4px;
          }
          .sc-star-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 17px;
            color: #3b3c50;
            padding: 2px;
            transition: all 0.15s;
          }
          .sc-star-btn.active {
            color: #f59e0b;
            text-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
          }
          .sc-star-btn:hover {
            transform: scale(1.15);
            color: #fbbf24;
          }
          .sc-star-label {
            font-size: 12px;
            font-weight: 700;
            color: #d1d2e6;
            margin-left: auto;
          }

          /* Tags Input Box */
          .sc-tags-box {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
            background: #111117;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 9px;
            padding: 8px 12px;
            min-height: 48px;
            cursor: text;
          }
          .sc-tags-box:focus-within {
            border-color: #ff574d;
            box-shadow: 0 0 0 3px rgba(198, 36, 25, 0.2);
          }
          .sc-tag-pill {
            background: rgba(198, 36, 25, 0.16);
            border: 1px solid rgba(198, 36, 25, 0.4);
            color: #ffb4ae;
            font-size: 12px;
            font-weight: 700;
            padding: 3px 9px;
            border-radius: 6px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .sc-tag-del {
            cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.15s;
          }
          .sc-tag-del:hover {
            opacity: 1;
            color: #ffffff;
          }
          .sc-tags-input {
            background: none;
            border: none;
            color: #ffffff;
            font-family: inherit;
            font-size: 13px;
            outline: none;
            min-width: 120px;
            flex: 1;
          }

          /* Pricing Cards */
          .sc-price-card {
            background: #111117;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            position: relative;
          }
          .sc-price-card.featured {
            border-color: rgba(198, 36, 25, 0.5);
            background: linear-gradient(180deg, rgba(198,36,25,0.08), #111117);
          }
          .sc-price-tag-badge {
            position: absolute;
            top: 12px;
            right: 12px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            padding: 2px 7px;
            border-radius: 4px;
            background: var(--crimson-500);
            color: #fff;
          }
          .sc-price-head {
            font-size: 12px;
            font-weight: 800;
            color: #b0b2ce;
            display: flex;
            align-items: center;
            gap: 7px;
          }

          /* Rooms Grid */
          .sc-room-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
          }
          @media (max-width: 768px) {
            .sc-room-grid { grid-template-columns: repeat(2, 1fr); }
          }
          .sc-room-card {
            background: #111117;
            border: 1.5px solid rgba(255, 255, 255, 0.08);
            border-radius: 9px;
            padding: 10px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            transition: all 0.15s;
            user-select: none;
          }
          .sc-room-card:hover {
            border-color: rgba(255, 255, 255, 0.2);
          }
          .sc-room-card.selected {
            background: rgba(198, 36, 25, 0.12);
            border-color: var(--crimson-500);
            color: #ffffff;
          }
          .sc-room-card.is-main {
            background: linear-gradient(135deg, rgba(198,36,25,0.3), rgba(198,36,25,0.1));
            border-color: #ff574d;
            box-shadow: 0 0 12px -2px rgba(198, 36, 25, 0.35);
          }
          .sc-room-info {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            font-weight: 700;
            min-width: 0;
          }
          .sc-room-crown-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: #555770;
            font-size: 12px;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.15s;
          }
          .sc-room-crown-btn.crown-active {
            color: #f59e0b;
            text-shadow: 0 0 8px rgba(245, 158, 11, 0.7);
          }
          .sc-room-crown-btn:hover {
            color: #fbbf24;
            transform: scale(1.15);
          }

          /* Characters Studio */
          .sc-chars-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 10px;
          }
          .sc-char-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
          }
          @media (max-width: 768px) {
            .sc-char-grid { grid-template-columns: 1fr; }
          }
          .sc-char-card {
            background: #111117;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 14px;
            display: flex;
            gap: 14px;
            position: relative;
            transition: border-color 0.15s;
          }
          .sc-char-card:hover {
            border-color: rgba(255, 255, 255, 0.18);
          }
          .sc-char-avatar-col {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            width: 76px;
            flex-shrink: 0;
          }
          .sc-char-avatar-box {
            width: 76px;
            height: 76px;
            border-radius: 10px;
            overflow: hidden;
            background: #1c1c28;
            border: 1.5px dashed rgba(255, 255, 255, 0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            cursor: pointer;
          }
          .sc-char-avatar-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .sc-char-avatar-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 16px;
            opacity: 0;
            transition: opacity 0.15s;
          }
          .sc-char-avatar-box:hover .sc-char-avatar-overlay {
            opacity: 1;
          }
          .sc-char-mode-pill {
            display: flex;
            background: #181824;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            padding: 2px;
            width: 100%;
          }
          .sc-char-mode-btn {
            flex: 1;
            background: none;
            border: none;
            color: #7b7d9b;
            font-size: 11px;
            padding: 3px 0;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.15s;
          }
          .sc-char-mode-btn.active {
            background: #2a2a3e;
            color: #ffffff;
          }
          .sc-char-body-col {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .sc-char-del-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            color: #6d6f8a;
            cursor: pointer;
            font-size: 13px;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.15s;
          }
          .sc-char-del-btn:hover {
            color: #ef4444;
            background: rgba(239, 68, 68, 0.1);
          }

          /* Media Tab */
          .sc-media-grid {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 18px;
          }
          @media (max-width: 768px) {
            .sc-media-grid { grid-template-columns: 1fr; }
          }
          .sc-media-preview-card {
            background: #0d0d12;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            aspect-ratio: 16/9;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sc-media-preview-card img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .sc-media-badge-overlay {
            position: absolute;
            bottom: 12px;
            left: 12px;
            right: 12px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            background: linear-gradient(180deg, transparent, rgba(0,0,0,0.85));
            padding: 8px 10px;
            border-radius: 8px;
          }

          /* Converted URL banner */
          .sc-convert-box {
            background: rgba(16, 185, 129, 0.08);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 9px;
            padding: 10px 14px;
            margin-top: 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .sc-convert-label {
            font-size: 11px;
            font-weight: 700;
            color: #34d399;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .sc-convert-row {
            display: flex;
            gap: 8px;
          }
          .sc-convert-input {
            flex: 1;
            background: #09090e;
            border: 1px solid rgba(16, 185, 129, 0.2);
            color: #d1fae5;
            font-family: monospace;
            font-size: 11.5px;
            padding: 6px 10px;
            border-radius: 6px;
            outline: none;
          }
          .sc-convert-copy {
            background: #10b981;
            color: #064e3b;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 11.5px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: all 0.15s;
          }
          .sc-convert-copy:hover {
            background: #34d399;
          }
          .sc-convert-copy.copied {
            background: #059669;
            color: #fff;
          }

          /* Footer */
          .sc-modal-footer {
            padding: 14px 24px;
            background: #181822;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-shrink: 0;
          }
          .sc-footer-left {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .sc-footer-right {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          /* Buttons */
          .sc-btn {
            font-family: inherit;
            font-size: 13px;
            font-weight: 700;
            padding: 10px 18px;
            border-radius: 9px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            transition: all 0.15s;
            border: none;
          }
          .sc-btn-secondary {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #c9cae2;
          }
          .sc-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
          }
          .sc-btn-nav {
            background: #232332;
            border: 1px solid rgba(255, 255, 255, 0.09);
            color: #b0b2cd;
            font-size: 12px;
            padding: 8px 14px;
          }
          .sc-btn-nav:hover {
            background: #2e2e42;
            color: #fff;
          }
          .sc-btn-primary {
            background: var(--crimson-500);
            color: #ffffff;
            box-shadow: 0 4px 14px rgba(198, 36, 25, 0.35);
          }
          .sc-btn-primary:hover:not(:disabled) {
            background: var(--crimson-600);
            transform: translateY(-1px);
            box-shadow: 0 6px 18px rgba(198, 36, 25, 0.5);
          }
          .sc-btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>

        {/* ── HEADER ── */}
        <div className="sc-modal-header">
          <div className="sc-header-left">
            <div className="sc-header-icon">
              <i className="fas fa-scroll" />
            </div>
            <div className="sc-header-title-box">
              <div className="sc-header-title">
                {editingGame ? 'แก้ไขข้อมูลสคริปต์' : 'สร้างสคริปต์ใหม่'}
                <span className="sc-header-badge">
                  {editingGame ? 'Edit Mode' : 'New Script'}
                </span>
              </div>
              <div className="sc-header-subtitle">
                {title ? (
                  <span><strong style={{ color: '#fff' }}>{title}</strong> · {players || '?'} คน · {time || '?'} · {currentDiffObj.label}</span>
                ) : (
                  'กรอกรายละเอียดสคริปต์เพื่อนำไปแสดงบนหน้าเว็บและคำนวณในระบบ POS'
                )}
              </div>
            </div>
          </div>
          <div className="sc-header-actions">
            <button className="sc-close-btn" onClick={onClose} title="ปิดหน้าต่าง (Esc)">
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        {/* ── TAB BAR ── */}
        <div className="sc-tab-bar">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                className={`sc-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <i className={`fas ${tab.icon}`} />
                {tab.label}
                {tab.id === 'chars' && (
                  <span className="sc-tab-count">{characters.length}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── BODY CONTENT ── */}
        <div className="sc-modal-body">

          {/* ═════════ TAB 1: BASIC INFO ═════════ */}
          {activeTab === 'basic' && (
            <>
              {/* Game Title */}
              <div className="sc-section-card">
                <div className="sc-section-title">
                  <i className="fas fa-heading" /> ชื่อและข้อมูลพื้นฐาน
                </div>
                <div className="sc-form-group">
                  <label className="sc-form-label">
                    <span>ชื่อสคริปต์ / เกม <span style={{ color: '#ef4444' }}>*</span></span>
                    <span className="sc-label-sub">เช่น พันธสัญญาปีศาจ, Balgari Night</span>
                  </label>
                  <div className="sc-input-wrap">
                    <i className="fas fa-scroll sc-input-icon" />
                    <input
                      className="sc-input with-icon"
                      placeholder="ระบุชื่อเกม..."
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="sc-form-grid-2" style={{ marginTop: 14 }}>
                  {/* Players */}
                  <div className="sc-form-group">
                    <label className="sc-form-label">
                      <span>จำนวนผู้เล่น</span>
                      <span className="sc-label-sub">เช่น 7 หรือ 6-8</span>
                    </label>
                    <div className="sc-input-wrap">
                      <i className="fas fa-users sc-input-icon" />
                      <input
                        className="sc-input with-icon"
                        placeholder="เช่น 7 หรือ 6-10"
                        value={players}
                        onChange={e => setPlayers(e.target.value)}
                      />
                    </div>
                    <div className="sc-preset-row">
                      {QUICK_PLAYER_PRESETS.map(p => (
                        <button key={p} type="button" className="sc-preset-chip" onClick={() => setPlayers(p)}>
                          +{p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time */}
                  <div className="sc-form-group">
                    <label className="sc-form-label">
                      <span>ระยะเวลาการเล่น</span>
                      <span className="sc-label-sub">เช่น 4-5 ชั่วโมง</span>
                    </label>
                    <div className="sc-input-wrap">
                      <i className="fas fa-clock sc-input-icon" />
                      <input
                        className="sc-input with-icon"
                        placeholder="เช่น 3-4 ชั่วโมง"
                        value={time}
                        onChange={e => setTime(e.target.value)}
                      />
                    </div>
                    <div className="sc-preset-row">
                      {QUICK_TIME_PRESETS.map(t => (
                        <button key={t} type="button" className="sc-preset-chip" onClick={() => setTime(t)}>
                          +{t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Difficulty */}
              <div className="sc-section-card">
                <div className="sc-section-title">
                  <i className="fas fa-tachometer-alt" /> ระดับความยาก (Difficulty)
                </div>
                <div className="sc-diff-grid">
                  {DIFFICULTIES.map(d => {
                    const isSelected = difficulty === d.id
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`sc-diff-card ${isSelected ? 'selected' : ''}`}
                        style={{
                          '--diff-color': d.color,
                          '--diff-bg': d.bg,
                          '--diff-border': d.border
                        }}
                        onClick={() => setDifficulty(d.id)}
                      >
                        <div className="sc-diff-card-head">
                          <span style={{ color: isSelected ? d.color : '#fff' }}>{d.label}</span>
                          <i className={`fas ${d.icon}`} style={{ color: d.color }} />
                        </div>
                        <div className="sc-diff-desc">{d.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Detective & Roleplay Stars */}
              <div className="sc-section-card">
                <div className="sc-section-title">
                  <i className="fas fa-star" /> การประเมินคะแนนสไตล์การเล่น (1 - 5 ดาว)
                </div>
                <div className="sc-form-grid-2">
                  <div className="sc-form-group">
                    <label className="sc-form-label">
                      <span><i className="fas fa-search" style={{ color: '#60a5fa', marginRight: 5 }} /> ระดับการสืบสวน</span>
                      <span className="sc-label-sub">{detective} / 5</span>
                    </label>
                    <div className="sc-star-row">
                      <div className="sc-star-buttons">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            className={`sc-star-btn ${star <= detective ? 'active' : ''}`}
                            onClick={() => setDetective(star)}
                            title={`${star} ดาว`}
                          >
                            <i className="fas fa-star" />
                          </button>
                        ))}
                      </div>
                      <span className="sc-star-label">
                        {detective === 1 && 'สืบสบายๆ ไม่เครียด'}
                        {detective === 2 && 'พอจับทางได้'}
                        {detective === 3 && 'ปานกลาง มีเงื่อนงำ'}
                        {detective === 4 && 'ซับซ้อน ต้องต่อเบาะแส'}
                        {detective === 5 && 'ฮาร์ดคอร์ ลับลวงพราง'}
                      </span>
                    </div>
                  </div>

                  <div className="sc-form-group">
                    <label className="sc-form-label">
                      <span><i className="fas fa-theater-masks" style={{ color: '#f472b6', marginRight: 5 }} /> ระดับการสวมบทบาท</span>
                      <span className="sc-label-sub">{roleplay} / 5</span>
                    </label>
                    <div className="sc-star-row">
                      <div className="sc-star-buttons">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            className={`sc-star-btn ${star <= roleplay ? 'active' : ''}`}
                            onClick={() => setRoleplay(star)}
                            title={`${star} ดาว`}
                          >
                            <i className="fas fa-star" />
                          </button>
                        ))}
                      </div>
                      <span className="sc-star-label">
                        {roleplay === 1 && 'ไม่เน้นโรลเพลย์'}
                        {roleplay === 2 && 'มีบทเบาๆ อินง่าย'}
                        {roleplay === 3 && 'โรลเพลย์ปานกลาง'}
                        {roleplay === 4 && 'ดราม่าเข้มข้นจัดเต็ม'}
                        {roleplay === 5 && 'สวมบทบาทน้ำตาแตก'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="sc-section-card">
                <div className="sc-section-title">
                  <i className="fas fa-tags" /> แท็กหมวดหมู่ (Tags)
                </div>
                <div
                  className="sc-tags-box"
                  onClick={e => e.currentTarget.querySelector('input')?.focus()}
                >
                  {tags.map(t => (
                    <span key={t} className="sc-tag-pill">
                      #{t}
                      <span className="sc-tag-del" onClick={(e) => { e.stopPropagation(); removeTag(t); }}><i className="fas fa-times" style={{ fontSize: 10 }} /></span>
                    </span>
                  ))}
                  <input
                    className="sc-tags-input"
                    placeholder="พิมพ์แท็กแล้วกด Enter เพื่อเพิ่ม..."
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#7b7d99', marginBottom: 6 }}>แท็กแนะนำคลิกเพื่อเพิ่มเร็ว:</div>
                  <div className="sc-preset-row">
                    {QUICK_TAG_SUGGESTIONS.map(t => (
                      <button
                        key={t}
                        type="button"
                        className="sc-preset-chip"
                        onClick={() => addTagPreset(t)}
                        style={{
                          background: tags.includes(t) ? 'rgba(198,36,25,0.25)' : undefined,
                          borderColor: tags.includes(t) ? 'rgba(198,36,25,0.45)' : undefined,
                          color: tags.includes(t) ? '#fff' : undefined
                        }}
                      >
                        {tags.includes(t) ? '' : '+ '} {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═════════ TAB 2: PRICING & ROOMS ═════════ */}
          {activeTab === 'pricing' && (
            <>
              {/* Pricing Cards */}
              <div className="sc-section-card">
                <div className="sc-section-title">
                  <i className="fas fa-money-bill-wave" /> การตั้งราคาต่อคน (Pricing per Person)
                </div>
                <div className="sc-form-grid-3">
                  {/* Full Price */}
                  <div className="sc-price-card">
                    <div className="sc-price-head">
                      <i className="fas fa-tag" style={{ color: '#60a5fa' }} />
                      <span>ราคาเต็ม / โชว์ลูกค้า</span>
                    </div>
                    <div className="sc-input-wrap">
                      <input
                        className="sc-input"
                        type="number"
                        placeholder="0"
                        value={fullPrice}
                        onChange={e => setFullPrice(e.target.value)}
                      />
                    </div>
                    <span className="sc-label-sub">แสดงเป็นราคาหลักบนหน้าเว็บ</span>
                  </div>

                  {/* Pay Price */}
                  <div className="sc-price-card featured">
                    <span className="sc-price-tag-badge">POS คำนวณ</span>
                    <div className="sc-price-head">
                      <i className="fas fa-cash-register" style={{ color: '#ff7b72' }} />
                      <span>ราคาจ่ายจริง (POS)</span>
                    </div>
                    <div className="sc-input-wrap">
                      <input
                        className="sc-input"
                        type="number"
                        placeholder="0"
                        value={payPrice}
                        onChange={e => setPayPrice(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="sc-label-sub">ใช้คำนวณบิลตอนเปิดห้อง</span>
                      {fullPrice && (
                        <button
                          type="button"
                          className="sc-preset-chip"
                          onClick={() => setPayPrice(fullPrice)}
                          title="ดึงราคามาจากราคาเต็ม"
                        >
                          = เท่ากับราคาเต็ม
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Deposit */}
                  <div className="sc-price-card">
                    <div className="sc-price-head">
                      <i className="fas fa-shield-alt" style={{ color: '#f59e0b' }} />
                      <span>ราคามัดจำต่อคน</span>
                    </div>
                    <div className="sc-input-wrap">
                      <input
                        className="sc-input"
                        type="number"
                        placeholder="0"
                        value={deposit}
                        onChange={e => setDeposit(e.target.value)}
                      />
                    </div>
                    <span className="sc-label-sub">มัดจำล่วงหน้า (ถ้ามี)</span>
                  </div>
                </div>
              </div>

              {/* Rooms Selection */}
              <div className="sc-section-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div className="sc-section-title" style={{ margin: 0 }}>
                    <i className="fas fa-door-open" /> ห้องที่รองรับ ({selectedRooms.length}/{ALL_ROOMS.length})
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="sc-preset-chip" onClick={selectAllRooms}>
                      เลือกทั้งหมด
                    </button>
                    <button type="button" className="sc-preset-chip" onClick={clearRooms}>
                      ล้างการเลือก
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#8d8ea6', marginBottom: 12 }}>
                  คลิกที่ห้องเพื่อเปิด/ปิดการรองรับ และกดไอคอน <i className="fas fa-crown" style={{ color: '#f59e0b' }} /> เพื่อตั้งเป็น <strong>ห้องหลัก (Default Room)</strong>
                </div>

                <div className="sc-room-grid">
                  {ALL_ROOMS.map(room => {
                    const isSelected = selectedRooms.includes(room.name)
                    const isMain = mainRoom === room.name
                    return (
                      <div
                        key={room.name}
                        className={`sc-room-card ${isSelected ? 'selected' : ''} ${isMain ? 'is-main' : ''}`}
                        onClick={() => toggleRoom(room.name)}
                      >
                        <div className="sc-room-info">
                          <i className={`fas ${room.icon}`} style={{ color: isSelected ? '#ff7b72' : '#6b6c85', width: 16 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {room.name}
                          </span>
                        </div>
                        {isSelected && (
                          <button
                            type="button"
                            className={`sc-room-crown-btn ${isMain ? 'crown-active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setMainRoom(room.name)
                            }}
                            title={isMain ? 'ห้องหลักปัจจุบัน' : 'คลิกเพื่อตั้งเป็นห้องหลัก'}
                          >
                            <i className="fas fa-crown" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {mainRoom && (
                  <div style={{ marginTop: 14, padding: '8px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <i className="fas fa-crown" style={{ color: '#f59e0b' }} />
                    <span>ห้องหลักปัจจุบัน: <strong style={{ color: '#fff' }}>{mainRoom}</strong> (ห้องเริ่มต้นในระบบ POS / การจอง)</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═════════ TAB 3: STORY & WARNING ═════════ */}
          {activeTab === 'story' && (
            <>
              {/* Synopsis */}
              <div className="sc-section-card">
                <div className="sc-section-title">
                  <i className="fas fa-book-open" /> เรื่องย่อ (Synopsis)
                </div>
                <div className="sc-form-group">
                  <label className="sc-form-label">
                    <span>เนื้อเรื่องและบรรยากาศย่อสำหรับดึงดูดผู้เล่น</span>
                    <span className="sc-label-sub">{synopsis.length} ตัวอักษร</span>
                  </label>
                  <textarea
                    className="sc-textarea"
                    style={{ minHeight: 180 }}
                    placeholder="บรรยายเนื้อเรื่องโดยย่อ จุดเริ่มต้นของคดี บรรยากาศ และสิ่งที่ผู้เล่นต้องเผชิญ..."
                    value={synopsis}
                    onChange={e => setSynopsis(e.target.value)}
                  />
                </div>
              </div>

              {/* Trigger Warning */}
              <div className="sc-section-card" style={{ borderColor: trigger ? 'rgba(245,158,11,0.3)' : undefined }}>
                <div className="sc-section-title" style={{ color: '#f59e0b' }}>
                  <i className="fas fa-exclamation-triangle" /> Trigger Warning (คำเตือนเนื้อหาสำหรับผู้เล่น)
                </div>
                <div className="sc-form-group">
                  <label className="sc-form-label">
                    <span>คำเตือนประเด็นอ่อนไหว ความรุนแรง หรือข้อจำกัด</span>
                  </label>
                  <textarea
                    className="sc-textarea"
                    style={{ minHeight: 90 }}
                    placeholder="เช่น มีฉากฆาตกรรม เลือด, เหมาะสำหรับผู้เล่นอายุ 18 ปีขึ้นไป..."
                    value={trigger}
                    onChange={e => setTrigger(e.target.value)}
                  />
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: '#8d8ea6', marginBottom: 6 }}>คลิกเพื่อเพิ่มคำเตือนที่พบบ่อย:</div>
                    <div className="sc-preset-row">
                      {TRIGGER_PRESETS.map(t => (
                        <button key={t} type="button" className="sc-preset-chip" onClick={() => addTriggerPreset(t)}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═════════ TAB 4: CHARACTERS ═════════ */}
          {activeTab === 'chars' && (
            <div className="sc-section-card">
              <div className="sc-chars-header">
                <div>
                  <div className="sc-section-title" style={{ margin: 0 }}>
                    <i className="fas fa-theater-masks" /> ตัวละครในเกม ({characters.length} คน)
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8ea6', marginTop: 4 }}>
                    มีรูปภาพแล้ว {charsWithImg} จาก {characters.length} คน · สามารถอัปโหลดไฟล์หรือวาง Google Drive URL ได้ทันที
                  </div>
                </div>
                <button
                  type="button"
                  className="sc-btn sc-btn-primary"
                  onClick={addCharacter}
                  style={{ padding: '8px 14px', fontSize: 12 }}
                >
                  <i className="fas fa-plus" /> เพิ่มตัวละคร
                </button>
              </div>

              {characters.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12 }}>
                  <i className="fas fa-users-slash" style={{ fontSize: 32, color: '#4f5068', marginBottom: 12 }} />
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>ยังไม่มีตัวละครในสคริปต์นี้</div>
                  <div style={{ color: '#8c8ea6', fontSize: 12, marginTop: 4, marginBottom: 16 }}>
                    เพิ่มตัวละครเพื่อให้ผู้เล่นสามารถเลือกบทบาทและดูโปรไฟล์ก่อนเริ่มเกมได้
                  </div>
                  <button type="button" className="sc-btn sc-btn-primary" onClick={addCharacter}>
                    <i className="fas fa-plus" /> เพิ่มตัวละครแรก
                  </button>
                </div>
              ) : (
                <div className="sc-char-grid">
                  {characters.map((char, idx) => (
                    <div key={idx} className="sc-char-card">
                      <button
                        type="button"
                        className="sc-char-del-btn"
                        onClick={() => removeCharacter(idx)}
                        title="ลบตัวละครนี้"
                      >
                        <i className="fas fa-trash-alt" />
                      </button>

                      {/* Avatar Column */}
                      <div className="sc-char-avatar-col">
                        {char.imageMode === 'url' ? (
                          <div className="sc-char-avatar-box">
                            {char.imagePreview ? (
                              <img src={char.imagePreview} alt="" className="sc-char-avatar-img" onError={e => e.currentTarget.style.display = 'none'} />
                            ) : (
                              <i className="fab fa-google-drive" style={{ color: '#6d6e88', fontSize: 22 }} />
                            )}
                          </div>
                        ) : (
                          <label className="sc-char-avatar-box">
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={e => handleCharacterImageChange(idx, e)}
                            />
                            {char.imagePreview ? (
                              <img src={char.imagePreview} alt="" className="sc-char-avatar-img" />
                            ) : (
                              <i className="fas fa-user" style={{ color: '#6d6e88', fontSize: 22 }} />
                            )}
                            <div className="sc-char-avatar-overlay">
                              <i className="fas fa-camera" />
                            </div>
                          </label>
                        )}

                        <div className="sc-char-mode-pill">
                          <button
                            type="button"
                            className={`sc-char-mode-btn ${char.imageMode !== 'url' ? 'active' : ''}`}
                            onClick={() => updateCharacter(idx, 'imageMode', 'file')}
                            title="อัปโหลดไฟล์รูปภาพ"
                          >
                            <i className="fas fa-upload" />
                          </button>
                          <button
                            type="button"
                            className={`sc-char-mode-btn ${char.imageMode === 'url' ? 'active' : ''}`}
                            onClick={() => updateCharacter(idx, 'imageMode', 'url')}
                            title="Google Drive URL"
                          >
                            <i className="fab fa-google-drive" />
                          </button>
                        </div>
                      </div>

                      {/* Info Fields Column */}
                      <div className="sc-char-body-col">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--crimson-500)', background: 'rgba(198,36,25,0.15)', padding: '2px 6px', borderRadius: 4 }}>
                            #{idx + 1}
                          </span>
                          <input
                            className="sc-input"
                            style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700 }}
                            placeholder="ชื่อตัวละคร..."
                            value={char.name}
                            onChange={e => updateCharacter(idx, 'name', e.target.value)}
                          />
                        </div>

                        <textarea
                          className="sc-textarea"
                          style={{ minHeight: 64, padding: '8px 10px', fontSize: 12 }}
                          placeholder="บทบาท / อาชีพ / ข้อมูลสังเขป..."
                          value={char.role}
                          onChange={e => updateCharacter(idx, 'role', e.target.value)}
                        />

                        {char.imageMode === 'url' && (
                          <input
                            className="sc-input"
                            style={{ padding: '6px 10px', fontSize: 11, color: '#8dd' }}
                            placeholder="วาง Google Drive URL..."
                            value={char.imageDriveUrl || ''}
                            onChange={e => handleCharacterDriveUrl(idx, e.target.value)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═════════ TAB 5: MEDIA & POSTER ═════════ */}
          {activeTab === 'media' && (
            <div className="sc-section-card">
              <div className="sc-section-title">
                <i className="fas fa-photo-video" /> ภาพหน้าปก & วิดีโอทีเซอร์
              </div>

              <div className="sc-media-grid">
                {/* Left: Cover Image */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <label className="sc-form-label">
                    <span>โปสเตอร์หน้าปกสคริปต์ (Cover Image)</span>
                    <span className="sc-label-sub">แนะนำอัตราส่วน 16:9 หรือ 3:4</span>
                  </label>

                  {/* Mode switcher tabs */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={`sc-btn ${imageMode === 'url' ? 'sc-btn-primary' : 'sc-btn-secondary'}`}
                      style={{ padding: '6px 14px', fontSize: 12 }}
                      onClick={() => { setImageMode('url'); setImageFile(null); }}
                    >
                      <i className="fab fa-google-drive" /> Google Drive Link
                    </button>
                    <button
                      type="button"
                      className={`sc-btn ${imageMode === 'file' ? 'sc-btn-primary' : 'sc-btn-secondary'}`}
                      style={{ padding: '6px 14px', fontSize: 12 }}
                      onClick={() => { setImageMode('file'); setImageDriveUrl(''); }}
                    >
                      <i className="fas fa-upload" /> อัปโหลดไฟล์ตรง
                    </button>
                  </div>

                  {imageMode === 'url' ? (
                    <div>
                      <div className="sc-input-wrap">
                        <i className="fab fa-google-drive sc-input-icon" />
                        <input
                          className="sc-input with-icon"
                          placeholder="วางลิงก์ Google Drive เช่น https://drive.google.com/file/d/..."
                          value={imageDriveUrl}
                          onChange={e => {
                            const val = e.target.value
                            setImageDriveUrl(val)
                            setImagePreview(convertImageUrl(val))
                            setConvertCopied(false)
                          }}
                        />
                      </div>

                      {imageDriveUrl && (() => {
                        const converted = convertImageUrl(imageDriveUrl)
                        if (converted === imageDriveUrl) return null
                        return (
                          <div className="sc-convert-box">
                            <div className="sc-convert-label">
                              <i className="fas fa-check-circle" /> แปลงเป็น CDN ความเร็วสูงแล้ว (wsrv.nl webp)
                            </div>
                            <div className="sc-convert-row">
                              <input className="sc-convert-input" readOnly value={converted} />
                              <button
                                type="button"
                                className={`sc-convert-copy ${convertCopied ? 'copied' : ''}`}
                                onClick={() => {
                                  navigator.clipboard.writeText(converted)
                                  setConvertCopied(true)
                                  setTimeout(() => setConvertCopied(false), 2000)
                                }}
                              >
                                <i className={`fas ${convertCopied ? 'fa-check' : 'fa-copy'}`} />
                                {convertCopied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <label style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      padding: '24px 16px', background: '#111117', border: '2px dashed rgba(255,255,255,0.15)',
                      borderRadius: 10, cursor: 'pointer', gap: 6, textAlign: 'center'
                    }}>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                      <i className="fas fa-image" style={{ fontSize: 28, color: '#ff574d' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>คลิกเพื่ออัปโหลดรูปภาพ</span>
                      <span style={{ fontSize: 11, color: '#7b7d99' }}>PNG, JPG, WEBP ขนาดไม่เกิน 5MB</span>
                    </label>
                  )}

                  {/* Poster Preview Card */}
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#9292a8', marginBottom: 8 }}>
                      พรีวิวการ์ดสคริปต์ (Preview on Catalog)
                    </div>
                    <div className="sc-media-preview-card">
                      {imagePreview ? (
                        <img src={imagePreview} alt="Cover Preview" onError={e => e.currentTarget.style.display = 'none'} />
                      ) : (
                        <div style={{ color: '#555670', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <i className="fas fa-image" style={{ fontSize: 24 }} />
                          <span>ยังไม่มีรูปภาพหน้าปก</span>
                        </div>
                      )}
                      <div className="sc-media-badge-overlay">
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                            {title || 'ชื่อสคริปต์'}
                          </div>
                          <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                            {players || '?' } คน · {time || '?'}
                          </div>
                        </div>
                        <span style={{
                          background: currentDiffObj.bg,
                          color: currentDiffObj.color,
                          border: `1px solid ${currentDiffObj.border}`,
                          fontSize: 10.5,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999
                        }}>
                          {currentDiffObj.label}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Teaser Video */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <label className="sc-form-label">
                    <span>วิดีโอตัวอย่าง (Teaser Video)</span>
                    <span className="sc-label-sub">MP4, MOV, WEBM (สูงสุด 50MB)</span>
                  </label>

                  <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '24px 16px', background: '#111117', border: '2px dashed rgba(255,255,255,0.15)',
                    borderRadius: 10, cursor: 'pointer', gap: 6, textAlign: 'center'
                  }}>
                    <input type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoChange} />
                    <i className="fas fa-video" style={{ fontSize: 28, color: '#38bdf8' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>คลิกเพื่อเลือกวิดีโอ</span>
                    <span style={{ fontSize: 11, color: '#7b7d99' }}>อัปโหลดวิดีโอตัวอย่างคดีเพื่อความตื่นเต้น</span>
                  </label>

                  {videoPreview && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#9292a8' }}>พรีวิววิดีโอ</span>
                        <button
                          type="button"
                          className="sc-preset-chip"
                          style={{ color: '#ef4444' }}
                          onClick={() => { setVideoFile(null); setVideoPreview(''); setCurrentVideoUrl(''); }}
                        >
                          นำวิดีโอออก
                        </button>
                      </div>
                      <div className="sc-media-preview-card" style={{ background: '#000' }}>
                        <video src={videoPreview} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── FOOTER ── */}
        <div className="sc-modal-footer">
          <div className="sc-footer-left">
            {prevTab && (
              <button
                type="button"
                className="sc-btn sc-btn-nav"
                onClick={() => setActiveTab(prevTab.id)}
              >
                <i className="fas fa-arrow-left" /> {prevTab.label}
              </button>
            )}
            {nextTab && (
              <button
                type="button"
                className="sc-btn sc-btn-nav"
                onClick={() => setActiveTab(nextTab.id)}
              >
                {nextTab.label} <i className="fas fa-arrow-right" />
              </button>
            )}
          </div>

          <div className="sc-footer-right">
            <button type="button" className="sc-btn sc-btn-secondary" onClick={onClose} disabled={saving}>
              ยกเลิก
            </button>
            <button type="button" className="sc-btn sc-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <i className="fas fa-spinner fa-spin" /> กำลังบันทึกข้อมูล...
                </>
              ) : (
                <>
                  <i className="fas fa-save" /> บันทึกสคริปต์
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
