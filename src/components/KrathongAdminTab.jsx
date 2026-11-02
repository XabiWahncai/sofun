import React, { useState, useEffect, useMemo } from 'react'
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { logSecurityEvent } from '../utils/security'

export default function KrathongAdminTab({ showToast }) {
  const [krathongs, setKrathongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'visible' | 'hidden'
  const [sortBy, setSortBy] = useState('newest') // 'newest' | 'oldest' | 'sadhu'
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'

  // Selection & Actions State
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [previewKrathong, setPreviewKrathong] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null) // single krathong to delete
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [actionInProgress, setActionInProgress] = useState(false)

  // Real-time listener for all krathongs
  useEffect(() => {
    try {
      const colRef = collection(db, 'krathongs')
      const unsub = onSnapshot(
        colRef,
        (snapshot) => {
          const list = snapshot.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              name: data.name || 'ผู้ร่วมลอยกระทง',
              wish: data.wish || 'ขอพรพระแม่คงคา',
              imageData: data.imageData || null,
              lane: data.lane ?? 0,
              sadhuCount: data.sadhuCount || data.likes || 0,
              likes: data.likes || data.sadhuCount || 0,
              createdAt: data.createdAt,
              hidden: data.hidden === true || data.isVisible === false,
            }
          })
          setKrathongs(list)
          setLoading(false)
        },
        (err) => {
          console.error('Krathongs subscription error:', err)
          showToast?.('ไม่สามารถดึงข้อมูลกระทงได้: ' + err.message, 'error')
          setLoading(false)
        }
      )
      return () => unsub()
    } catch (err) {
      console.error('Krathongs init error:', err)
      setLoading(false)
    }
  }, [showToast])

  // Formatting date helper
  const formatDate = (createdAt) => {
    if (!createdAt) return '—'
    const dt = createdAt.toDate
      ? createdAt.toDate()
      : createdAt.seconds
      ? new Date(createdAt.seconds * 1000)
      : new Date(createdAt)
    if (isNaN(dt.getTime())) return '—'
    return dt.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Summary Metrics
  const totalCount = krathongs.length
  const hiddenCount = krathongs.filter((k) => k.hidden).length
  const visibleCount = totalCount - hiddenCount
  const totalSadhu = krathongs.reduce((sum, k) => sum + (Number(k.sadhuCount) || 0), 0)

  // Filtering and Sorting
  const filteredKrathongs = useMemo(() => {
    return krathongs
      .filter((k) => {
        // Status filter
        if (statusFilter === 'visible' && k.hidden) return false
        if (statusFilter === 'hidden' && !k.hidden) return false

        // Search text
        if (search.trim()) {
          const q = search.toLowerCase()
          const matchName = k.name.toLowerCase().includes(q)
          const matchWish = k.wish.toLowerCase().includes(q)
          const matchId = k.id.toLowerCase().includes(q)
          if (!matchName && !matchWish && !matchId) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'sadhu') {
          return (b.sadhuCount || 0) - (a.sadhuCount || 0)
        }
        const timeA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0)
        const timeB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0)
        if (sortBy === 'oldest') {
          return timeA - timeB
        }
        return timeB - timeA
      })
  }, [krathongs, statusFilter, search, sortBy])

  // Toggle Single Krathong Visibility
  const handleToggleVisibility = async (krathong) => {
    const nextHidden = !krathong.hidden
    setActionInProgress(true)
    try {
      const docRef = doc(db, 'krathongs', krathong.id)
      await updateDoc(docRef, {
        hidden: nextHidden,
        isVisible: !nextHidden,
        updatedAt: serverTimestamp(),
      })
      logSecurityEvent({
        eventType: nextHidden ? 'KRATHONG_HIDDEN' : 'KRATHONG_RESTORED',
        severity: 'info',
        details: `Admin changed Krathong "${krathong.name}" (ID: ${krathong.id}) to ${nextHidden ? 'hidden' : 'visible'}`,
        user: 'admin_dashboard',
      })
      showToast?.(
        nextHidden
          ? `ซ่อนกระทงของ "${krathong.name}" สำเร็จ`
          : `เปิดแสดงกระทงของ "${krathong.name}" ในแม่น้ำสำเร็จ`
      )
    } catch (err) {
      console.error('Toggle visibility error:', err)
      showToast?.('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message, 'error')
    } finally {
      setActionInProgress(false)
    }
  }

  // Delete Single Krathong
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setActionInProgress(true)
    try {
      await deleteDoc(doc(db, 'krathongs', deleteTarget.id))
      logSecurityEvent({
        eventType: 'KRATHONG_DELETED',
        severity: 'warning',
        details: `Admin deleted Krathong "${deleteTarget.name}" (ID: ${deleteTarget.id})`,
        user: 'admin_dashboard',
      })
      showToast?.(`ลบกระทงของ "${deleteTarget.name}" เรียบร้อยแล้ว`)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.id)
        return next
      })
      setDeleteTarget(null)
    } catch (err) {
      console.error('Delete krathong error:', err)
      showToast?.('ลบไม่สำเร็จ: ' + err.message, 'error')
    } finally {
      setActionInProgress(false)
    }
  }

  // Selection handlers
  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredKrathongs.length && filteredKrathongs.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredKrathongs.map((k) => k.id)))
    }
  }

  // Bulk Actions
  const handleBulkToggleVisibility = async (makeHidden) => {
    if (selectedIds.size === 0) return
    setActionInProgress(true)
    try {
      const batch = writeBatch(db)
      selectedIds.forEach((id) => {
        batch.update(doc(db, 'krathongs', id), {
          hidden: makeHidden,
          isVisible: !makeHidden,
          updatedAt: serverTimestamp(),
        })
      })
      await batch.commit()
      logSecurityEvent({
        eventType: makeHidden ? 'BULK_KRATHONGS_HIDDEN' : 'BULK_KRATHONGS_RESTORED',
        severity: 'info',
        details: `Admin bulk changed ${selectedIds.size} krathongs to ${makeHidden ? 'hidden' : 'visible'}`,
        user: 'admin_dashboard',
      })
      showToast?.(`${makeHidden ? 'ซ่อน' : 'เปิดแสดง'}กระทงที่เลือกจำนวน ${selectedIds.size} รายการแล้ว`)
      setSelectedIds(new Set())
    } catch (err) {
      console.error('Bulk update error:', err)
      showToast?.('เกิดข้อผิดพลาดในการอัปเดต: ' + err.message, 'error')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    setActionInProgress(true)
    try {
      const batch = writeBatch(db)
      selectedIds.forEach((id) => {
        batch.delete(doc(db, 'krathongs', id))
      })
      await batch.commit()
      logSecurityEvent({
        eventType: 'BULK_KRATHONGS_DELETED',
        severity: 'warning',
        details: `Admin bulk deleted ${selectedIds.size} krathongs`,
        user: 'admin_dashboard',
      })
      showToast?.(`ลบกระทงที่เลือกจำนวน ${selectedIds.size} รายการถาวรแล้ว`)
      setSelectedIds(new Set())
      setBulkDeleteConfirm(false)
    } catch (err) {
      console.error('Bulk delete error:', err)
      showToast?.('ลบกระทงที่เลือกไม่สำเร็จ: ' + err.message, 'error')
    } finally {
      setActionInProgress(false)
    }
  }

  if (loading) {
    return (
      <div className="adm-krathong-root" style={{ padding: '32px', textAlign: 'center' }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: '28px', color: '#6366f1' }} />
        <div style={{ marginTop: '12px', fontSize: '14px', color: '#64748b' }}>กำลังโหลดข้อมูลกระทง...</div>
      </div>
    )
  }

  return (
    <div className="adm-krathong-root">
      {/* ── Header Bar ── */}
      <div className="adm-krathong-header">
        <div>
          <h2 className="adm-krathong-title">
            <i className="fas fa-water" style={{ color: '#06b6d4', marginRight: '10px' }} />
            จัดการกระทง (Loy Krathong Festival)
          </h2>
          <div className="adm-krathong-sub">
            ตรวจสอบ ซ่อนการมองเห็น หรือลบกระทงที่ไม่เหมาะสมออกจากแม่น้ำแบบเรียลไทม์
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <a
            href="/River"
            target="_blank"
            rel="noopener noreferrer"
            className="adm-krathong-link-btn"
            title="เปิดหน้าแม่น้ำลอยกระทงในแท็บใหม่"
          >
            <i className="fas fa-external-link-alt" />
            <span>ดูหน้าแม่น้ำจริง (/River)</span>
          </a>
        </div>
      </div>

      {/* ── KPI Metric Cards ── */}
      <div className="adm-krathong-kpis">
        <div className="adm-kpi-card total">
          <div className="adm-kpi-icon"><i className="fas fa-water" /></div>
          <div className="adm-kpi-info">
            <div className="adm-kpi-label">กระทงทั้งหมด</div>
            <div className="adm-kpi-val">{totalCount}</div>
            <div className="adm-kpi-desc">ทุกสถานะในฐานข้อมูล</div>
          </div>
        </div>

        <div className="adm-kpi-card visible">
          <div className="adm-kpi-icon"><i className="fas fa-eye" /></div>
          <div className="adm-kpi-info">
            <div className="adm-kpi-label">กำลังแสดงในแม่น้ำ</div>
            <div className="adm-kpi-val" style={{ color: '#16a34a' }}>{visibleCount}</div>
            <div className="adm-kpi-desc">ผู้ใช้ทั่วไปมองเห็นและสาธุได้</div>
          </div>
        </div>

        <div className="adm-kpi-card hidden">
          <div className="adm-kpi-icon"><i className="fas fa-eye-slash" /></div>
          <div className="adm-kpi-info">
            <div className="adm-kpi-label">ซ่อนการมองเห็น</div>
            <div className="adm-kpi-val" style={{ color: '#ea580c' }}>{hiddenCount}</div>
            <div className="adm-kpi-desc">ไม่แสดงผลบนสายน้ำ</div>
          </div>
        </div>

        <div className="adm-kpi-card sadhu">
          <div className="adm-kpi-icon"><i className="fas fa-hands-praying" /></div>
          <div className="adm-kpi-info">
            <div className="adm-kpi-label">ยอดสาธุสะสม</div>
            <div className="adm-kpi-val" style={{ color: '#ca8a04' }}>{totalSadhu.toLocaleString()}</div>
            <div className="adm-kpi-desc">แรงอธิษฐานและไลก์ทั้งหมด</div>
          </div>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="adm-krathong-toolbar">
        {/* Search */}
        <div className="adm-search-box">
          <i className="fas fa-search adm-search-icon" />
          <input
            type="text"
            className="adm-search-input"
            placeholder="ค้นหาชื่อผู้ลอย, คำอธิษฐาน หรือรหัสกระทง..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="adm-search-clear"
              onClick={() => setSearch('')}
              title="ล้างคำค้นหา"
            >
              <i className="fas fa-times" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="adm-status-tabs">
          <button
            type="button"
            className={`adm-status-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            ทั้งหมด ({totalCount})
          </button>
          <button
            type="button"
            className={`adm-status-tab ${statusFilter === 'visible' ? 'active' : ''}`}
            onClick={() => setStatusFilter('visible')}
          >
            กำลังแสดง ({visibleCount})
          </button>
          <button
            type="button"
            className={`adm-status-tab ${statusFilter === 'hidden' ? 'active' : ''}`}
            onClick={() => setStatusFilter('hidden')}
          >
            ซ่อนอยู่ ({hiddenCount})
          </button>
        </div>

        {/* Sort Dropdown */}
        <div className="adm-sort-box">
          <label className="adm-sort-label">เรียงตาม:</label>
          <select
            className="adm-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="newest">ล่าสุด (ใหม่ไปเก่า)</option>
            <option value="oldest">เก่าที่สุด</option>
            <option value="sadhu">ยอดสาธุสูงสุด</option>
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="adm-view-toggle">
          <button
            type="button"
            className={`adm-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="แสดงแบบการ์ด"
          >
            <i className="fas fa-th-large" />
          </button>
          <button
            type="button"
            className={`adm-view-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="แสดงแบบตาราง"
          >
            <i className="fas fa-list" />
          </button>
        </div>
      </div>

      {/* ── Bulk Actions Floating Bar ── */}
      {selectedIds.size > 0 && (
        <div className="adm-bulk-bar">
          <div className="adm-bulk-count">
            <i className="fas fa-check-circle" style={{ color: '#38bdf8' }} />
            <span>เลือกแล้ว <strong>{selectedIds.size}</strong> รายการ</span>
          </div>
          <div className="adm-bulk-actions">
            <button
              type="button"
              className="adm-bulk-btn hide"
              disabled={actionInProgress}
              onClick={() => handleBulkToggleVisibility(true)}
            >
              <i className="fas fa-eye-slash" />
              <span>ซ่อนที่เลือก</span>
            </button>
            <button
              type="button"
              className="adm-bulk-btn show"
              disabled={actionInProgress}
              onClick={() => handleBulkToggleVisibility(false)}
            >
              <i className="fas fa-eye" />
              <span>เปิดแสดงที่เลือก</span>
            </button>
            <button
              type="button"
              className="adm-bulk-btn delete"
              disabled={actionInProgress}
              onClick={() => setBulkDeleteConfirm(true)}
            >
              <i className="fas fa-trash-alt" />
              <span>ลบที่เลือก ({selectedIds.size})</span>
            </button>
            <button
              type="button"
              className="adm-bulk-btn cancel"
              onClick={() => setSelectedIds(new Set())}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* ── Master Select All Row ── */}
      <div className="adm-krathong-subbar">
        <label className="adm-select-all-label">
          <input
            type="checkbox"
            checked={selectedIds.size === filteredKrathongs.length && filteredKrathongs.length > 0}
            onChange={toggleSelectAll}
          />
          <span>เลือกทั้งหมดในหน้านี้ ({filteredKrathongs.length} รายการ)</span>
        </label>
      </div>

      {/* ── Empty State ── */}
      {filteredKrathongs.length === 0 ? (
        <div className="adm-empty-box">
          <i className="fas fa-water" style={{ fontSize: '36px', color: '#94a3b8', marginBottom: '12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#334155' }}>ไม่พบข้อมูลกระทง</div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            ลองเปลี่ยนเงื่อนไขค้นหา หรือตรวจสอบตัวกรองสถานะ
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid View ── */
        <div className="adm-krathong-grid">
          {filteredKrathongs.map((k) => {
            const isSelected = selectedIds.has(k.id)
            return (
              <div
                key={k.id}
                className={`adm-kcard ${k.hidden ? 'is-hidden' : ''} ${isSelected ? 'is-selected' : ''}`}
              >
                {/* Card Top Row: Checkbox & Status Badge */}
                <div className="adm-kcard-head">
                  <label className="adm-kcard-check">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(k.id)}
                    />
                  </label>
                  <span className={`adm-kcard-badge ${k.hidden ? 'hidden' : 'visible'}`}>
                    <i className={`fas ${k.hidden ? 'fa-eye-slash' : 'fa-check'}`} />
                    <span>{k.hidden ? 'ซ่อนอยู่' : 'กำลังแสดง'}</span>
                  </span>
                </div>

                {/* Krathong Thumbnail Preview */}
                <div
                  className="adm-kcard-thumb-wrap"
                  onClick={() => setPreviewKrathong(k)}
                  title="คลิกเพื่อดูภาพขยาย"
                >
                  {k.imageData ? (
                    <img src={k.imageData} alt={k.name} className="adm-kcard-thumb" />
                  ) : (
                    <div className="adm-kcard-thumb-none">
                      <i className="fas fa-image" />
                    </div>
                  )}
                  <div className="adm-kcard-zoom-hint">
                    <i className="fas fa-search-plus" />
                  </div>
                </div>

                {/* Creator Name & Sadhu */}
                <div className="adm-kcard-body">
                  <div className="adm-kcard-name" title={k.name}>
                    {k.name}
                  </div>
                  <div className="adm-kcard-sadhu">
                    <i className="fas fa-hands-praying" style={{ color: '#f59e0b' }} />
                    <span>สาธุ {k.sadhuCount} ครั้ง</span>
                  </div>

                  {/* Wish Box */}
                  <div className="adm-kcard-wish" title={k.wish}>
                    <i className="fas fa-quote-left" style={{ opacity: 0.35, marginRight: '4px' }} />
                    {k.wish}
                  </div>

                  {/* Date */}
                  <div className="adm-kcard-date">
                    <i className="fas fa-clock" style={{ marginRight: '4px', opacity: 0.6 }} />
                    {formatDate(k.createdAt)}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="adm-kcard-actions">
                  <button
                    type="button"
                    className={`adm-act-btn toggle ${k.hidden ? 'unhide' : 'hide'}`}
                    disabled={actionInProgress}
                    onClick={() => handleToggleVisibility(k)}
                    title={k.hidden ? 'เปิดให้กระทงนี้แสดงในแม่น้ำ' : 'ซ่อนกระทงนี้ไม่ให้ปรากฏในแม่น้ำ'}
                  >
                    <i className={`fas ${k.hidden ? 'fa-eye' : 'fa-eye-slash'}`} />
                    <span>{k.hidden ? 'แสดง' : 'ซ่อน'}</span>
                  </button>

                  <button
                    type="button"
                    className="adm-act-btn delete"
                    disabled={actionInProgress}
                    onClick={() => setDeleteTarget(k)}
                    title="ลบกระทงนี้อย่างถาวร"
                  >
                    <i className="fas fa-trash-alt" />
                    <span>ลบ</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ── Table View ── */
        <div className="adm-krathong-table-wrap">
          <table className="adm-krathong-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredKrathongs.length && filteredKrathongs.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th style={{ width: '80px', textAlign: 'center' }}>ภาพกระทง</th>
                <th style={{ minWidth: '150px' }}>ชื่อผู้ลอย</th>
                <th style={{ minWidth: '240px' }}>คำอธิษฐาน</th>
                <th style={{ width: '110px', textAlign: 'center' }}>ยอดสาธุ</th>
                <th style={{ width: '130px', textAlign: 'center' }}>สถานะ</th>
                <th style={{ width: '140px' }}>เวลาที่ลอย</th>
                <th style={{ width: '160px', textAlign: 'center' }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredKrathongs.map((k) => {
                const isSelected = selectedIds.has(k.id)
                return (
                  <tr key={k.id} className={`${k.hidden ? 'is-hidden' : ''} ${isSelected ? 'is-selected' : ''}`}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(k.id)}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div
                        className="adm-tbl-thumb-wrap"
                        onClick={() => setPreviewKrathong(k)}
                        title="คลิกเพื่อดูภาพขยาย"
                      >
                        {k.imageData ? (
                          <img src={k.imageData} alt={k.name} className="adm-tbl-thumb" />
                        ) : (
                          <div className="adm-tbl-thumb-none"><i className="fas fa-image" /></div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="adm-tbl-name">{k.name}</div>
                      <div className="adm-tbl-id">{k.id}</div>
                    </td>
                    <td>
                      <div className="adm-tbl-wish">{k.wish}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="adm-tbl-sadhu">
                        <i className="fas fa-hands-praying" style={{ color: '#f59e0b', marginRight: '4px' }} />
                        {k.sadhuCount}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`adm-kcard-badge ${k.hidden ? 'hidden' : 'visible'}`}>
                        <i className={`fas ${k.hidden ? 'fa-eye-slash' : 'fa-check'}`} />
                        <span>{k.hidden ? 'ซ่อนอยู่' : 'กำลังแสดง'}</span>
                      </span>
                    </td>
                    <td>
                      <span className="adm-tbl-date">{formatDate(k.createdAt)}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          type="button"
                          className={`adm-act-btn toggle sm ${k.hidden ? 'unhide' : 'hide'}`}
                          disabled={actionInProgress}
                          onClick={() => handleToggleVisibility(k)}
                          title={k.hidden ? 'เปิดแสดง' : 'ซ่อนกระทง'}
                        >
                          <i className={`fas ${k.hidden ? 'fa-eye' : 'fa-eye-slash'}`} />
                        </button>
                        <button
                          type="button"
                          className="adm-act-btn delete sm"
                          disabled={actionInProgress}
                          onClick={() => setDeleteTarget(k)}
                          title="ลบกระทงถาวร"
                        >
                          <i className="fas fa-trash-alt" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Zoom Krathong Image ── */}
      {previewKrathong && (
        <div className="adm-modal-backdrop" onClick={() => setPreviewKrathong(null)}>
          <div className="adm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <div style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>
                กระทงของ "{previewKrathong.name}"
              </div>
              <button
                type="button"
                className="adm-modal-close"
                onClick={() => setPreviewKrathong(null)}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="adm-modal-preview-body">
              <div className="adm-modal-canvas-frame">
                {previewKrathong.imageData ? (
                  <img
                    src={previewKrathong.imageData}
                    alt={previewKrathong.name}
                    className="adm-modal-img"
                  />
                ) : (
                  <div style={{ color: '#94a3b8' }}>ไม่มีข้อมูลภาพวาด</div>
                )}
              </div>
              <div className="adm-modal-wish-box">
                <i className="fas fa-quote-left" style={{ color: '#94a3b8', marginRight: '6px' }} />
                <span>{previewKrathong.wish}</span>
              </div>
              <div className="adm-modal-meta-row">
                <div>
                  <span style={{ color: '#64748b' }}>เวลาที่ลอย: </span>
                  <strong>{formatDate(previewKrathong.createdAt)}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>ยอดสาธุ: </span>
                  <strong style={{ color: '#f59e0b' }}>{previewKrathong.sadhuCount} ครั้ง</strong>
                </div>
                <div>
                  <span className={`adm-kcard-badge ${previewKrathong.hidden ? 'hidden' : 'visible'}`}>
                    {previewKrathong.hidden ? 'สถานะ: ซ่อนการมองเห็น' : 'สถานะ: กำลังแสดงในแม่น้ำ'}
                  </span>
                </div>
              </div>
            </div>
            <div className="adm-modal-foot">
              <button
                type="button"
                className={`adm-act-btn toggle ${previewKrathong.hidden ? 'unhide' : 'hide'}`}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
                onClick={() => {
                  handleToggleVisibility(previewKrathong)
                  setPreviewKrathong(null)
                }}
              >
                <i className={`fas ${previewKrathong.hidden ? 'fa-eye' : 'fa-eye-slash'}`} />
                <span>{previewKrathong.hidden ? 'เปิดแสดงในแม่น้ำ' : 'ซ่อนกระทงนี้'}</span>
              </button>
              <button
                type="button"
                className="adm-modal-btn-cancel"
                onClick={() => setPreviewKrathong(null)}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Single Delete Confirmation ── */}
      {deleteTarget && (
        <div className="adm-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="adm-modal-box danger" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#b91c1c' }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }} />
                ยืนยันการลบกระทงอย่างถาวร
              </div>
              <button
                type="button"
                className="adm-modal-close"
                onClick={() => setDeleteTarget(null)}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: '14px', color: '#334155', marginBottom: '14px', lineHeight: 1.5 }}>
                คุณแน่ใจหรือไม่ว่าต้องการลบกระทงของ <strong>"{deleteTarget.name}"</strong>?
                การลบนี้เป็นแบบถาวรและไม่สามารถกู้คืนข้อมูลภาพวาดหรือคำอธิษฐานได้
              </div>

              {deleteTarget.imageData && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  background: 'radial-gradient(ellipse at center, #0a1b38 0%, #030814 100%)',
                  padding: '16px',
                  borderRadius: '12px',
                  marginBottom: '14px',
                }}>
                  <img
                    src={deleteTarget.imageData}
                    alt={deleteTarget.name}
                    style={{ maxHeight: '120px', objectFit: 'contain' }}
                  />
                </div>
              )}

              <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px' }}>
                "{deleteTarget.wish}"
              </div>
            </div>
            <div className="adm-modal-foot">
              <button
                type="button"
                className="adm-modal-btn-cancel"
                disabled={actionInProgress}
                onClick={() => setDeleteTarget(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="adm-modal-btn-danger"
                disabled={actionInProgress}
                onClick={handleConfirmDelete}
              >
                {actionInProgress ? (
                  <>
                    <i className="fas fa-spinner fa-spin" />
                    <span>กำลังลบ...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-trash-alt" />
                    <span>ยืนยันลบถาวร</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Bulk Delete Confirmation ── */}
      {bulkDeleteConfirm && (
        <div className="adm-modal-backdrop" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="adm-modal-box danger" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#b91c1c' }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }} />
                ยืนยันการลบกระทงจำนวนมาก
              </div>
              <button
                type="button"
                className="adm-modal-close"
                onClick={() => setBulkDeleteConfirm(false)}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div style={{ padding: '20px', fontSize: '14px', color: '#334155', lineHeight: 1.6 }}>
              คุณกำลังจะลบกระทงที่เลือกทั้งหมด <strong>{selectedIds.size} รายการ</strong> อย่างถาวร
              ข้อมูลภาพวาดและคำอธิษฐานจะถูกลบออกจากฐานข้อมูลและไม่สามารถกู้คืนได้
            </div>
            <div className="adm-modal-foot">
              <button
                type="button"
                className="adm-modal-btn-cancel"
                disabled={actionInProgress}
                onClick={() => setBulkDeleteConfirm(false)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="adm-modal-btn-danger"
                disabled={actionInProgress}
                onClick={handleBulkDelete}
              >
                {actionInProgress ? (
                  <>
                    <i className="fas fa-spinner fa-spin" />
                    <span>กำลังลบ...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-trash-alt" />
                    <span>ยืนยันลบ {selectedIds.size} รายการ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scoped CSS Styles ── */}
      <style>{`
        .adm-krathong-root {
          padding: 24px;
          background: #f8fafc;
          min-height: 100%;
          font-family: inherit;
        }

        .adm-krathong-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .adm-krathong-title {
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          display: flex;
          align-items: center;
        }

        .adm-krathong-sub {
          font-size: 13px;
          color: #64748b;
          margin-top: 4px;
        }

        .adm-krathong-link-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0284c7;
          color: #ffffff;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          transition: background 0.15s ease;
        }
        .adm-krathong-link-btn:hover {
          background: #0369a1;
        }

        /* KPIs */
        .adm-krathong-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .adm-kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }

        .adm-kpi-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        .adm-kpi-card.total .adm-kpi-icon { background: #e0f2fe; color: #0284c7; }
        .adm-kpi-card.visible .adm-kpi-icon { background: #dcfce7; color: #16a34a; }
        .adm-kpi-card.hidden .adm-kpi-icon { background: #ffedd5; color: #ea580c; }
        .adm-kpi-card.sadhu .adm-kpi-icon { background: #fef3c7; color: #ca8a04; }

        .adm-kpi-label {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
        }
        .adm-kpi-val {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.2;
          margin: 2px 0;
        }
        .adm-kpi-desc {
          font-size: 11px;
          color: #94a3b8;
        }

        /* Toolbar */
        .adm-krathong-toolbar {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .adm-search-box {
          flex: 1 1 240px;
          position: relative;
          display: flex;
          align-items: center;
        }
        .adm-search-icon {
          position: absolute;
          left: 12px;
          color: #94a3b8;
          font-size: 13px;
        }
        .adm-search-input {
          width: 100%;
          padding: 8px 32px 8px 34px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 13px;
          background: #f8fafc;
          outline: none;
        }
        .adm-search-input:focus {
          border-color: #3b82f6;
          background: #ffffff;
        }
        .adm-search-clear {
          position: absolute;
          right: 8px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 12px;
        }

        .adm-status-tabs {
          display: flex;
          gap: 4px;
          background: #f1f5f9;
          padding: 3px;
          border-radius: 8px;
        }
        .adm-status-tab {
          background: transparent;
          border: none;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .adm-status-tab.active {
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .adm-sort-box {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .adm-sort-label {
          font-size: 12px;
          color: #64748b;
          white-space: nowrap;
        }
        .adm-sort-select {
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 12px;
          background: #ffffff;
          outline: none;
        }

        .adm-view-toggle {
          display: flex;
          gap: 2px;
          background: #f1f5f9;
          padding: 2px;
          border-radius: 6px;
        }
        .adm-view-btn {
          background: transparent;
          border: none;
          padding: 6px 10px;
          font-size: 13px;
          color: #64748b;
          border-radius: 4px;
          cursor: pointer;
        }
        .adm-view-btn.active {
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        /* Bulk Bar */
        .adm-bulk-bar {
          background: #0f172a;
          color: #ffffff;
          padding: 10px 18px;
          border-radius: 10px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
        }
        .adm-bulk-count {
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .adm-bulk-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .adm-bulk-btn {
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .adm-bulk-btn.hide { background: #f97316; color: #ffffff; }
        .adm-bulk-btn.show { background: #16a34a; color: #ffffff; }
        .adm-bulk-btn.delete { background: #dc2626; color: #ffffff; }
        .adm-bulk-btn.cancel { background: rgba(255, 255, 255, 0.15); color: #ffffff; }

        .adm-krathong-subbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding: 0 4px;
        }
        .adm-select-all-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #64748b;
          cursor: pointer;
        }

        /* Grid Cards */
        .adm-krathong-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 16px;
        }

        .adm-kcard {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          position: relative;
          transition: all 0.15s ease;
        }
        .adm-kcard:hover {
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
          border-color: #cbd5e1;
        }
        .adm-kcard.is-selected {
          border-color: #38bdf8;
          background: #f0f9ff;
        }
        .adm-kcard.is-hidden {
          background: #fafaf9;
          opacity: 0.85;
          border-style: dashed;
        }

        .adm-kcard-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .adm-kcard-check input {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .adm-kcard-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 12px;
        }
        .adm-kcard-badge.visible {
          background: #dcfce7;
          color: #15803d;
        }
        .adm-kcard-badge.hidden {
          background: #fee2e2;
          color: #b91c1c;
        }

        .adm-kcard-thumb-wrap {
          width: 100%;
          height: 160px;
          background: radial-gradient(ellipse at center, #0c2045 0%, #030814 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          cursor: pointer;
          overflow: hidden;
          margin-bottom: 12px;
        }
        .adm-kcard-thumb {
          max-width: 90%;
          max-height: 90%;
          object-fit: contain;
          transition: transform 0.2s ease;
        }
        .adm-kcard-thumb-wrap:hover .adm-kcard-thumb {
          transform: scale(1.08);
        }
        .adm-kcard-thumb-none {
          color: #475569;
          font-size: 24px;
        }
        .adm-kcard-zoom-hint {
          position: absolute;
          bottom: 6px;
          right: 6px;
          background: rgba(0, 0, 0, 0.6);
          color: #ffffff;
          padding: 4px 6px;
          border-radius: 4px;
          font-size: 11px;
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .adm-kcard-thumb-wrap:hover .adm-kcard-zoom-hint {
          opacity: 1;
        }

        .adm-kcard-body {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .adm-kcard-name {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .adm-kcard-sadhu {
          font-size: 12px;
          color: #ca8a04;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
          margin: 4px 0 8px 0;
        }
        .adm-kcard-wish {
          font-size: 12px;
          color: #334155;
          line-height: 1.4;
          background: #f8fafc;
          border-left: 3px solid #cbd5e1;
          padding: 6px 8px;
          border-radius: 4px;
          margin-bottom: 8px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          flex: 1;
        }
        .adm-kcard-date {
          font-size: 11px;
          color: #94a3b8;
          margin-bottom: 12px;
        }

        .adm-kcard-actions {
          display: flex;
          gap: 6px;
          border-top: 1px solid #f1f5f9;
          padding-top: 10px;
        }
        .adm-act-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 7px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s ease;
        }
        .adm-act-btn.toggle.hide {
          background: #fff7ed;
          color: #c2410c;
          border-color: #ffedd5;
        }
        .adm-act-btn.toggle.hide:hover {
          background: #ffedd5;
        }
        .adm-act-btn.toggle.unhide {
          background: #f0fdf4;
          color: #15803d;
          border-color: #dcfce7;
        }
        .adm-act-btn.toggle.unhide:hover {
          background: #dcfce7;
        }
        .adm-act-btn.delete {
          background: #fef2f2;
          color: #b91c1c;
          border-color: #fee2e2;
        }
        .adm-act-btn.delete:hover {
          background: #fee2e2;
        }
        .adm-act-btn.sm {
          flex: none;
          padding: 6px 10px;
        }

        /* Table View */
        .adm-krathong-table-wrap {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow-x: auto;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .adm-krathong-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .adm-krathong-table th {
          background: #f8fafc;
          padding: 10px 14px;
          text-align: left;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }
        .adm-krathong-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }
        .adm-krathong-table tr:hover td {
          background: #f8fafc;
        }
        .adm-krathong-table tr.is-selected td {
          background: #f0f9ff;
        }
        .adm-krathong-table tr.is-hidden td {
          background: #fafaf9;
          opacity: 0.85;
        }

        .adm-tbl-thumb-wrap {
          width: 48px;
          height: 48px;
          background: #0a1b38;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
        }
        .adm-tbl-thumb {
          max-width: 90%;
          max-height: 90%;
          object-fit: contain;
        }
        .adm-tbl-thumb-none {
          color: #475569;
          font-size: 16px;
        }
        .adm-tbl-name {
          font-weight: 700;
          color: #0f172a;
        }
        .adm-tbl-id {
          font-size: 11px;
          color: #94a3b8;
          font-family: monospace;
        }
        .adm-tbl-wish {
          color: #334155;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .adm-tbl-sadhu {
          font-weight: 700;
          color: #b45309;
        }
        .adm-tbl-date {
          font-size: 12px;
          color: #64748b;
          white-space: nowrap;
        }

        /* Empty Box */
        .adm-empty-box {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 48px 24px;
          text-align: center;
        }

        /* Modals */
        .adm-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .adm-modal-box {
          background: #ffffff;
          border-radius: 14px;
          width: 100%;
          max-width: 480px;
          overflow: hidden;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
        }
        .adm-modal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-bottom: 1px solid #f1f5f9;
        }
        .adm-modal-close {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 16px;
        }
        .adm-modal-preview-body {
          padding: 20px;
        }
        .adm-modal-canvas-frame {
          width: 100%;
          height: 240px;
          background: radial-gradient(ellipse at center, #0a1b38 0%, #030814 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }
        .adm-modal-img {
          max-width: 90%;
          max-height: 90%;
          object-fit: contain;
        }
        .adm-modal-wish-box {
          font-size: 14px;
          color: #1e293b;
          line-height: 1.5;
          background: #f8fafc;
          padding: 12px 14px;
          border-radius: 8px;
          margin-bottom: 14px;
        }
        .adm-modal-meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .adm-modal-foot {
          padding: 12px 20px;
          background: #f8fafc;
          border-top: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }
        .adm-modal-btn-cancel {
          padding: 8px 16px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
        }
        .adm-modal-btn-danger {
          padding: 8px 16px;
          background: #dc2626;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .adm-modal-btn-danger:hover {
          background: #b91c1c;
        }
      `}</style>
    </div>
  )
}
