import { useState, useEffect } from 'react'
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

export default function GameModal({ editingGame, onClose, showToast }) {
  const [title, setTitle] = useState('')
  const [players, setPlayers] = useState('')
  const [time, setTime] = useState('')
  const [fullPrice, setFullPrice] = useState('')
  const [payPrice, setPayPrice] = useState('')
  const [difficulty, setDifficulty] = useState('Normal')
  const [detective, setDetective] = useState('')
  const [roleplay, setRoleplay] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [trigger, setTrigger] = useState('')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [imageMode, setImageMode] = useState('file') // 'file' | 'url'
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

  const ALL_ROOMS = ['Waiting Area 1', 'Waiting Area 2', '404 Bar', 'Japanese Room', 'Chinese Room', 'Europe Room', 'Ghost Room', 'Projector Room', '5 Floor', 'Yang', 'Chinese DM', 'Thai DM']

  const toggleRoom = (room) => {
    setSelectedRooms(prev => {
      if (prev.includes(room)) {
        const next = prev.filter(r => r !== room)
        setMainRoom(m => m === room ? (next[0] || '') : m)
        return next
      }
      const next = [...prev, room]
      setMainRoom(m => m || room)
      return next
    })
  }

  useEffect(() => {
    if (editingGame) {
      setTitle(editingGame.title || '')
      setPlayers(editingGame.players || '')
      setTime(editingGame.time || '')
      setFullPrice(editingGame.fullPrice ?? editingGame.price ?? '')
      setPayPrice(editingGame.payPrice ?? editingGame.price ?? '')
      setDifficulty(editingGame.difficulty || 'Normal')
      setDetective(editingGame.detective || '')
      setRoleplay(editingGame.roleplay || '')
      setSynopsis(editingGame.synopsis || editingGame.description || '')
      setTrigger(editingGame.trigger || editingGame.triggerWarning || '')
      setTags(editingGame.tags || [])
      setDeposit(editingGame.deposit ?? '')
      setSelectedRooms(editingGame.rooms || [])
      setMainRoom(editingGame.mainRoom || (editingGame.rooms?.[0] ?? ''))
      setCurrentImageUrl(editingGame.image || '')
      setCurrentVideoUrl(editingGame.videoUrl || '')
      setCharacters((editingGame.characters || []).map(c => ({ ...c, imageFile: null, imagePreview: c.image ? convertImageUrl(c.image) : '' })))
      // if existing image is a Google Drive URL, show in URL mode
      const img = editingGame.image || ''
      if (img.includes('drive.google.com') || img.includes('googleusercontent.com') || img.includes('wsrv.nl')) {
        setImageMode('url')
        setImageDriveUrl(img)
        setImagePreview(convertImageUrl(img))
      } else {
        setImagePreview(img)
      }
      setVideoPreview(editingGame.videoUrl || '')
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

  const removeTag = (t) => setTags(prev => prev.filter(x => x !== t))

  const addCharacter = () =>
    setCharacters(prev => [...prev, { name: '', role: '', image: '', imageFile: null, imagePreview: '' }])

  const removeCharacter = (idx) =>
    setCharacters(prev => prev.filter((_, i) => i !== idx))

  const updateCharacter = (idx, field, value) =>
    setCharacters(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))

  const handleCharacterImageChange = (idx, e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { showToast('ไฟล์ใหญ่เกินไป (สูงสุด 5MB)', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => setCharacters(prev => prev.map((c, i) => i === idx ? { ...c, imageFile: file, imagePreview: ev.target.result } : c))
    reader.readAsDataURL(file)
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { showToast('ไฟล์ใหญ่เกินไป (สูงสุด 5MB)', 'error'); return }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleVideoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { showToast('ไฟล์ใหญ่เกินไป (สูงสุด 50MB)', 'error'); return }
    setVideoFile(file)
    setVideoPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!title.trim()) { showToast('กรุณากรอกชื่อเกม', 'error'); return }
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
        }
        savedChars.push({ name: char.name || '', role: char.role || '', image: imgUrl })
      }
      const data = {
        title: title.trim(), players, time,
        fullPrice: parseFloat(fullPrice) || 0,
        payPrice: parseFloat(payPrice) || 0,
        price: parseFloat(fullPrice) || 0,
        deposit: parseFloat(deposit) || 0,
        difficulty,
        detective: parseInt(detective) || 3,
        roleplay: parseInt(roleplay) || 3,
        synopsis: synopsis.trim(),
        trigger: trigger.trim(),
        tags, image: imageUrl, videoUrl,
        characters: savedChars,
        rooms: selectedRooms,
        mainRoom: mainRoom || selectedRooms[0] || '',
        updatedAt: serverTimestamp()
      }
      if (editingGame) {
        await updateDoc(doc(db, 'scripts', editingGame.id), data)
        showToast('อัปเดตสำเร็จ ✓')
      } else {
        data.createdAt = serverTimestamp()
        await addDoc(collection(db, 'scripts'), data)
        showToast('เพิ่มสคริปต์สำเร็จ ✓')
      }
      onClose()
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay open">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{editingGame ? 'แก้ไขสคริปต์' : 'เพิ่มสคริปต์ใหม่'}</div>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">ชื่อเกม *</label>
            <input className="form-input" placeholder="ชื่อสคริปต์" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">จำนวนผู้เล่น</label>
              <input className="form-input" placeholder="เช่น 6-10" value={players} onChange={e => setPlayers(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">เวลา</label>
              <input className="form-input" placeholder="เช่น 3-4 ชั่วโมง" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ราคาเต็ม ฿/คน <span style={{ fontWeight: 400, color: 'var(--text-secondary, #888)', fontSize: 11 }}>(โชว์ลูกค้า)</span></label>
              <input className="form-input" type="number" placeholder="0" value={fullPrice} onChange={e => setFullPrice(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">ราคาจ่าย ฿/คน <span style={{ fontWeight: 400, color: 'var(--text-secondary, #888)', fontSize: 11 }}>(คำนวณ POS)</span></label>
              <input className="form-input" type="number" placeholder="0" value={payPrice} onChange={e => setPayPrice(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">ราคามัดจำ ฿/คน <span style={{ fontWeight: 400, color: 'var(--text-secondary, #888)', fontSize: 11 }}>(ถ้ามี)</span></label>
            <input className="form-input" type="number" placeholder="0" value={deposit} onChange={e => setDeposit(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">ความยาก</label>
            <select className="form-select" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              <option value="Beginner">Beginner</option>
              <option value="Normal">Normal</option>
              <option value="Hard">Hard</option>
              <option value="Expert">Expert</option>
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">สืบสวน ★ (1-5)</label>
              <input className="form-input" type="number" min="1" max="5" placeholder="3" value={detective} onChange={e => setDetective(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">สวมบท ★ (1-5)</label>
              <input className="form-input" type="number" min="1" max="5" placeholder="3" value={roleplay} onChange={e => setRoleplay(e.target.value)} />
            </div>
          </div>
          {/* ── ROOMS ── */}
          <div className="form-group">
            <label className="form-label">ห้องที่เล่นได้ <span style={{ fontWeight: 400, color: 'var(--text-secondary, #888)', fontSize: 11 }}>(เลือกได้หลายห้อง)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {ALL_ROOMS.map(room => {
                const selected = selectedRooms.includes(room)
                const isMain = mainRoom === room
                return (
                  <button
                    key={room}
                    type="button"
                    onClick={() => toggleRoom(room)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      background: selected ? (isMain ? 'var(--crimson-500)' : 'rgba(198,36,25,0.12)') : 'var(--surface-card)',
                      color: selected ? (isMain ? '#fff' : 'var(--crimson-500)') : 'var(--text-secondary)',
                      border: `1.5px solid ${selected ? 'var(--crimson-500)' : 'var(--border-default)'}`,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {isMain && <i className="fas fa-crown" style={{ fontSize: 10 }} />}
                    {room}
                  </button>
                )
              })}
            </div>
            {selectedRooms.length > 1 && (
              <div style={{ marginTop: 12 }}>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 6 }}>ห้องหลัก <span style={{ fontWeight: 400, color: 'var(--text-secondary, #888)' }}>(1 ห้องเสมอ)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedRooms.map(room => (
                    <button
                      key={room}
                      type="button"
                      onClick={() => setMainRoom(room)}
                      style={{
                        padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                        background: mainRoom === room ? 'var(--crimson-500)' : 'var(--surface-card)',
                        color: mainRoom === room ? '#fff' : 'var(--text-secondary)',
                        border: `1.5px solid ${mainRoom === room ? 'var(--crimson-500)' : 'var(--border-default)'}`,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {mainRoom === room && <i className="fas fa-crown" style={{ fontSize: 10 }} />}
                      {room}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">แท็ก (กด Enter เพื่อเพิ่ม)</label>
            <div className="tags-input-wrap" onClick={e => e.currentTarget.querySelector('input')?.focus()}>
              {tags.map(t => (
                <div key={t} className="tag-pill">
                  {t} <span className="tag-pill-remove" onClick={() => removeTag(t)}>✕</span>
                </div>
              ))}
              <input
                className="tags-text-input"
                placeholder="เช่น Horror, Drama..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">เรื่องย่อ (Synopsis)</label>
            <textarea className="form-textarea" placeholder="บรรยายเนื้อเรื่องโดยย่อ..." value={synopsis} onChange={e => setSynopsis(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Trigger Warning</label>
            <textarea className="form-textarea" placeholder="คำเตือนพิเศษสำหรับผู้เล่น..." style={{ minHeight: '70px' }} value={trigger} onChange={e => setTrigger(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">รูปภาพ</label>
            <div className="img-mode-tabs">
              <button
                type="button"
                className={`img-mode-tab${imageMode === 'file' ? ' active' : ''}`}
                onClick={() => { setImageMode('file'); setImageDriveUrl('') }}
              >
                <i className="fas fa-upload" /> อัปโหลดไฟล์
              </button>
              <button
                type="button"
                className={`img-mode-tab${imageMode === 'url' ? ' active' : ''}`}
                onClick={() => { setImageMode('url'); setImageFile(null) }}
              >
                <i className="fab fa-google-drive" /> Google Drive URL
              </button>
            </div>
            {imageMode === 'file' ? (
              <label className="upload-area">
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                <div className="upload-icon"><i className="fas fa-image" /></div>
                <div className="upload-text">คลิกเพื่ออัปโหลดรูปภาพ</div>
                <div className="upload-sub">PNG, JPG, WEBP · สูงสุด 5MB</div>
              </label>
            ) : (
              <div>
                <input
                  className="form-input"
                  placeholder="วาง Google Drive URL เช่น https://drive.google.com/file/d/..."
                  value={imageDriveUrl}
                  onChange={e => {
                    setImageDriveUrl(e.target.value)
                    setImagePreview(convertImageUrl(e.target.value))
                    setConvertCopied(false)
                  }}
                />
                {imageDriveUrl && (() => {
                  const converted = convertImageUrl(imageDriveUrl)
                  if (converted === imageDriveUrl) return null
                  return (
                    <div className="drive-convert-box">
                      <div className="drive-convert-label"><i className="fas fa-check-circle" style={{ color: 'var(--feedback-success-icon)', marginRight: 5 }} />URL ที่แปลงแล้ว (พร้อมใช้งาน)</div>
                      <div className="drive-convert-row">
                        <input className="drive-convert-input" readOnly value={converted} />
                        <button
                          type="button"
                          className={`drive-convert-copy-btn${convertCopied ? ' copied' : ''}`}
                          onClick={() => {
                            navigator.clipboard.writeText(converted)
                            setConvertCopied(true)
                            setTimeout(() => setConvertCopied(false), 2000)
                          }}
                        >
                          <i className={`fas ${convertCopied ? 'fa-check' : 'fa-copy'}`} />
                          {convertCopied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
            {imagePreview && <img src={imagePreview} className="preview-img" alt="" onError={e => e.currentTarget.style.display = 'none'} />}
          </div>
          {/* ── CHARACTERS ── */}
          <div className="form-group">
            <div className="char-section-header">
              <label className="form-label" style={{ margin: 0 }}>ตัวละครในเกม</label>
              <button type="button" className="char-add-btn" onClick={addCharacter}>
                <i className="fas fa-plus" /> เพิ่มตัวละคร
              </button>
            </div>
            {characters.map((char, idx) => (
              <div key={idx} className="char-item">
                <div className="char-item-img-wrap">
                  <label className="char-img-upload">
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleCharacterImageChange(idx, e)} />
                    {char.imagePreview
                      ? <img src={char.imagePreview} alt="" className="char-img-preview" />
                      : <div className="char-img-placeholder"><i className="fas fa-user" /></div>
                    }
                    <div className="char-img-overlay"><i className="fas fa-camera" /></div>
                  </label>
                </div>
                <div className="char-item-fields">
                  <input
                    className="form-input"
                    placeholder="ชื่อตัวละคร"
                    value={char.name}
                    onChange={e => updateCharacter(idx, 'name', e.target.value)}
                  />
                  <textarea
                    className="form-textarea"
                    placeholder="ข้อมูลตัวละคร / บทบาท"
                    style={{ minHeight: '60px' }}
                    value={char.role}
                    onChange={e => updateCharacter(idx, 'role', e.target.value)}
                  />
                </div>
                <button type="button" className="char-remove-btn" onClick={() => removeCharacter(idx)}>
                  <i className="fas fa-times" />
                </button>
              </div>
            ))}
            {characters.length === 0 && (
              <div className="char-empty">ยังไม่มีตัวละคร กด "เพิ่มตัวละคร" เพื่อเริ่ม</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">วิดีโอ (ตัวอย่าง)</label>
            <label className="upload-area">
              <input type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoChange} />
              <div className="upload-icon"><i className="fas fa-video" /></div>
              <div className="upload-text">คลิกเพื่ออัปโหลดวิดีโอ</div>
              <div className="upload-sub">MP4, MOV, WEBM · สูงสุด 50MB</div>
            </label>
            {videoPreview && (
              <video src={videoPreview} controls className="video-preview" />
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline-red" onClick={onClose}>ยกเลิก</button>
          <button className="btn-full-red" onClick={handleSave} disabled={saving}>
            {saving
              ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
              : <><i className="fas fa-save" /> บันทึก</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
