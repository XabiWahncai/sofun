import { useState, useEffect, useMemo } from 'react'
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { toOptimizedUrl } from '../utils/imageUrl'

const DEFAULT_DMS = ['Smooth Operator', 'DM Palm', 'DM Max', 'DM Ice', 'DM Film']

export default function DmRecommendationsTab({ showToast, allGames = [] }) {
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)

  // Form State
  const [formGameId, setFormGameId] = useState('')
  const [formDmName, setFormDmName] = useState('')
  const [formReason, setFormReason] = useState('')
  const [gameSearch, setGameSearch] = useState('')
  const [filterDm, setFilterDm] = useState('all')

  // Load from settings/dm_recommendations with fallback to settings/promotion
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'dm_recommendations'), (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        setRecommendations(Array.isArray(d.recommendations) ? d.recommendations : [])
        setLoading(false)
      } else {
        // Check fallback in settings/promotion
        getDoc(doc(db, 'settings', 'promotion')).then((pSnap) => {
          if (pSnap.exists() && Array.isArray(pSnap.data().dmRecommendations)) {
            setRecommendations(pSnap.data().dmRecommendations)
          } else {
            setRecommendations([])
          }
          setLoading(false)
        }).catch(() => {
          setRecommendations([])
          setLoading(false)
        })
      }
    }, (err) => {
      console.warn('dm_recommendations listener error:', err.message)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Fast game map lookup
  const gamesMap = useMemo(() => {
    const map = new Map()
    allGames.forEach((g) => {
      const gid = g.id || g._id
      if (gid) map.set(gid, g)
    })
    return map
  }, [allGames])

  // Filtered games list for the picker
  const filteredPickerGames = useMemo(() => {
    const q = gameSearch.trim().toLowerCase()
    if (!q) return allGames.slice(0, 30)
    return allGames.filter((g) => {
      const title = (g.title || '').toLowerCase()
      const genre = (g.genre || '').toLowerCase()
      const tags = Array.isArray(g.tags) ? g.tags.join(' ').toLowerCase() : ''
      return title.includes(q) || genre.includes(q) || tags.includes(q)
    })
  }, [allGames, gameSearch])

  // All unique DMs present in recommendations
  const allKnownDms = useMemo(() => {
    const set = new Set(DEFAULT_DMS)
    recommendations.forEach((r) => {
      if (r.dmName) set.add(r.dmName)
    })
    return Array.from(set)
  }, [recommendations])

  // Filtered recommendations in table
  const displayedRecommendations = useMemo(() => {
    let list = [...recommendations]
    if (filterDm !== 'all') {
      list = list.filter((r) => r.dmName === filterDm)
    }
    return list
  }, [recommendations, filterDm])

  // Persist updated list
  const persist = async (nextList, successMessage = 'บันทึกสำเร็จ') => {
    setSaving(true)
    try {
      const payload = {
        recommendations: nextList,
        updatedAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'settings', 'dm_recommendations'), payload, { merge: true })

      // Dual-sync to settings/promotion as safe redundancy
      try {
        await setDoc(doc(db, 'settings', 'promotion'), {
          dmRecommendations: nextList,
          updatedAt: serverTimestamp(),
        }, { merge: true })
      } catch (syncErr) {
        console.warn('promotion sync error:', syncErr.message)
      }

      setRecommendations(nextList)
      if (typeof showToast === 'function') {
        showToast(successMessage)
      }
      return true
    } catch (err) {
      console.error(err)
      if (typeof showToast === 'function') {
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error')
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  // Open modal for new recommendation
  const handleAddNew = () => {
    setEditingId(null)
    setFormGameId(allGames[0]?.id || '')
    setFormDmName(DEFAULT_DMS[0])
    setFormReason('')
    setGameSearch('')
    setModalOpen(true)
  }

  // Open modal for editing existing recommendation
  const handleEdit = (item) => {
    setEditingId(item.id)
    setFormGameId(item.gameId)
    setFormDmName(item.dmName)
    setFormReason(item.reason || '')
    setGameSearch('')
    setModalOpen(true)
  }

  // Save from modal
  const handleSaveModal = async (e) => {
    e.preventDefault()
    if (!formGameId) {
      if (typeof showToast === 'function') showToast('กรุณาเลือกเกม', 'error')
      return
    }
    if (!formDmName.trim()) {
      if (typeof showToast === 'function') showToast('กรุณาระบุชื่อ DM', 'error')
      return
    }
    if (!formReason.trim()) {
      if (typeof showToast === 'function') showToast('กรุณาระบุเหตุผลที่ DM แนะนำ', 'error')
      return
    }

    const selectedGame = gamesMap.get(formGameId)
    const title = selectedGame?.title || 'Script Game'

    if (editingId) {
      // Update
      const nextList = recommendations.map((item) => {
        if (item.id === editingId) {
          return {
            ...item,
            gameId: formGameId,
            gameTitle: title,
            dmName: formDmName.trim(),
            reason: formReason.trim(),
            updatedAt: new Date().toISOString(),
          }
        }
        return item
      })
      const ok = await persist(nextList, 'แก้ไขคำแนะนำของ DM เรียบร้อย')
      if (ok) setModalOpen(false)
    } else {
      // Create new
      const newItem = {
        id: 'dmrec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        gameId: formGameId,
        gameTitle: title,
        dmName: formDmName.trim(),
        reason: formReason.trim(),
        order: recommendations.length + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const nextList = [newItem, ...recommendations]
      const ok = await persist(nextList, 'เพิ่มเกมที่ DM แนะนำเรียบร้อย')
      if (ok) setModalOpen(false)
    }
  }

  // Delete an item
  const handleDelete = async (id) => {
    if (!window.confirm('ต้องการลบคำแนะนำของ DM รายการนี้ใช่หรือไม่?')) return
    const nextList = recommendations.filter((r) => r.id !== id)
    await persist(nextList, 'ลบรายการคำแนะนำสำเร็จ')
  }

  // Move position up/down
  const handleMove = async (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= recommendations.length) return
    const nextList = [...recommendations]
    const temp = nextList[index]
    nextList[index] = nextList[targetIndex]
    nextList[targetIndex] = temp
    await persist(nextList, 'ปรับเปลี่ยนลำดับการแสดงผลเรียบร้อย')
  }

  return (
    <div className="adm-tab-pane">
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div
        className="adm-card"
        style={{
          padding: '20px 24px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(236, 72, 153, 0.12)',
                color: '#ec4899',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              <i className="fas fa-crown" />
            </span>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
              เกมที่ DM ที่ร้านแนะนำ
            </h2>
            <span
              className="adm-badge"
              style={{
                background: '#ec4899',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                padding: '2px 10px',
              }}
            >
              {recommendations.length} รายการ
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
            คัดเลือกเกมที่ DM แต่ละท่านแนะนำ พร้อมระบุเหตุผลและคำวิจารณ์เพื่อนำไปแสดงในหมวดหมู่หน้า /games และหน้ารายละเอียดเกม
          </p>
        </div>

        <button
          type="button"
          className="adm-btn-red"
          onClick={handleAddNew}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
            borderColor: '#db2777',
          }}
        >
          <i className="fas fa-plus" /> เพิ่มเกมที่ DM แนะนำ
        </button>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────── */}
      <div
        className="adm-card"
        style={{
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
            กรองตาม DM:
          </span>
          <button
            type="button"
            className={`adm-pill-btn sm${filterDm === 'all' ? ' active' : ''}`}
            onClick={() => setFilterDm('all')}
            style={{
              background: filterDm === 'all' ? '#ec4899' : 'var(--surface-elevated)',
              color: filterDm === 'all' ? '#fff' : 'var(--text-secondary)',
              borderColor: filterDm === 'all' ? '#ec4899' : 'var(--border-default)',
            }}
          >
            ทั้งหมด ({recommendations.length})
          </button>
          {allKnownDms.map((dm) => {
            const count = recommendations.filter((r) => r.dmName === dm).length
            if (count === 0 && filterDm !== dm) return null
            const isAct = filterDm === dm
            return (
              <button
                key={dm}
                type="button"
                className={`adm-pill-btn sm${isAct ? ' active' : ''}`}
                onClick={() => setFilterDm(dm)}
                style={{
                  background: isAct ? '#ec4899' : 'var(--surface-elevated)',
                  color: isAct ? '#fff' : 'var(--text-secondary)',
                  borderColor: isAct ? '#ec4899' : 'var(--border-default)',
                }}
              >
                {dm} ({count})
              </button>
            )
          })}
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          แสดงผล {displayedRecommendations.length} จาก {recommendations.length} รายการ
        </span>
      </div>

      {/* ── Recommendations List ────────────────────────────── */}
      {loading ? (
        <div className="adm-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#ec4899', marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-tertiary)' }}>กำลังโหลดข้อมูลคำแนะนำ...</p>
        </div>
      ) : displayedRecommendations.length === 0 ? (
        <div className="adm-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(236, 72, 153, 0.08)',
              color: '#ec4899',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto 16px',
            }}
          >
            <i className="fas fa-crown" />
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            ยังไม่มีรายการแนะนำที่เลือกไว้
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-tertiary)' }}>
            กดปุ่มด้านล่างเพื่อเริ่มเลือกเกมและระบุว่า DM ท่านใดเป็นผู้แนะนำ
          </p>
          <button
            type="button"
            className="adm-btn-red"
            onClick={handleAddNew}
            style={{ background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', borderColor: '#db2777' }}
          >
            <i className="fas fa-plus" /> เพิ่มเกมแรกเลย
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayedRecommendations.map((item, index) => {
            const game = gamesMap.get(item.gameId)
            const imgUrl = toOptimizedUrl(game?.image, 200)

            return (
              <div
                key={item.id}
                className="adm-card"
                style={{
                  padding: 16,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16,
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  border: '1px solid var(--border-default)',
                }}
              >
                {/* Left: Thumbnail & Details */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flex: '1 1 340px' }}>
                  {/* Order badge */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border-default)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    #{index + 1}
                  </div>

                  {/* Game Thumbnail */}
                  <div
                    style={{
                      width: 64,
                      height: 90,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#1f2937',
                      flexShrink: 0,
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={game?.title || item.gameTitle}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#6b7280',
                        }}
                      >
                        <i className="fas fa-scroll" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {game?.title || item.gameTitle || 'เกมไม่มีชื่อ'}
                      </h3>
                      {game?.difficulty && (
                        <span
                          className="adm-badge"
                          style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#3b82f6',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            fontSize: 11,
                          }}
                        >
                          {game.difficulty}
                        </span>
                      )}
                      {game?.players && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          <i className="fas fa-users" style={{ marginRight: 4 }} />
                          {game.players}
                        </span>
                      )}
                    </div>

                    {/* DM Badge */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span
                        className="adm-badge"
                        style={{
                          background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: 11.5,
                          padding: '3px 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <i className="fas fa-crown" style={{ fontSize: 10 }} /> DM แนะนำ: {item.dmName}
                      </span>
                    </div>

                    {/* Reason box */}
                    <div
                      style={{
                        background: 'var(--surface-elevated)',
                        borderLeft: '3px solid #ec4899',
                        padding: '8px 12px',
                        borderRadius: '0 8px 8px 0',
                        fontSize: 12.5,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                      }}
                    >
                      <i className="fas fa-quote-left" style={{ opacity: 0.35, marginRight: 6, fontSize: 10 }} />
                      {item.reason}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                    marginLeft: 'auto',
                  }}
                >
                  <button
                    type="button"
                    className="adm-btn-outline"
                    title="เลื่อนขึ้น"
                    disabled={index === 0 || saving}
                    onClick={() => handleMove(index, -1)}
                    style={{ padding: '6px 10px', fontSize: 12 }}
                  >
                    <i className="fas fa-arrow-up" />
                  </button>
                  <button
                    type="button"
                    className="adm-btn-outline"
                    title="เลื่อนลง"
                    disabled={index === displayedRecommendations.length - 1 || saving}
                    onClick={() => handleMove(index, 1)}
                    style={{ padding: '6px 10px', fontSize: 12 }}
                  >
                    <i className="fas fa-arrow-down" />
                  </button>
                  <button
                    type="button"
                    className="adm-btn-outline"
                    title="แก้ไขคำแนะนำ"
                    onClick={() => handleEdit(item)}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    <i className="fas fa-edit" style={{ marginRight: 4 }} /> แก้ไข
                  </button>
                  <button
                    type="button"
                    className="adm-btn-outline"
                    title="ลบคำแนะนำ"
                    onClick={() => handleDelete(item.id)}
                    style={{ padding: '6px 10px', fontSize: 12, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  >
                    <i className="fas fa-trash-alt" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────── */}
      {modalOpen && (
        <div
          className="adm-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="adm-edit-modal"
            style={{
              maxWidth: 680,
              width: '100%',
              background: 'var(--surface-card, #ffffff)',
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-default)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="adm-edit-modal-header"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(236, 72, 153, 0.12)',
                    color: '#ec4899',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                  }}
                >
                  <i className="fas fa-crown" />
                </span>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {editingId ? 'แก้ไขเกมที่ DM แนะนำ' : 'เพิ่มเกมที่ DM แนะนำ'}
                </h3>
              </div>
              <button
                type="button"
                className="adm-btn-outline"
                onClick={() => setModalOpen(false)}
                style={{ padding: '4px 8px', fontSize: 13 }}
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveModal}>
              <div
                className="adm-edit-modal-body"
                style={{
                  padding: '20px',
                  maxHeight: '70vh',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                }}
              >
                {/* 1. Game Selection */}
                <div className="adm-field">
                  <label className="adm-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>
                    1. เลือกเกมที่ต้องการแนะนำ *
                  </label>

                  {/* Filter Search */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <i
                        className="fas fa-search"
                        style={{
                          position: 'absolute',
                          left: 12,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--text-tertiary)',
                          fontSize: 12,
                        }}
                      />
                      <input
                        type="text"
                        className="adm-input"
                        placeholder="พิมพ์ค้นหาชื่อเกม..."
                        value={gameSearch}
                        onChange={(e) => setGameSearch(e.target.value)}
                        style={{ paddingLeft: 32, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  {/* Game Select Box */}
                  <select
                    className="adm-input"
                    value={formGameId}
                    onChange={(e) => setFormGameId(e.target.value)}
                    style={{ fontSize: 14, fontWeight: 600, padding: '10px 12px' }}
                    required
                  >
                    <option value="">-- กรุณาเลือกสคริปต์เกม --</option>
                    {filteredPickerGames.map((g) => {
                      const gid = g.id || g._id
                      return (
                        <option key={gid} value={gid}>
                          {g.title} ({g.players || '4-8 คน'}) {g.difficulty ? `· [${g.difficulty}]` : ''}
                        </option>
                      )
                    })}
                  </select>

                  {/* Selected Game Preview */}
                  {formGameId && gamesMap.get(formGameId) && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 10,
                        background: 'var(--surface-elevated)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 60,
                          borderRadius: 6,
                          overflow: 'hidden',
                          background: '#111',
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={toOptimizedUrl(gamesMap.get(formGameId)?.image, 150)}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>
                          {gamesMap.get(formGameId)?.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {gamesMap.get(formGameId)?.genre || 'Script Murder'} · {gamesMap.get(formGameId)?.players} · {gamesMap.get(formGameId)?.time || '4 ชม.'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. DM Selection */}
                <div className="adm-field">
                  <label className="adm-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>
                    2. เลือกหรือระบุชื่อ DM ผู้แนะนำ *
                  </label>

                  {/* Quick Select Chips */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {DEFAULT_DMS.map((d) => {
                      const isSel = formDmName === d
                      return (
                        <button
                          key={d}
                          type="button"
                          className="adm-pill-btn sm"
                          onClick={() => setFormDmName(d)}
                          style={{
                            background: isSel ? '#ec4899' : 'var(--surface-elevated)',
                            color: isSel ? '#fff' : 'var(--text-secondary)',
                            borderColor: isSel ? '#ec4899' : 'var(--border-default)',
                            fontWeight: isSel ? 700 : 500,
                          }}
                        >
                          <i className="fas fa-crown" style={{ fontSize: 9, marginRight: 4 }} />
                          {d}
                        </button>
                      )
                    })}
                  </div>

                  {/* Text Input for Custom DM Name */}
                  <input
                    type="text"
                    className="adm-input"
                    placeholder="พิมพ์ชื่อ DM เช่น Smooth Operator หรือ DM ชื่อใหม่..."
                    value={formDmName}
                    onChange={(e) => setFormDmName(e.target.value)}
                    required
                  />
                </div>

                {/* 3. Reason Textarea */}
                <div className="adm-field">
                  <label className="adm-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>
                    3. เหตุผลที่แนะนำ (ข้อความรีวิว/จุดเด่น) *
                  </label>
                  <textarea
                    className="adm-input"
                    rows={4}
                    placeholder="เช่น สคริปต์สืบสวนเข้มข้น ปมฆาตกรรมหักมุมซ้อนกล บทบาทตัวละครกระจายความเด่นเท่าเทียมกัน เล่นแล้วอิน ดราม่ากินใจ..."
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    style={{ resize: 'vertical', lineHeight: 1.5, fontSize: 13 }}
                    required
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    ข้อความนี้จะแสดงในหน้าแคตตาล็อกเกม และการ์ดรายละเอียดของเกมเพื่อให้ผู้เล่นเห็น
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                className="adm-edit-modal-footer"
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--border-default)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className="adm-btn-outline"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="adm-btn-red"
                  disabled={saving}
                  style={{
                    background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                    borderColor: '#db2777',
                    minWidth: 120,
                  }}
                >
                  {saving ? (
                    <span>
                      <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />
                      กำลังบันทึก...
                    </span>
                  ) : (
                    <span>
                      <i className="fas fa-save" style={{ marginRight: 6 }} />
                      {editingId ? 'บันทึกการแก้ไข' : 'เพิ่มคำแนะนำ'}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
