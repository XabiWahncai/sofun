import React, { useState, useEffect, useMemo } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  addDoc,
  serverTimestamp,
  Timestamp
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
  const [activeTab, setActiveTab] = useState('saved') // 'saved' | 'record'
  const [savedHistory, setSavedHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  // Record tab state
  const [search, setSearch] = useState('')
  const [selectedGamesMap, setSelectedGamesMap] = useState({}) // { [gameId]: { game, character, customChar, playedDate, characterImage } }
  const [saving, setSaving] = useState(false)
  const [globalPlayedDate, setGlobalPlayedDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })

  // Map games by ID and Title for fast cover lookup
  const gameMap = useMemo(() => {
    const map = new Map()
    allGames.forEach(g => {
      if (g.id) map.set(g.id, g)
      if (g.title) map.set(g.title.trim().toLowerCase(), g)
    })
    return map
  }, [allGames])

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

  // Handle single record deletion
  const handleDelete = async (item) => {
    const title = item.scriptTitle || 'คดีนี้'
    if (!window.confirm(`ยืนยันการลบประวัติย้อนหลัง "${title}" หรือไม่?`)) return

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

  // Filter games for record selection
  const filteredGames = useMemo(() => {
    if (!search.trim()) return allGames
    const q = search.trim().toLowerCase()
    return allGames.filter(g =>
      (g.title && g.title.toLowerCase().includes(q)) ||
      (g.category && g.category.toLowerCase().includes(q))
    )
  }, [allGames, search])

  // Toggle game selection
  const toggleSelectGame = (game) => {
    setSelectedGamesMap(prev => {
      const next = { ...prev }
      if (next[game.id]) {
        delete next[game.id]
      } else {
        next[game.id] = {
          game,
          character: '',
          customChar: '',
          playedDate: globalPlayedDate,
          characterImage: ''
        }
      }
      return next
    })
  }

  // Update selected game character
  const updateGameField = (gameId, field, value) => {
    setSelectedGamesMap(prev => {
      if (!prev[gameId]) return prev
      const entry = { ...prev[gameId], [field]: value }

      // If character was selected from character list, resolve characterImage
      if (field === 'character') {
        const game = entry.game
        if (Array.isArray(game.characters)) {
          const charObj = game.characters.find(c => c.name === value)
          if (charObj) {
            entry.characterImage = charObj.imageDriveUrl || charObj.imagePreview || charObj.image || ''
          }
        }
      }

      return {
        ...prev,
        [gameId]: entry
      }
    })
  }

  const selectedList = useMemo(() => Object.values(selectedGamesMap), [selectedGamesMap])

  // Submit retroactive play records
  const handleBatchSave = async () => {
    if (selectedList.length === 0) return
    if (!lineUser?.uid) {
      if (showToast) showToast('กรุณาเข้าสู่ระบบ LINE ก่อนบันทึก', 'error')
      return
    }

    setSaving(true)
    try {
      const writes = selectedList.map(item => {
        const g = item.game
        const finalChar = item.character === '__custom__'
          ? (item.customChar || '—')
          : (item.character || item.customChar || '—')

        const playedDateObj = item.playedDate ? new Date(item.playedDate) : new Date()

        return addDoc(collection(db, 'playHistory'), {
          userId: lineUser.uid,
          userName: lineUser.name || 'สมาชิก',
          userAvatar: lineUser.avatar || '',
          scriptId: g.id,
          scriptTitle: g.title,
          character: finalChar,
          characterImage: item.characterImage || '',
          isRetroactive: true,
          source: 'rehistory',
          recordedBy: 'rehistory',
          excludeFromWheel: true,
          playedAt: Timestamp.fromDate(playedDateObj),
          createdAt: serverTimestamp()
        })
      })

      await Promise.all(writes)
      if (showToast) showToast(`บันทึกประวัติการเล่นย้อนหลังสำเร็จ ${selectedList.length} รายการ`, 'success')
      setSelectedGamesMap({})
      setActiveTab('saved')
    } catch (err) {
      console.error('Batch save error:', err)
      if (showToast) showToast(`บันทึกล้มเหลว: ${err?.message || 'เกิดข้อผิดพลาด'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

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
              เลือกคดีและตัวละครที่คุณเคยเล่นที่ร้าน เพื่อสะสมสถิติในโปรไฟล์ของคุณ (สามารถเลือกเพิ่มได้หลายเกมพร้อมกัน)
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
            เลือกคดีและตัวละครที่คุณเคยเล่นที่ร้าน เพื่อสะสมสถิติในโปรไฟล์ของคุณ (สามารถเลือกเพิ่มได้หลายเกมพร้อมกัน)
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
          ข้อกำหนดระบบ: ประวัติการเล่นย้อนหลังนี้มีไว้สำหรับสะสมสถิติคดีและบันทึกตัวละครในโปรไฟล์ของคุณ โดยจะไม่ถูกนำไปรวมกับระบบสิทธิ์สุ่มวงล้อรางวัล
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
          {selectedList.length > 0 && (
            <span className="rehistory-selected-count">{selectedList.length}</span>
          )}
        </button>

        <button
          type="button"
          className={`rehistory-tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          <i className="fas fa-list-check" />
          <span>ประวัติที่บันทึกไว้แล้ว ({savedHistory.length})</span>
        </button>
      </div>

      {/* Tab: Saved History List */}
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

                const rawCover = matchingGame?.coverImage || matchingGame?.cover || matchingGame?.thumbnail || item.characterImage || ''
                const coverUrl = rawCover ? convertImageUrl(rawCover, 'thumbnail') : '/Logo.png'

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
                        <i className="fas fa-mask rehistory-card-icon mask-icon" />
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

      {/* Tab: Record Games */}
      {activeTab === 'record' && (
        <div className="rehistory-record-section">
          {/* Global date picker and search */}
          <div className="rehistory-record-toolbar">
            <div className="rehistory-search-box">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="ค้นหาชื่อคดี..."
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

            <div className="rehistory-date-picker-box">
              <label>
                <i className="fas fa-calendar" /> วันที่เล่น:
              </label>
              <input
                type="date"
                value={globalPlayedDate}
                onChange={e => {
                  const val = e.target.value
                  setGlobalPlayedDate(val)
                  // Also update already selected items
                  setSelectedGamesMap(prev => {
                    const next = { ...prev }
                    Object.keys(next).forEach(k => {
                      next[k] = { ...next[k], playedDate: val }
                    })
                    return next
                  })
                }}
              />
            </div>
          </div>

          {/* Selected games floating/pinned counter bar */}
          {selectedList.length > 0 && (
            <div className="rehistory-selection-bar">
              <div className="rehistory-selection-summary">
                <i className="fas fa-check-circle" style={{ color: '#16a34a' }} />
                <span>เลือกแล้ว <strong>{selectedList.length}</strong> คดี</span>
              </div>
              <div className="rehistory-selection-actions">
                <button
                  type="button"
                  className="rehistory-btn-clear"
                  onClick={() => setSelectedGamesMap({})}
                >
                  ล้างที่เลือก
                </button>
                <button
                  type="button"
                  className="rehistory-btn-submit"
                  disabled={saving}
                  onClick={handleBatchSave}
                >
                  {saving ? (
                    <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                  ) : (
                    <><i className="fas fa-save" /> บันทึกประวัติการเล่น ({selectedList.length})</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Games list for selection */}
          <div className="rehistory-games-select-grid">
            {filteredGames.map(game => {
              const isSelected = !!selectedGamesMap[game.id]
              const currentEntry = selectedGamesMap[game.id]
              const rawCover = game.coverImage || game.cover || game.thumbnail || ''
              const coverUrl = rawCover ? convertImageUrl(rawCover, 'thumbnail') : '/Logo.png'
              const charList = Array.isArray(game.characters) ? game.characters.filter(c => c && c.name) : []

              return (
                <div
                  key={game.id}
                  className={`rehistory-select-game-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelectGame(game)}
                >
                  <div className="rehistory-select-game-top">
                    <img
                      src={coverUrl}
                      alt={game.title}
                      className="rehistory-select-poster"
                      onError={(e) => { e.currentTarget.src = '/Logo.png' }}
                    />
                    <div className="rehistory-select-info">
                      <div className="rehistory-select-title">{game.title}</div>
                      <div className="rehistory-select-meta">
                        {game.players && (
                          <span><i className="fas fa-users" /> {game.players} คน</span>
                        )}
                        {charList.length > 0 && (
                          <span><i className="fas fa-masks-theater" /> {charList.length} ตัวละคร</span>
                        )}
                      </div>
                    </div>
                    <div className="rehistory-checkbox-icon">
                      {isSelected ? (
                        <i className="fas fa-check-circle check-on" />
                      ) : (
                        <i className="far fa-circle check-off" />
                      )}
                    </div>
                  </div>

                  {/* Character selection details when selected */}
                  {isSelected && (
                    <div
                      className="rehistory-char-config-box"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="rehistory-char-label">
                        <i className="fas fa-mask" style={{ color: '#dc2626' }} /> ตัวละครที่รับบท:
                      </label>

                      {charList.length > 0 ? (
                        <>
                          <select
                            className="rehistory-char-select"
                            value={currentEntry.character}
                            onChange={(e) => updateGameField(game.id, 'character', e.target.value)}
                          >
                            <option value="">— เลือกตัวละคร —</option>
                            {charList.map((c, idx) => (
                              <option key={idx} value={c.name}>{c.name}</option>
                            ))}
                            <option value="__custom__">+ ระบุตัวละครเอง...</option>
                          </select>

                          {currentEntry.character === '__custom__' && (
                            <input
                              type="text"
                              className="rehistory-char-custom-input"
                              placeholder="พิมพ์ชื่อตัวละคร..."
                              value={currentEntry.customChar}
                              onChange={(e) => updateGameField(game.id, 'customChar', e.target.value)}
                            />
                          )}
                        </>
                      ) : (
                        <input
                          type="text"
                          className="rehistory-char-custom-input"
                          placeholder="พิมพ์ชื่อตัวละครที่เล่น (หรือเว้นว่างได้)..."
                          value={currentEntry.customChar}
                          onChange={(e) => updateGameField(game.id, 'customChar', e.target.value)}
                        />
                      )}

                      <div className="rehistory-char-date-row">
                        <label>
                          <i className="fas fa-calendar-day" /> วันที่เล่น:
                        </label>
                        <input
                          type="date"
                          value={currentEntry.playedDate || globalPlayedDate}
                          onChange={(e) => updateGameField(game.id, 'playedDate', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
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

        .rehistory-selected-count {
          background: #ffffff;
          color: #b91c1c;
          padding: 1px 7px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 800;
        }

        /* Saved Cards Grid */
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
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }

        .rehistory-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        }

        .rehistory-card-poster {
          width: 52px;
          height: 68px;
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
          margin-bottom: 3px;
        }

        .mask-icon {
          font-size: 11px;
        }

        .character-label {
          color: #dc2626;
        }

        .character-name {
          color: var(--text-primary, #374151);
          font-weight: 600;
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

        /* Empty State */
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

        /* Record Tab Styles */
        .rehistory-record-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .rehistory-search-box {
          position: relative;
          flex: 1;
          min-width: 240px;
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
          padding: 9px 36px 9px 36px;
          border-radius: 10px;
          border: 1px solid var(--border-default, #e5e7eb);
          background: var(--surface-card, #ffffff);
          color: var(--text-primary, #111827);
          font-size: 13.5px;
          outline: none;
        }

        .rehistory-search-box input:focus {
          border-color: #b91c1c;
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

        .rehistory-date-picker-box {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary, #374151);
        }

        .rehistory-date-picker-box input {
          padding: 7px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-default, #e5e7eb);
          background: var(--surface-card, #ffffff);
          color: var(--text-primary, #111827);
          font-size: 13px;
          outline: none;
        }

        .rehistory-selection-bar {
          position: sticky;
          top: 70px;
          z-index: 20;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #111827;
          color: #ffffff;
          padding: 12px 18px;
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          margin-bottom: 20px;
          gap: 12px;
          flex-wrap: wrap;
        }

        .rehistory-selection-summary {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13.5px;
        }

        .rehistory-selection-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .rehistory-btn-clear {
          background: rgba(255, 255, 255, 0.15);
          border: none;
          color: #ffffff;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
        }

        .rehistory-btn-submit {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #dc2626;
          border: none;
          color: #ffffff;
          padding: 8px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }

        .rehistory-btn-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .rehistory-games-select-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 14px;
        }

        .rehistory-select-game-card {
          background: var(--surface-card, #ffffff);
          border: 1.5px solid var(--border-default, #e5e7eb);
          border-radius: 14px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .rehistory-select-game-card:hover {
          border-color: #cbd5e1;
        }

        .rehistory-select-game-card.selected {
          border-color: #dc2626;
          background: #fffafa;
          box-shadow: 0 2px 8px rgba(220, 38, 38, 0.12);
        }

        .rehistory-select-game-top {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .rehistory-select-poster {
          width: 48px;
          height: 64px;
          border-radius: 6px;
          object-fit: cover;
          flex-shrink: 0;
          background: #1f2937;
        }

        .rehistory-select-info {
          flex: 1;
          min-width: 0;
        }

        .rehistory-select-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--text-primary, #111827);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }

        .rehistory-select-meta {
          display: flex;
          gap: 10px;
          font-size: 11.5px;
          color: var(--text-tertiary, #6b7280);
        }

        .rehistory-checkbox-icon {
          font-size: 20px;
          padding: 4px;
        }

        .check-on {
          color: #dc2626;
        }

        .check-off {
          color: #cbd5e1;
        }

        .rehistory-char-config-box {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px dashed #fca5a5;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .rehistory-char-label {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary, #374151);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .rehistory-char-select,
        .rehistory-char-custom-input {
          width: 100%;
          padding: 7px 10px;
          border-radius: 8px;
          border: 1px solid var(--border-default, #e5e7eb);
          background: #ffffff;
          font-size: 12.5px;
          outline: none;
        }

        .rehistory-char-select:focus,
        .rehistory-char-custom-input:focus {
          border-color: #dc2626;
        }

        .rehistory-char-date-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          color: var(--text-secondary, #6b7280);
        }

        .rehistory-char-date-row input {
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--border-default, #e5e7eb);
          font-size: 11.5px;
        }

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
          .rehistory-selection-bar {
            top: 60px;
            flex-direction: column;
            align-items: stretch;
          }
          .rehistory-selection-actions {
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  )
}
