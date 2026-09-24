import React, { useState } from 'react';
import { Clock, Users, Flame, ChevronRight, CheckCircle } from 'lucide-react';

const CRIMSON = 'var(--crimson-500)';
const CRIMSON_DEEP = 'var(--crimson-700)';

export default function GameDetailCard() {
  const [selectedRole, setSelectedRole] = useState(null);

  const roles = [
    { id: 1, name: 'ท่านเซบาสเตียน', trait: 'พ่อบ้านผู้สุขุม', desc: 'ผู้กุมความลับทั้งหมดของคฤหาสน์ มีพิรุธในคืนเกิดเหตุ' },
    { id: 2, name: 'คุณหนูเอเลนอร์', trait: 'ทายาทตระกูลดัง', desc: 'มีปากเสียงกับผู้ตายเรื่องมรดกก่อนเกิดเหตุไม่กี่ชั่วโมง' },
    { id: 3, name: 'สารวัตรโฮล์มส์', trait: 'นักสืบภายนอก', desc: 'ได้รับคำสั่งด่วนให้เข้ามาคลี่คลายคดีก่อนรุ่งอรุณ' },
  ];

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden my-8" style={{ border: '1px solid var(--void-100)' }}>

      {/* ── Header Banner ─────────────────────────────── */}
      <div className="relative h-64 flex items-end p-8" style={{ background: CRIMSON_DEEP }}>
        <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(to top, var(--crimson-700) 0%, rgba(var(--crimson-500-rgb), 0.53) 40%, transparent 100%)' }} />
        <img
          src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80"
          alt="คดีปริศนา"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />

        {/* Top-right badge */}
        <div className="absolute top-6 right-6 z-20">
          <span
            className="text-[10px] font-black tracking-[0.2em] uppercase px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'var(--text-on-action)', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)' }}
          >
            Murder Mystery
          </span>
        </div>

        <div className="relative z-20 space-y-2">
          <p className="text-[10px] font-black tracking-[0.25em] uppercase" style={{ color: 'rgba(var(--crimson-500-rgb), 0.80)' }}>
            Script Murder · คดีพิเศษ
          </p>
          <h1 className="font-['Bebas_Neue'] text-3xl sm:text-5xl leading-none uppercase text-white">
            คดีปริศนาในคฤหาสน์สีเลือด
          </h1>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────── */}
      <div className="p-8 space-y-8">

        {/* Quick Info Strip */}
        <div
          className="grid grid-cols-3 gap-0 rounded-xl overflow-hidden"
          style={{ border: '1.5px solid rgba(var(--crimson-500-rgb), 0.20)' }}
        >
          {[
            { Icon: Users, label: 'จำนวนผู้เล่น', value: '5 – 7 คน', accent: false },
            { Icon: Clock, label: 'ระยะเวลา', value: '120 นาที', accent: false },
            { Icon: Flame, label: 'ความยาก', value: 'ปานกลาง', accent: true },
          ].map(({ Icon, label, value, accent }, i, arr) => (
            <div
              key={i}
              className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3 p-4"
              style={{
                background: 'var(--crimson-50)',
                borderRight: i < arr.length - 1 ? '1.5px solid rgba(var(--crimson-500-rgb), 0.20)' : 'none',
              }}
            >
              <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: CRIMSON }} />
              <div className="text-center sm:text-left">
                <p className="text-[10px] font-black tracking-[0.15em] uppercase text-zinc-400">{label}</p>
                <p className="font-bold text-sm mt-0.5" style={{ color: accent ? CRIMSON : 'var(--text-primary)' }}>
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Divider line accent */}
        <div className="flex items-center gap-3">
          <div className="h-[2px] w-8 rounded-full" style={{ background: CRIMSON }} />
          <span className="text-[10px] font-black tracking-[0.25em] uppercase" style={{ color: CRIMSON }}>
            Storyline
          </span>
        </div>

        {/* Storyline */}
        <p className="text-sm leading-relaxed text-zinc-600 -mt-4">
          ในคืนฝนตกหนัก เสียงกรีดร้องดังขึ้นจากห้องทำงานชั้นสองของท่านลอร์ดวิลเลียม
          เมื่อทุกคนไปถึงก็พบร่างไร้วิญญาณของเขาอยู่หน้าโต๊ะทำงาน โดยที่ประตูถูกล็อกจากด้านใน…
          <span className="font-bold text-zinc-800"> หนึ่งในพวกคุณคือฆาตกรตัวจริง!</span>
        </p>

        {/* Character Preview */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-[2px] w-8 rounded-full" style={{ background: CRIMSON }} />
            <span className="text-[10px] font-black tracking-[0.25em] uppercase" style={{ color: CRIMSON }}>
              ตัวละคร
            </span>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            {roles.map((role) => {
              const active = selectedRole === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRole(active ? null : role.id)}
                  className="text-left p-4 rounded-xl transition-all duration-200 focus:outline-none"
                  style={{
                    border: active ? `2px solid ${CRIMSON}` : '2px solid var(--void-200)',
                    background: active ? 'var(--crimson-50)' : 'var(--surface-card)',
                    boxShadow: active ? '0 4px 20px rgba(var(--crimson-500-rgb), 0.13)' : 'none',
                  }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-sm text-zinc-900">{role.name}</span>
                    {active && <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: CRIMSON }} />}
                  </div>
                  <span
                    className="inline-block text-[9px] font-black tracking-[0.1em] uppercase px-2 py-0.5 rounded mb-2"
                    style={{ background: active ? 'rgba(var(--crimson-500-rgb), 0.09)' : 'var(--void-200)', color: active ? CRIMSON : 'var(--text-secondary)' }}
                  >
                    {role.trait}
                  </span>
                  <p className="text-xs text-zinc-500 leading-relaxed">{role.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action */}
        <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-400">เลือกตัวละครแล้ว? กดจองเพื่อยืนยันการเล่น</p>
          <button
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-black text-sm text-white uppercase tracking-widest transition-all hover:opacity-90 active:scale-95"
            style={{ background: CRIMSON, boxShadow: '0 8px 24px rgba(var(--crimson-500-rgb), 0.27)' }}
          >
            <span>จองรอบเล่น</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
