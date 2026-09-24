import { useState } from 'react'
import { db } from '../firebase'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

export default function RegisterModal({ profile, onSuccess, onClose }) {
  const [form, setForm] = useState({
    firstname: '',
    lastname: '',
    nickname: profile?.displayName || '',
    tel_no: '',
    email: '',
    birthday: '',
    gender: '',
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.firstname.trim()) e.firstname = 'กรุณากรอกชื่อจริง'
    if (!form.nickname.trim()) e.nickname = 'กรุณากรอกชื่อเล่น'
    if (!form.tel_no.trim()) e.tel_no = 'กรุณากรอกเบอร์โทร'
    if (!form.gender) e.gender = 'กรุณาเลือกเพศ'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      await setDoc(doc(db, 'members', profile.userId), {
        ...form,
        pictureUrl: profile.pictureUrl || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      onSuccess({
        uid: profile.userId,
        name: form.nickname || form.firstname,
        avatar: profile.pictureUrl || '',
      })
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="register-modal">
        <div className="register-modal-header">
          <h2 className="register-modal-title">สมัครสมาชิก SoFun</h2>
          <p className="register-modal-sub">กรอกข้อมูลเพื่อเริ่มใช้งาน</p>
        </div>

        {profile?.pictureUrl && (
          <div className="register-line-profile">
            <img src={profile.pictureUrl} alt="" className="register-line-avatar" />
            <div>
              <div className="register-line-name">{profile.displayName}</div>
              <div className="register-line-badge"><i className="fab fa-line" /> เชื่อมต่อ LINE แล้ว</div>
            </div>
          </div>
        )}

        <div className="register-form">
          <div className="register-row">
            <div className="register-field">
              <label>ชื่อจริง *</label>
              <input
                className={`party-input${errors.firstname ? ' error' : ''}`}
                placeholder="ชื่อจริง"
                value={form.firstname}
                onChange={e => set('firstname', e.target.value)}
              />
              {errors.firstname && <span className="field-error">{errors.firstname}</span>}
            </div>
            <div className="register-field">
              <label>นามสกุล</label>
              <input className="party-input" placeholder="นามสกุล" value={form.lastname} onChange={e => set('lastname', e.target.value)} />
            </div>
          </div>

          <div className="register-field">
            <label>ชื่อเล่น *</label>
            <input
              className={`party-input${errors.nickname ? ' error' : ''}`}
              placeholder="ชื่อเล่น"
              value={form.nickname}
              onChange={e => set('nickname', e.target.value)}
            />
            {errors.nickname && <span className="field-error">{errors.nickname}</span>}
          </div>

          <div className="register-field">
            <label>เบอร์โทรศัพท์ *</label>
            <input
              className={`party-input${errors.tel_no ? ' error' : ''}`}
              placeholder="08x-xxx-xxxx"
              type="tel"
              value={form.tel_no}
              onChange={e => set('tel_no', e.target.value)}
            />
            {errors.tel_no && <span className="field-error">{errors.tel_no}</span>}
          </div>

          <div className="register-field">
            <label>อีเมล</label>
            <input className="party-input" placeholder="example@email.com" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>

          <div className="register-row">
            <div className="register-field">
              <label>วันเกิด</label>
              <input className="party-input" type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)} />
            </div>
            <div className="register-field">
              <label>เพศ *</label>
              <select
                className={`party-select${errors.gender ? ' error' : ''}`}
                value={form.gender}
                onChange={e => set('gender', e.target.value)}
              >
                <option value="">-- เลือก --</option>
                <option value="ชาย">ชาย</option>
                <option value="หญิง">หญิง</option>
                <option value="อื่นๆ">อื่นๆ</option>
              </select>
              {errors.gender && <span className="field-error">{errors.gender}</span>}
            </div>
          </div>
        </div>

        <div className="register-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>ยกเลิก</button>
          <button className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? <span className="spinner-sm" /> : <><i className="fas fa-check" /> ยืนยันสมัครสมาชิก</>}
          </button>
        </div>
      </div>
    </div>
  )
}
