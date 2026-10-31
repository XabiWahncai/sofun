import React, { useState, useEffect, useMemo } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { convertImageUrl } from '../utils/imageUrl'

const fmtThaiDate = (v) => {
  if (!v) return '—'
  let d = null
  if (v instanceof Date) d = v
  else if (v?.toDate) d = v.toDate()
  else if (v?.seconds) d = new Date(v.seconds * 1000)
  else {
    d = new Date(v)
    if (isNaN(d.getTime())) return '—'
  }
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

export default function RehistoryPage({
  lineUser,
  allGames = [],
  showToast,
  showPage,
  handleLineLogin
}) {
  const [activeTab, setActiveTab] = useState('record') // 'record' | 'saved'
  const [savedHistory, setSavedHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  // Character selection modal state
  const [activeModalGame, setActiveModalGame] = useState(null)
  const [selectedChar, setSelectedChar] = useState(null)
  const [saving, setSaving] = useState(false)

  // Search filter
  const [search, setSearch] = useState('')

  // Map games by ID and Title for rapid lookup
  const gameMap = useMemo(() => {
    const map = new Map()
    allGames.forEach(g => {
      if (g.id) map.set(String(g.id), g)
      if (g._id) map.set(String(g._id), g)
      if (g.title) map.set(g.title.trim().toLowerCase(), g)
    })
    return map
  }, [allGames])

  // Helper: Extract valid game cover
  const getGameCover = (game) => {
    if (!game) return '/Logo.png'
    const raw = game.image || game.coverImage || game.cover || game.thumbnail || ''
    return raw ? convertImageUrl(raw, 400) : '/Logo.png'
  }

  // Helper: Extract valid character portrait
  const getCharImage = (char) => {
    if (!char) return null
    const raw = char.image || char.imageDriveUrl || char.imagePreview || ''
    return raw ? convertImageUrl(raw, 340) : null
  }

  // Real-time listener for user play history
  useEffect(() => {
    if (!lineUser?.uid) {
      setLoadingHistory(false)
      setSavedHistory([])
      return
    }

    setLoadingHistory(true)
    const q = query(
      collection(db, 'playHistory'),
      where('userId', '==', lineUser.uid)
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }))

        // Sort descending by playedAt or createdAt
        items.sort((a, b) => {
          const tA = a.playedAt?.seconds || a.createdAt?.seconds || 0
          const tB = b.playedAt?.seconds || b.createdAt?.seconds || 0
          return tB - tA
        })

        setSavedHistory(items)
        setLoadingHistory(false)
      },
      (err) => {
        console.error('Failed to load playHistory in RehistoryPage:', err)
        setLoadingHistory(false)
      }
    )

    return () => unsub()
  }, [lineUser?.uid])

  // Map of played characters per game to highlight in UI
  const playedCharsByGame = useMemo(() => {
    const map = new Map()
    savedHistory.forEach(item => {
      const sid = item.scriptId ? String(item.scriptId) : null
      const title = item.scriptTitle ? item.scriptTitle.trim().toLowerCase() : null
      const keys = [sid, title].filter(Boolean)
      keys.forEach(k => {
        if (!map.has(k)) map.set(k, [])
        if (item.character && item.character !== '—') {
          map.get(k).push(item.character)
        }
      })
    })
    return map
  }, [savedHistory])

  // Handle single record deletion
  const handleDelete = async (item) => {
    const title = item.scriptTitle || 'คดีนี้'
    const charName = item.character ? ` (ตัวละคร: ${item.character})` : ''
    if (!window.confirm(`ยืนยันการลบประวัติย้อนหลัง "${title}${charName}" หรือไม่?`)) return

    setDeletingId(item.id)
    try {
      await deleteDoc(doc(db, 'playHistory', item.id))
      if (showToast) showToast('ลบประวัติย้อนหลังสำเร็จ', 'success')
    } catch (err) {
      console.error('Delete retroactive history error:', err)
      const errMsg = err?.message || 'เกิดข้อผิดพลาดในการลบ'
      if (showToast) showToast(`ลบล้มเหลว: ${errMsg}`, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // Filter games for selection
  const filteredGames = useMemo(() => {
    const active = allGames.filter(g => !g.isDeleted && !g.archived)
    if (!search.trim()) return active
    const q = search.trim().toLowerCase()
    return active.filter(g =>
      (g.title && g.title.toLowerCase().includes(q)) ||
      (g.category && g.category.toLowerCase().includes(q)) ||
      (Array.isArray(g.tags) && g.tags.some(t => t.toLowerCase().includes(q)))
    )
  }, [allGames, search])

  // Open character pop-up modal for a game
  const handleOpenGameModal = (game) => {
    setActiveModalGame(game)
    setSelectedChar(null)
  }

  // Close modal
  const handleCloseModal = () => {
    if (saving) return
    setActiveModalGame(null)
    setSelectedChar(null)
  }

  // Save selected character record
  const handleConfirmSave = async () => {
    if (!activeModalGame || !selectedChar) return
    if (!lineUser?.uid) {
      if (showToast) showToast('กรุณาเข้าสู่ระบบ LINE ก่อนบันทึก', 'error')
      return
    }

    setSaving(true)
    try {
      const charImg = selectedChar.image || selectedChar.imageDriveUrl || selectedChar.imagePreview || ''

      await addDoc(collection(db, 'playHistory'), {
        userId: lineUser.uid,
        userName: lineUser.name || 'สมาชิก',
        userAvatar: lineUser.avatar || '',
        scriptId: activeModalGame.id,
        scriptTitle: activeModalGame.title,
        character: selectedChar.name,
        characterImage: charImg,
        isRetroactive: true,
        source: 'rehistory',
        recordedBy: 'rehistory',
        excludeFromWheel: true,
        playedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      })

      if (showToast) {
        showToast(`บันทึกประวัติ "${activeModalGame.title}" ตัวละคร "${selectedChar.name}" สำเร็จ`, 'success')
      }
      handleCloseModal()
    } catch (err) {
      console.error('Save character error:', err)
      if (showToast) showToast(`บันทึกล้มเหลว: ${err?.message || 'เกิดข้อผิดพลาด'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Escape key to close modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && activeModalGame && !saving) {
        handleCloseModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeModalGame, saving])

  // Not logged in view
  if (!lineUser) {
    return (
      <div className="rehistory-container">
        <div className="rehistory-header">
          <div className="rehistory-title-block">
            <div className="rehistory-title-row">
              <i className="fas fa-history rehistory-main-icon" />
              <h1 className="rehistory-title">บันทึกประวัติการเล่นย้อนหลัง</h1>
            </div>
            <p className="rehistory-subtitle">
              เลือกคดีและตัวละครที่คุณเคยเล่นที่ร้าน เพื่อสะสมสถิติในโปรไฟล์ของคุณ (1 เกมบันทึกได้หลายรอบเมื่อเล่นตัวละครใหม่)
            </p>
          </div>
        </div>

        <div className="rehistory-auth-prompt">
          <i className="fas fa-user-lock rehistory-auth-icon" />
          <h3>กรุณาเข้าสู่ระบบ LINE สมาชิก</h3>
          <p>เข้าสู่ระบบเพื่อดูประวัติการเล่นย้อนหลังและบันทึกคดีที่คุณเคยเล่น</p>
          {handleLineLogin && (
            <button className="rehistory-line-login-btn" onClick={handleLineLogin}>
              <i className="fab fa-line" /> เข้าสู่ระบบด้วย LINE
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rehistory-container">
      {/* Top Header */}
      <div className="rehistory-header">
        <div className="rehistory-title-block">
          <div className="rehistory-title-row">
            <i className="fas fa-history rehistory-main-icon" />
            <h1 className="rehistory-title">บันทึกประวัติการเล่นย้อนหลัง</h1>
          </div>
          <p className="rehistory-subtitle">
            แตะที่คดีเพื่อเปิดเลือกตัวละครที่เคยรับบท ไม่ต้องกรอกวันที่เล่น และสามารถบันทึกเกมเดิมซ้ำได้เมื่อเล่นตัวละครใหม่
          </p>
        </div>

        {/* Member profile badge */}
        <div className="rehistory-user-badge">
          {lineUser.avatar ? (
            <img src={lineUser.avatar} alt="" className="rehistory-user-avatar" />
          ) : (
            <div className="rehistory-user-avatar-ph">
              {(lineUser.name || 'M')[0]}
            </div>
          )}
          <div className="rehistory-user-info">
            <div className="rehistory-user-name">{lineUser.name || 'สมาชิก'}</div>
            <div className="rehistory-user-status">
              <i className="fab fa-line" /> บัญชีสมาชิก
            </div>
          </div>
        </div>
      </div>

      {/* System Policy Alert Box */}
      <div className="rehistory-notice-box">
        <i className="fas fa-circle-info rehistory-notice-icon" />
        <span className="rehistory-notice-text">
          ข้อกำหนดระบบ: ประวัติย้อนหลังนี้ใช้สำหรับสะสมสถิติคดีและฉากจบในโปรไฟล์ของคุณ โดยจะไม่นำไปนับสิทธิ์การหมุนวงล้อรางวัล
        </span>
      </div>

      {/* Navigation Pills */}
      <div className="rehistory-tabs-row">
        <button
          type="button"
          className={`rehistory-tab-btn ${activeTab === 'record' ? 'active' : ''}`}
          onClick={() => setActiveTab('record')}
        >
          <i className="fas fa-plus-circle" />
          <span>เลือกเกมเพื่อบันทึก</span>
        </button>

        <button
          type="button"
          className={`rehistory-tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          <i className="fas fa-list-check" />
          <span>ประวัติที่บันทึกแล้ว ({savedHistory.length})</span>
        </button>
      </div>

      {/* ════════════ TAB 1: RECORD GAMES ════════════ */}
      {activeTab === 'record' && (
        <div className="rehistory-record-section">
          {/* Search toolbar */}
          <div className="rehistory-record-toolbar">
            <div className="rehistory-search-box">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="ค้นหาชื่อคดี หรือหมวดหมู่..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="rehistory-search-clear"
                  onClick={() => setSearch('')}
                >
                  <i className="fas fa-times" />
                </button>
              )}
            </div>
          </div>

          {/* Games list for selection */}
          <div className="rehistory-games-select-grid">
            {filteredGames.map(game => {
              const coverUrl = getGameCover(game)
              const charList = Array.isArray(game.characters) ? game.characters.filter(c => c && c.name) : []
              const playedList = playedCharsByGame.get(String(game.id)) ||
                (game.title ? playedCharsByGame.get(game.title.trim().toLowerCase()) : null) || []
              const playedCount = playedList.length

              return (
                <div
                  key={game.id}
                  className={`rehistory-select-game-card ${playedCount > 0 ? 'has-played' : ''}`}
                  onClick={() => handleOpenGameModal(game)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="rehistory-select-poster-wrap">
                    <img
                      src={coverUrl}
                      alt={game.title}
                      className="rehistory-select-poster"
                      loading="lazy"
                      onError={(e) => { e.currentTarget.src = '/Logo.png' }}
                    />
                    {playedCount > 0 && (
                      <span className="rehistory-played-pill">
                        <i className="fas fa-check" /> เล่นแล้ว {playedCount} รอบ
                      </span>
                    )}
                  </div>

                  <div className="rehistory-select-info">
                    <div className="rehistory-select-title" title={game.title}>
                      {game.title}
                    </div>

                    <div className="rehistory-select-meta">
                      {game.players && (
                        <span><i className="fas fa-users" /> {game.players} คน</span>
                      )}
                      <span><i className="fas fa-masks-theater" /> {charList.length} ตัวละคร</span>
                    </div>

                    {playedCount > 0 && (
                      <div className="rehistory-played-char-names">
                        เคยเล่น: {playedList.join(', ')}
                      </div>
                    )}

                    <div className="rehistory-tap-action-btn">
                      <i className="fas fa-user-plus" />
                      <span>แตะเพื่อเลือกตัวละคร</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ════════════ TAB 2: SAVED HISTORY LIST ════════════ */}
      {activeTab === 'saved' && (
        <div className="rehistory-saved-section">
          {loadingHistory ? (
            <div className="rehistory-loading">
              <div className="spinner" />
              <span>กำลังโหลดประวัติการเล่น...</span>
            </div>
          ) : savedHistory.length === 0 ? (
            <div className="rehistory-empty-card">
              <i className="fas fa-scroll rehistory-empty-icon" />
              <h3>ยังไม่มีประวัติการเล่นที่บันทึกไว้</h3>
              <p>แตะที่แท็บ "เลือกเกมเพื่อบันทึก" ด้านบนเพื่อเริ่มบันทึกคดีที่คุณเคยเล่น</p>
              <button
                type="button"
                className="rehistory-start-record-btn"
                onClick={() => setActiveTab('record')}
              >
                <i className="fas fa-plus-circle" /> เริ่มบันทึกคดีย้อนหลัง
              </button>
            </div>
          ) : (
            <div className="rehistory-grid">
              {savedHistory.map(item => {
                const isRetro = item.isRetroactive === true || item.source === 'rehistory' || item.recordedBy === 'rehistory'
                const matchingGame = gameMap.get(item.scriptId) ||
                  (item.scriptTitle ? gameMap.get(item.scriptTitle.trim().toLowerCase()) : null)

                const coverUrl = getGameCover(matchingGame)
                const charImg = item.characterImage ? convertImageUrl(item.characterImage, 140) : null

                return (
                  <div key={item.id} className="rehistory-card">
                    <img
                      src={coverUrl}
                      alt={item.scriptTitle || 'Game'}
                      className="rehistory-card-poster"
                      onError={(e) => { e.currentTarget.src = '/Logo.png' }}
                    />

                    <div className="rehistory-card-body">
                      <div className="rehistory-card-title" title={item.scriptTitle || 'คดี'}>
                        {item.scriptTitle || matchingGame?.title || 'ไม่ระบุชื่อคดี'}
                      </div>

                      <div className="rehistory-card-row character-row">
                        {charImg ? (
                          <img
                            src={charImg}
                            alt=""
                            className="rehistory-char-inline-avatar"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <i className="fas fa-mask rehistory-card-icon mask-icon" />
                        )}
                        <span className="character-label">ตัวละคร:</span>
                        <span className="character-name">
                          {item.character && item.character !== '—' ? item.character : '—'}
                        </span>
                      </div>

                      <div className="rehistory-card-row meta-row">
                        <span className="rehistory-card-date">
                          <i className="fas fa-calendar-days" />
                          {fmtThaiDate(item.playedAt || item.createdAt)}
                        </span>

                        {isRetro && (
                          <span className="rehistory-tag-retro">บันทึกย้อนหลัง</span>
                        )}
                      </div>
                    </div>

                    {isRetro && (
                      <button
                        type="button"
                        className="rehistory-delete-btn"
                        title="ลบประวัติย้อนหลังนี้"
                        disabled={deletingId === item.id}
                        onClick={() => handleDelete(item)}
                      >
                        {deletingId === item.id ? (
                          <i className="fas fa-spinner fa-spin" />
                        ) : (
                          <i className="fas fa-trash" />
                        )}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════ POPUP MODAL: CHARACTER SELECTION ════════════ */}
      {activeModalGame && (
        <div className="rehistory-modal-overlay" onClick={handleCloseModal}>
          <div
            className="rehistory-modal-content"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="rehistory-modal-header">
              <div className="rehistory-modal-game-info">
                <img
                  src={getGameCover(activeModalGame)}
                  alt={activeModalGame.title}
                  className="rehistory-modal-game-poster"
                  onError={(e) => { e.currentTarget.src = '/Logo.png' }}
                />
                <div>
                  <h2 className="rehistory-modal-title">{activeModalGame.title}</h2>
                  <div className="rehistory-modal-subtitle">
                    เลือกตัวละครที่คุณเคยเล่นในคดีนี้ (ห้ามระบุเอง)
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="rehistory-modal-close-btn"
                onClick={handleCloseModal}
                disabled={saving}
                aria-label="Close"
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {/* Modal Body: Characters Grid */}
            <div className="rehistory-modal-body">
              {Array.isArray(activeModalGame.characters) && activeModalGame.characters.length > 0 ? (
                <div className="rehistory-modal-chars-grid">
                  {activeModalGame.characters.filter(c => c && c.name).map((char, idx) => {
                    const isSelected = selectedChar?.name === char.name
                    const charImg = getCharImage(char)
                    const playedList = playedCharsByGame.get(String(activeModalGame.id)) ||
                      (activeModalGame.title ? playedCharsByGame.get(activeModalGame.title.trim().toLowerCase()) : null) || []
                    const wasPlayed = playedList.includes(char.name)

                    return (
                      <div
                        key={idx}
                        className={`rehistory-modal-char-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedChar(char)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="rehistory-modal-char-photo-wrap">
                          {charImg ? (
                            <img
                              src={charImg}
                              alt={char.name}
                              className="rehistory-modal-char-photo"
                              loading="lazy"
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          ) : (
                            <div className="rehistory-modal-char-ph">
                              <i className="fas fa-user" />
                            </div>
                          )}
                          <div className="rehistory-modal-char-gradient" />

                          {/* Selected Checkmark Badge */}
                          {isSelected && (
                            <span className="rehistory-char-selected-check">
                              <i className="fas fa-check" />
                            </span>
                          )}

                          {/* Previously played tag */}
                          {wasPlayed && !isSelected && (
                            <span className="rehistory-char-history-badge">
                              <i className="fas fa-check-double" /> เคยเล่นแล้ว
                            </span>
                          )}
                        </div>

                        <div className="rehistory-modal-char-info">
                          <div className="rehistory-modal-char-name">{char.name}</div>
                          {char.role && (
                            <div className="rehistory-modal-char-role">{char.role}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rehistory-modal-no-chars">
                  <i className="fas fa-circle-exclamation" />
                  <span>ยังไม่มีข้อมูลตัวละครในระบบสำหรับคดีนี้</span>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="rehistory-modal-footer">
              <button
                type="button"
                className="rehistory-modal-btn-cancel"
                onClick={handleCloseModal}
                disabled={saving}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                className="rehistory-modal-btn-confirm"
                disabled={!selectedChar || saving}
                onClick={handleConfirmSave}
              >
                {saving ? (
                  <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                ) : selectedChar ? (
                  <><i className="fas fa-check" /> ยืนยันบันทึก: {selectedChar.name}</>
                ) : (
                  'แตะเลือกตัวละครด้านบน'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Styles */}
      <style>{`
        .rehistory-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 16px 80px 16px;
          min-height: calc(100vh - 120px);
        }

        .rehistory-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 20px;
        }

        .rehistory-title-block {
          flex: 1;
          min-width: 280px;
        }

        .rehistory-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 6px;
        }

        .rehistory-main-icon {
          color: #dc2626;
          font-size: 24px;
        }

        .rehistory-title {
          font-size: 22px;
          font-weight: 900;
          color: var(--text-primary, #111827);
          margin: 0;
          letter-spacing: -0.02em;
        }

        .rehistory-subtitle {
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
          margin: 0;
          line-height: 1.5;
        }

        .rehistory-user-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 14px;
          border-radius: 12px;
          background: var(--surface-card, #ffffff);
          border: 1px solid var(--border-default, #e5e7eb);
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .rehistory-user-avatar {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          object-fit: cover;
        }

        .rehistory-user-avatar-ph {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: #dc2626;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 16px;
        }

        .rehistory-user-name {
          font-size: 13.5px;
          font-weight: 800;
          color: var(--text-primary, #111827);
        }

        .rehistory-user-status {
          font-size: 11px;
          font-weight: 700;
          color: #16a34a;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .rehistory-notice-box {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 12px;
          background: #fefce8;
          border: 1px solid #fde68a;
          margin-bottom: 22px;
          font-size: 12.5px;
          line-height: 1.5;
          color: #92400e;
        }

        .rehistory-notice-icon {
          color: #d97706;
          font-size: 16px;
          flex-shrink: 0;
        }

        .rehistory-tabs-row {
          display: flex;
          gap: 10px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .rehistory-tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid var(--border-default, #e5e7eb);
          background: var(--surface-card, #f9fafb);
          color: var(--text-secondary, #4b5563);
          transition: all 0.15s ease;
        }

        .rehistory-tab-btn:hover {
          background: #f3f4f6;
        }

        .rehistory-tab-btn.active {
          background: #b91c1c;
          border-color: #b91c1c;
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(185, 28, 28, 0.25);
        }

        /* ── Games Select Grid ── */
        .rehistory-record-toolbar {
          margin-bottom: 20px;
        }

        .rehistory-search-box {
          position: relative;
          max-width: 480px;
        }

        .rehistory-search-box i.fa-search {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
          font-size: 13px;
        }

        .rehistory-search-box input {
          width: 100%;
          padding: 10px 36px 10px 38px;
          border-radius: 12px;
          border: 1px solid var(--border-default, #e5e7eb);
          background: var(--surface-card, #ffffff);
          color: var(--text-primary, #111827);
          font-size: 13.5px;
          outline: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }

        .rehistory-search-box input:focus {
          border-color: #dc2626;
        }

        .rehistory-search-clear {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
        }

        .rehistory-games-select-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .rehistory-select-game-card {
          display: flex;
          gap: 14px;
          background: var(--surface-card, #ffffff);
          border: 1.5px solid var(--border-default, #e5e7eb);
          border-radius: 14px;
          padding: 12px;
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
          position: relative;
        }

        .rehistory-select-game-card:hover {
          transform: translateY(-2px);
          border-color: #dc2626;
          box-shadow: 0 6px 18px rgba(0,0,0,0.06);
        }

        .rehistory-select-game-card.has-played {
          border-color: rgba(220, 38, 38, 0.4);
          background: #fffcfc;
        }

        .rehistory-select-poster-wrap {
          position: relative;
          width: 76px;
          height: 104px;
          flex-shrink: 0;
          border-radius: 10px;
          overflow: hidden;
          background: #1f2937;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        }

        .rehistory-select-poster {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .rehistory-played-pill {
          position: absolute;
          bottom: 4px;
          left: 4px;
          right: 4px;
          background: rgba(22, 163, 74, 0.95);
          color: #ffffff;
          font-size: 9.5px;
          font-weight: 800;
          padding: 2px 4px;
          border-radius: 6px;
          text-align: center;
          backdrop-filter: blur(4px);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rehistory-select-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .rehistory-select-title {
          font-size: 14.5px;
          font-weight: 800;
          color: var(--text-primary, #111827);
          line-height: 1.35;
          margin-bottom: 4px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .rehistory-select-meta {
          display: flex;
          gap: 10px;
          font-size: 11.5px;
          color: var(--text-tertiary, #6b7280);
          font-weight: 600;
          margin-bottom: 6px;
        }

        .rehistory-played-char-names {
          font-size: 11px;
          color: #16a34a;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 6px;
        }

        .rehistory-tap-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 800;
          color: #dc2626;
          background: rgba(220, 38, 38, 0.08);
          padding: 4px 10px;
          border-radius: 8px;
          width: fit-content;
        }

        /* ── Saved History Tab ── */
        .rehistory-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .rehistory-card {
          display: flex;
          align-items: center;
          background: var(--surface-card, #ffffff);
          border: 1px solid var(--border-default, #e5e7eb);
          border-radius: 14px;
          padding: 12px 14px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.03);
          gap: 12px;
          position: relative;
        }

        .rehistory-card-poster {
          width: 58px;
          height: 78px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,0.12);
          background: #1f2937;
        }

        .rehistory-card-body {
          flex: 1;
          min-width: 0;
        }

        .rehistory-card-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--text-primary, #111827);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }

        .rehistory-card-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          line-height: 1.4;
        }

        .character-row {
          color: #dc2626;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .rehistory-char-inline-avatar {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          object-fit: cover;
          border: 1px solid #e5e7eb;
        }

        .mask-icon {
          font-size: 11px;
        }

        .character-label {
          color: #dc2626;
        }

        .character-name {
          color: var(--text-primary, #374151);
          font-weight: 700;
        }

        .meta-row {
          color: var(--text-tertiary, #6b7280);
          font-size: 11px;
          gap: 8px;
          flex-wrap: wrap;
        }

        .rehistory-card-date {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .rehistory-tag-retro {
          background: #fef3c7;
          color: #b45309;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 9999px;
          border: 1px solid #fde68a;
        }

        .rehistory-delete-btn {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #dc2626;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s ease;
        }

        .rehistory-delete-btn:hover {
          background: #fecaca;
        }

        .rehistory-delete-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* ── Empty State ── */
        .rehistory-empty-card {
          text-align: center;
          padding: 60px 20px;
          background: var(--surface-card, #ffffff);
          border: 1px dashed var(--border-default, #e5e7eb);
          border-radius: 16px;
        }

        .rehistory-empty-icon {
          font-size: 40px;
          color: #9ca3af;
          margin-bottom: 14px;
        }

        .rehistory-empty-card h3 {
          font-size: 17px;
          font-weight: 800;
          color: var(--text-primary, #111827);
          margin-bottom: 6px;
        }

        .rehistory-empty-card p {
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
          margin-bottom: 18px;
        }

        .rehistory-start-record-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 20px;
          border-radius: 9999px;
          background: #b91c1c;
          color: #ffffff;
          font-weight: 800;
          font-size: 13.5px;
          border: none;
          cursor: pointer;
        }

        .rehistory-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 60px 0;
          color: var(--text-secondary, #6b7280);
          font-size: 13px;
        }

        /* ── Character Selection Modal ── */
        .rehistory-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: rehistory-fade-in 0.2s ease-out;
        }

        @keyframes rehistory-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .rehistory-modal-content {
          background: #ffffff;
          width: 100%;
          max-width: 680px;
          max-height: 90vh;
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
          animation: rehistory-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes rehistory-scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .rehistory-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 20px;
          border-bottom: 1px solid #f1f5f9;
          background: #ffffff;
          gap: 14px;
        }

        .rehistory-modal-game-info {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }

        .rehistory-modal-game-poster {
          width: 48px;
          height: 64px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }

        .rehistory-modal-title {
          font-size: 17px;
          font-weight: 900;
          color: #0f172a;
          margin: 0 0 2px 0;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rehistory-modal-subtitle {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }

        .rehistory-modal-close-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .rehistory-modal-close-btn:hover {
          background: #fee2e2;
          color: #dc2626;
          border-color: #fca5a5;
        }

        .rehistory-modal-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          background: #f8fafc;
        }

        .rehistory-modal-chars-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
          gap: 14px;
        }

        .rehistory-modal-char-card {
          background: #ffffff;
          border: 2px solid #e2e8f0;
          border-radius: 14px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
          display: flex;
          flex-direction: column;
          user-select: none;
        }

        .rehistory-modal-char-card:hover {
          transform: translateY(-3px);
          border-color: #cbd5e1;
          box-shadow: 0 6px 16px rgba(0,0,0,0.06);
        }

        .rehistory-modal-char-card.selected {
          border-color: #dc2626;
          box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.25), 0 8px 20px rgba(220, 38, 38, 0.15);
          transform: translateY(-3px);
        }

        .rehistory-modal-char-photo-wrap {
          position: relative;
          aspect-ratio: 3 / 4;
          width: 100%;
          background: #0f172a;
          overflow: hidden;
        }

        .rehistory-modal-char-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .rehistory-modal-char-ph {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #475569;
          font-size: 32px;
        }

        .rehistory-modal-char-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 60%);
          pointer-events: none;
        }

        .rehistory-char-selected-check {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #dc2626;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          border: 2px solid #ffffff;
        }

        .rehistory-char-history-badge {
          position: absolute;
          bottom: 6px;
          left: 6px;
          right: 6px;
          background: rgba(22, 163, 74, 0.92);
          color: #ffffff;
          font-size: 9.5px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 6px;
          text-align: center;
          backdrop-filter: blur(4px);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rehistory-modal-char-info {
          padding: 10px 8px;
          text-align: center;
          background: #ffffff;
        }

        .rehistory-modal-char-name {
          font-size: 13px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rehistory-modal-char-role {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rehistory-modal-no-chars {
          text-align: center;
          padding: 40px 20px;
          color: #94a3b8;
          font-size: 13px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .rehistory-modal-footer {
          padding: 14px 20px;
          border-top: 1px solid #f1f5f9;
          background: #ffffff;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        .rehistory-modal-btn-cancel {
          padding: 10px 18px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          font-weight: 700;
          font-size: 13.5px;
          cursor: pointer;
        }

        .rehistory-modal-btn-confirm {
          padding: 10px 22px;
          border-radius: 10px;
          border: none;
          background: #dc2626;
          color: #ffffff;
          font-weight: 800;
          font-size: 13.5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.15s ease;
        }

        .rehistory-modal-btn-confirm:hover:not(:disabled) {
          background: #b91c1c;
        }

        .rehistory-modal-btn-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: #94a3b8;
        }

        /* ── Auth Prompt ── */
        .rehistory-auth-prompt {
          text-align: center;
          padding: 60px 20px;
          background: var(--surface-card, #ffffff);
          border: 1px solid var(--border-default, #e5e7eb);
          border-radius: 16px;
          max-width: 480px;
          margin: 40px auto;
        }

        .rehistory-auth-icon {
          font-size: 42px;
          color: #9ca3af;
          margin-bottom: 14px;
        }

        .rehistory-auth-prompt h3 {
          font-size: 17px;
          font-weight: 800;
          margin-bottom: 6px;
          color: var(--text-primary, #111827);
        }

        .rehistory-auth-prompt p {
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
          margin-bottom: 20px;
        }

        .rehistory-line-login-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #06c755;
          color: #ffffff;
          font-size: 14px;
          font-weight: 800;
          padding: 10px 24px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
        }

        @media (max-width: 640px) {
          .rehistory-header {
            flex-direction: column-reverse;
            align-items: stretch;
          }
          .rehistory-user-badge {
            align-self: flex-start;
          }
          .rehistory-grid {
            grid-template-columns: 1fr;
          }
          .rehistory-games-select-grid {
            grid-template-columns: 1fr;
          }
          .rehistory-modal-chars-grid {
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 10px;
          }
          .rehistory-modal-footer {
            flex-direction: column;
          }
          .rehistory-modal-btn-confirm,
          .rehistory-modal-btn-cancel {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  )
}
