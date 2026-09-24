const ALL_TAGS = ['Emotional', 'Comedy', 'Detective', 'Horror', 'Drama', 'Thriller', 'Romance', 'Action']
const DIFF_OPTIONS = ['Beginner', 'Normal', 'Hard', 'Expert']

export default function FilterSheet({ open, onClose, selectedTags, setSelectedTags, selectedDiff, setSelectedDiff, resultCount, onReset }) {
  const toggleTag = (t) => {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const toggleDiff = (d) => {
    setSelectedDiff(prev => prev === d ? null : d)
  }

  return (
    <div className={`filter-sheet${open ? ' open' : ''}`}>
      <div className="filter-backdrop" onClick={onClose} />
      <div className="filter-panel">
        <div className="filter-handle" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>ตัวกรอง</div>
          <button
            onClick={onReset}
            style={{ background: 'none', border: 'none', color: 'var(--crimson-500)', cursor: 'pointer', fontSize: '13px', fontFamily: "'Sarabun',sans-serif" }}
          >
            ล้างค่า
          </button>
        </div>

        <div className="filter-section-title">แนวเกม</div>
        <div className="chips-row">
          {ALL_TAGS.map(t => (
            <button
              key={t}
              className={`filter-chip${selectedTags.includes(t) ? ' selected' : ''}`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="filter-section-title">ความยาก</div>
        <div className="chips-row">
          {DIFF_OPTIONS.map(d => (
            <button
              key={d}
              className={`filter-chip${selectedDiff === d ? ' selected' : ''}`}
              onClick={() => toggleDiff(d)}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="filter-footer">
          <button className="btn-outline-red" onClick={onClose}>ยกเลิก</button>
          <button className="btn-full-red" onClick={onClose}>
            ดูผลลัพธ์ ({resultCount})
          </button>
        </div>
      </div>
    </div>
  )
}
