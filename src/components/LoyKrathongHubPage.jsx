import React, { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export default function LoyKrathongHubPage({ showPage, lineUser }) {
  const [totalKrathongs, setTotalKrathongs] = useState(0)

  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'krathongs'), (snapshot) => {
        const activeCount = snapshot.docs.filter((d) => {
          const data = d.data()
          return data.hidden !== true && data.isVisible !== false
        }).length
        setTotalKrathongs(activeCount)
      }, (err) => {
        console.warn('Could not fetch krathong count:', err)
      })
      return () => unsub()
    } catch {
      // Fallback if firestore not connected
    }
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(120% 90% at 50% -10%, #AF3F16 0%, #2b0b00 35%, #0a1128 75%, #050814 100%)',
      color: '#ffffff',
      fontFamily: "'Sarabun', sans-serif",
      position: 'relative',
      overflowX: 'hidden',
      paddingBottom: '80px',
    }}>
      {/* Authentic Bangkok Temples & Skyline Backdrop Banner */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '380px',
        backgroundImage: "url('/loykrathong-bg.webp'), url('/loykrathong-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center bottom',
        backgroundRepeat: 'no-repeat',
        pointerEvents: 'none',
        opacity: 0.65,
        maskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 65%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 65%, transparent 100%)',
      }} />

      {/* Floating Lanterns in Sky */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '420px',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}>
        {[
          { left: '15%', top: '120px', delay: '0s', size: 14, opacity: 0.75 },
          { left: '28%', top: '60px', delay: '1.2s', size: 18, opacity: 0.85 },
          { left: '48%', top: '140px', delay: '2.5s', size: 12, opacity: 0.6 },
          { left: '72%', top: '190px', delay: '0.8s', size: 16, opacity: 0.7 },
          { left: '86%', top: '90px', delay: '1.9s', size: 20, opacity: 0.9 },
        ].map((item, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: item.left,
              top: item.top,
              width: item.size,
              height: item.size * 1.3,
              borderRadius: '3px 3px 6px 6px',
              background: 'linear-gradient(180deg, #fef08a 0%, #f59e0b 60%, #b45309 100%)',
              boxShadow: `0 0 16px ${item.size}px rgba(245, 158, 11, 0.35)`,
              opacity: item.opacity,
              animation: `floatUpSlow 6s ease-in-out infinite alternate`,
              animationDelay: item.delay,
            }}
          />
        ))}
      </div>

      {/* Top Header Navigation */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(5, 8, 20, 0.85)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => showPage('home')}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <i className="fas fa-arrow-left" /> หน้าหลัก
          </button>
          <span style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#fef08a',
            letterSpacing: '0.02em',
          }}>
            เทศกาลลอยกระทงดิจิทัล 2569
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.7)',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '20px',
            padding: '4px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <i className="fas fa-water" style={{ color: '#f59e0b' }} />
            กระทงในแม่น้ำ {totalKrathongs} ใบ
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: '36px 20px 20px',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Hero Section */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '24px',
            padding: '6px 16px',
            marginBottom: '16px',
            color: '#fef08a',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.15)',
          }}>
            <i className="fas fa-candle-holder" /> สืบสานประเพณีลอยกระทงออนไลน์ Sofun Club
          </div>

          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 44px)',
            fontWeight: 800,
            lineHeight: 1.25,
            margin: '0 0 14px',
            background: 'linear-gradient(135deg, #ffffff 0%, #fef08a 50%, #f59e0b 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
          }}>
            ลอยกระทงสายนที วาดฝันส่งคำอธิษฐาน
          </h1>

          <p style={{
            fontSize: 'clamp(14px, 1.3vw, 16px)',
            color: 'rgba(255, 255, 255, 0.8)',
            maxWidth: '680px',
            margin: '0 auto 28px',
            lineHeight: 1.7,
          }}>
            ร่วมประดิษฐ์กระทงทำมือผ่านระบบสตูดิโอวาดภาพระบายสี ปลดปล่อยจินตนาการพร้อมเขียนคำอธิษฐาน
            และปล่อยกระทงของคุณลงสู่แม่น้ำสายบุญใต้แสงจันทร์วันเพ็ญเพื่อลอยคู่กับผู้เล่นทุกคน
          </p>

          {/* Quick Stats Pill Bar */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '24px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '12px 28px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#fef08a' }}>{totalKrathongs}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>กระทงที่ร่วมลอย</div>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.12)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8' }}>2D Parallax</div>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>แม่น้ำแสงจันทร์</div>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.12)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#4ade80' }}>Real-time</div>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>อัปเดตทันที</div>
            </div>
          </div>
        </div>

        {/* 2 Main Mode Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: '24px',
          marginBottom: '40px',
        }}>
          {/* Card 1: /Krathong */}
          <div
            onClick={() => showPage('krathong')}
            style={{
              background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
              border: '1.5px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '20px',
              padding: '32px 28px',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4), 0 0 24px rgba(245, 158, 11, 0.08)',
              transition: 'transform 0.25s, border-color 0.25s, box-shadow 0.25s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.7)'
              e.currentTarget.style.boxShadow = '0 16px 44px rgba(0, 0, 0, 0.5), 0 0 32px rgba(245, 158, 11, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.35)'
              e.currentTarget.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.4), 0 0 24px rgba(245, 158, 11, 0.08)'
            }}
          >
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: '#ffffff',
              marginBottom: '20px',
              boxShadow: '0 8px 20px rgba(245, 158, 11, 0.35)',
            }}>
              <i className="fas fa-paint-brush" />
            </div>

            <div style={{
              display: 'inline-block',
              fontSize: '11px',
              fontWeight: 700,
              color: '#fef08a',
              background: 'rgba(245, 158, 11, 0.15)',
              padding: '3px 10px',
              borderRadius: '6px',
              marginBottom: '8px',
              letterSpacing: '0.04em',
            }}>
              โหมดผู้เล่น — /Krathong
            </div>

            <h2 style={{
              fontSize: '22px',
              fontWeight: 800,
              margin: '0 0 10px',
              color: '#ffffff',
            }}>
              สตูดิโอวาดและปล่อยกระทง
            </h2>

            <p style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.75)',
              lineHeight: 1.65,
              margin: '0 0 24px',
            }}>
              วาดกระทงด้วยตนเองพร้อมระบบพู่กันหลากหลาย แถบสี RGB ครบวงจร ใส่ชื่อเจ้าของกระทงและเขียนคำอธิษฐานก่อนปล่อยลงสู่แม่น้ำจริง
            </p>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              color: '#fef08a',
              fontWeight: 700,
              fontSize: '14px',
            }}>
              เข้าสู่วาดกระทง <i className="fas fa-arrow-right" style={{ fontSize: '12px' }} />
            </div>
          </div>

          {/* Card 2: /River */}
          <div
            onClick={() => showPage('river')}
            style={{
              background: 'linear-gradient(145deg, rgba(14, 34, 61, 0.7) 0%, rgba(8, 20, 39, 0.9) 100%)',
              border: '1.5px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '20px',
              padding: '32px 28px',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4), 0 0 24px rgba(56, 189, 248, 0.08)',
              transition: 'transform 0.25s, border-color 0.25s, box-shadow 0.25s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.7)'
              e.currentTarget.style.boxShadow = '0 16px 44px rgba(0, 0, 0, 0.5), 0 0 32px rgba(56, 189, 248, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.35)'
              e.currentTarget.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.4), 0 0 24px rgba(56, 189, 248, 0.08)'
            }}
          >
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: '#ffffff',
              marginBottom: '20px',
              boxShadow: '0 8px 20px rgba(2, 132, 199, 0.35)',
            }}>
              <i className="fas fa-water" />
            </div>

            <div style={{
              display: 'inline-block',
              fontSize: '11px',
              fontWeight: 700,
              color: '#7dd3fc',
              background: 'rgba(56, 189, 248, 0.15)',
              padding: '3px 10px',
              borderRadius: '6px',
              marginBottom: '8px',
              letterSpacing: '0.04em',
            }}>
              ชมแบบเต็มจอ — /River
            </div>

            <h2 style={{
              fontSize: '22px',
              fontWeight: 800,
              margin: '0 0 10px',
              color: '#ffffff',
            }}>
              แม่น้ำสายบุญ 2D Parallax
            </h2>

            <p style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.75)',
              lineHeight: 1.65,
              margin: '0 0 24px',
            }}>
              เปิดมุมมองแม่น้ำเจ้าพระยาพร้อมฉากหลังวัดไทยใต้แสงจันทร์ ชมกระทงของผู้เล่นทุกคนลอยเอื่อย คลิกที่กระทงเพื่ออ่านคำอธิษฐานที่ลอยไปด้วยกัน
            </p>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              color: '#7dd3fc',
              fontWeight: 700,
              fontSize: '14px',
            }}>
              เปิดชมแม่น้ำ <i className="fas fa-arrow-right" style={{ fontSize: '12px' }} />
            </div>
          </div>
        </div>

        {/* Culture & Lore Card */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px',
        }}>
          <div style={{
            fontSize: '22px',
            color: '#f59e0b',
            background: 'rgba(245, 158, 11, 0.1)',
            padding: '12px',
            borderRadius: '12px',
            flexShrink: 0,
          }}>
            <i className="fas fa-feather-pointed" />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px', color: '#fef08a' }}>
              ขอขมาพระแม่คงคาและส่งต่อความปรารถนาดี
            </h3>
            <p style={{ fontSize: '13.5px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.6, margin: 0 }}>
              ประเพณีลอยกระทงจัดขึ้นในคืนวันเพ็ญเดือนสิบสอง เพื่อแสดงความสำนึกในพระคุณและขอขมาต่อพระแม่คงคาที่มอบสายน้ำหล่อเลี้ยงชีวิต
              และเป็นโอกาสในการปล่อยวางสิ่งไม่ดี พร้อมตั้งจิตอธิษฐานต้อนรับความสุขและความสำเร็จร่วมกัน
            </p>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes floatUpSlow {
          0% { transform: translateY(0) scale(1); }
          100% { transform: translateY(-16px) scale(1.05); }
        }
      `}</style>
    </div>
  )
}
