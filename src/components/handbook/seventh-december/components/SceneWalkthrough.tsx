import { useState } from 'react';
import {
  CHARACTERS,
  SCENE_3_QUESTIONS,
  GOD_MONOLOGUE,
  ENDINGS_DATA
} from '../data/handbookData';
import { SpokenBox } from './SpokenBox';
import { Case712Timeline } from './Case712Timeline';
import { PuzzleSolver } from './PuzzleSolver';
import { BGMController } from './BGMController';
import {
  Clock,
  Sparkles,
  AlertTriangle,
  Heart,
  HelpCircle,
  Flame,
  FileText,
  Mail,
  Volume2,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';

export const SceneWalkthrough = () => {
  const [activeTab, setActiveTab] = useState<string>('prep');

  const tabs = [
    { id: 'prep', label: 'เตรียมการ', scene: 'Setup' },
    { id: 'prologue', label: 'ก่อนฉาก 1', scene: 'Intro' },
    { id: 'scene1', label: 'ฉาก 1: คดี 7/12', scene: '30 นาที' },
    { id: 'scene2', label: 'ฉาก 2: ไดอารี่', scene: '20 นาที' },
    { id: 'scene3', label: 'ฉาก 3: คัดแยก', scene: '20 นาที' },
    { id: 'scene4', label: 'ฉาก 4: ความทรงจำ', scene: '10 นาที' },
    { id: 'scene5', label: 'ฉาก 5: ฉากจบ', scene: 'Final' },
  ];

  const currentIndex = tabs.findIndex((t) => t.id === activeTab);
  const goToNext = () => {
    if (currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const goToPrev = () => {
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Sticky Top Scene Selector (Mobile-First Horizontal Carousel) */}
      <div className="sticky top-14 z-30 py-2.5 backdrop-blur-xl bg-black/90 -mx-4 px-4 sm:-mx-6 sm:px-6 border-b border-zinc-800/80">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-xl text-xs whitespace-nowrap font-medium transition-all flex items-center gap-1.5 active:scale-95 ${
                activeTab === tab.id
                  ? 'bg-sky-500 text-black font-bold shadow-md shadow-sky-500/20'
                  : 'bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === tab.id
                    ? 'bg-black/30 text-black font-bold'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {tab.scene}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}

      {/* 1. PREPARATION */}
      {activeTab === 'prep' && (
        <section className="space-y-5 animate-in fade-in duration-300">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-sky-950/80 text-sky-400 border border-sky-900/60">
                <FileText size={18} />
              </span>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">ขั้นตอนการเตรียมการ (Setup)</h3>
                <p className="text-xs text-zinc-400">
                  คู่มือจัดเตรียมห้องและอุปกรณ์ก่อนผู้เล่นมาถึง
                </p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs leading-relaxed text-zinc-300">
              <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <h4 className="font-semibold text-white mb-2 flex items-center gap-1.5 text-xs">
                  <Flame size={14} className="text-amber-400" />
                  <span>การจัดเตรียมกล่องและรหัสปริศนา:</span>
                </h4>
                <ul className="list-disc pl-4 space-y-1.5 text-zinc-400">
                  <li>
                    นำ <strong className="text-white">สคริปต์ความทรงจำทั้ง 2 เล่ม</strong> ใส่ในกล่องเล็ก/แฟ้ม แล้วตั้งรหัสล็อกตัวเลข 3 หลัก (<span className="font-mono font-bold text-amber-400">9 4 5</span>)
                  </li>
                  <li>
                    นำกล่องเล็กที่มีตัวล็อกนี้ใส่ลงใน <strong className="text-white">กล่องใหญ่ (ไม่มีตัวล็อก)</strong>
                  </li>
                  <li>
                    นำ <strong className="text-white">ไดอารี่ทั้ง 13 แผ่น</strong>, <strong className="text-white">เบาะแสคดี 7/12 & ชันสูตร 5 แผ่น</strong> และตัวต่อจิ๊กซอว์ 5 ชุด ใส่รวมลงไปในกล่องเล็กก่อนจะใส่ลงไปในกล่องใหญ่
                  </li>
                  <li>
                    เตรียมกระดาษและปากกา 2 ชุด สำหรับให้ผู้เล่นจดบันทึก
                  </li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl border border-indigo-900/50 bg-indigo-950/20">
                <h4 className="font-semibold text-indigo-300 mb-1.5 flex items-center gap-1.5 text-xs">
                  <Sparkles size={14} className="text-indigo-400" />
                  <span>บทบาทของผู้ดำเนินเกม:</span>
                </h4>
                <p className="text-zinc-300">
                  รับหน้าที่เป็น <strong>‘เทพผู้สร้างไดอารี่’</strong> โปรดนำพาให้ผู้เล่นพบกับอดีตของพวกเขา และดื่มด่ำไปกับเรื่องราวให้มากที่สุด
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-rose-900/50 bg-rose-950/20">
                <h4 className="font-semibold text-rose-300 mb-1.5 flex items-center gap-1.5 text-xs">
                  <Volume2 size={14} className="text-rose-400" />
                  <span>เพลงประจำเกม:</span>
                </h4>
                <p className="text-zinc-300">
                  เพลงประจำเกมนี้คือ <strong>‘โลกที่ไม่มีเธอ - PORTRAIT’</strong> แนะนำให้ใช้ <strong>Version อิ้งค์ วรันธร</strong> เพราะฝ่ายที่เจ็บปวดกว่าคือฝั่งผู้หญิง เสียงร้องของผู้หญิงจึงส่งผลต่ออารมณ์มากกว่า
                </p>
              </div>
            </div>
          </div>

          <BGMController />
        </section>
      )}

      {/* 2. PROLOGUE */}
      {activeTab === 'prologue' && (
        <section className="space-y-5 animate-in fade-in duration-300">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base sm:text-lg font-bold text-white">ช่วงนำเข้าสู่เกม (ก่อนฉาก 1)</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                Prologue
              </span>
            </div>

            <SpokenBox
              dialogue={`“มากันอีกแล้วสินะ ว่ากันว่ามนุษย์มีสิทธิตัดสินใจในเรื่องต่าง ๆ อยู่เสมอ ไม่ว่าจะเป็นการตัดสินใจที่ดีหรือร้ายก็จงรับผลของการกระทํา แน่นอนว่าก่อนหน้านี้พวกคุณก็เคยตัดสินใจเรื่องบางอย่างไปแล้ว และวันนี้คงมีเรื่องให้ตัดสินใจเช่นกัน จงตัดสินใจตามที่สมควรเถิด ว่าแต่พวกคุณคือใครกัน?”`}
              instruction="พูดให้เป็นธรรมชาติที่สุด เพื่อไม่ให้ผู้เล่นรู้ตัวว่าพวกเขาอยู่ใน ‘ปรโลก’ ในฉากแรกคนที่คิดว่าตัวเองอยู่บนโลกมนุษย์คือแพม"
              stageName="ก่อนฉาก 1"
            />

            {/* Character Selection */}
            <div className="mt-5 pt-4 border-t border-zinc-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
                การคัดเลือกตัวละคร (มีเพียง 2 ตัว)
              </h4>
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                หากผู้เล่นเป็น ชาย 1 หญิง 1 ให้เลือกตัวละครตามเพศจริง:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CHARACTERS.map((char) => (
                  <div
                    key={char.id}
                    className={`p-3.5 rounded-xl border ${
                      char.id === 'trin'
                        ? 'border-sky-900/50 bg-sky-950/10'
                        : 'border-rose-900/50 bg-rose-950/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-white">
                        {char.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {char.age} ปี
                      </span>
                    </div>
                    <div className="text-xs text-zinc-300 mb-1.5 font-medium">
                      {char.role}
                    </div>
                    <div className="text-[11px] text-zinc-400 space-y-1">
                      <p>• รูปลักษณ์: {char.appearance}</p>
                      <p>• นิสัย: {char.personality}</p>
                      <p className="pt-1 text-amber-400 font-medium">
                        ★ {char.notes}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reading warning reminder */}
              <div className="mt-4 p-3 rounded-xl border border-amber-900/50 bg-amber-950/20 flex items-start gap-2.5 text-xs text-amber-200">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>คำเตือนแก่ผู้เล่น:</strong> เมื่อมอบสคริปต์ตัวละครให้ผู้เล่นแล้ว เตือนผู้เล่นว่า{' '}
                  <span className="underline font-semibold text-white">
                    “ให้อ่านจนถึงหน้าที่ปรากฏข้อความว่า ‘ห้ามเปิดหน้าถัดไปจนกว่าผู้ดำเนินเกมจะอนุญาต’”
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. SCENE 1 */}
      {activeTab === 'scene1' && (
        <section className="space-y-5 animate-in fade-in duration-300">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">ฉาก 1: คดี ‘เหตุการณ์ 7/12’</h3>
                <p className="text-xs text-zinc-400">
                  ภารกิจแนะนำตัว & สืบสวนคดีฆาตกรรม
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-amber-950/80 text-amber-400 border border-amber-900/60 font-semibold">
                <Clock size={13} />
                <span>30 นาที</span>
              </span>
            </div>

            {/* Instruction Steps */}
            <div className="space-y-2 text-xs leading-relaxed text-zinc-300 mb-4">
              <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
                <strong>1. แนะนำตัว:</strong> แพมรู้ชื่อตัวเอง ส่วนตฤณจะไม่รู้ชื่อตนเอง
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
                <strong>2. นำกล่องใหญ่ออกมา:</strong> มอบเอกสาร 5 แผ่น (เบาะแสคดี 7/12 1 แผ่น, บันทึกการสอบสวน 3 แผ่น, ผลการชันสูตร 1 แผ่น)
              </div>
            </div>

            <SpokenBox
              dialogue={`“นี่คือกล่องที่พวกคุณพบในห้องนอนแห่งนี้ ปรากฏว่าด้านในมีข้าวของมากมาย ดังที่พวกคุณรู้ สิ่งที่น่าสนใจในตอนนี้คือ คดี ‘เหตุการณ์ 7/12’ หากศึกษาคดีนี้ดูดี ๆ จนค้นพบฆาตกรในคดีแล้วล่ะก็ ความทรงจำบางส่วนของพวกคุณอาจจะย้อนคืนมาก็ได้ เอ้า ลองดูสิ”`}
              instruction="ให้เวลาศึกษาคดีประมาณ 30 นาที สามารถให้การช่วยเหลือผู้เล่นได้ตามสมควร"
              stageName="ฉาก 1: ส่องคดี"
            />

            {/* Target Questions */}
            <div className="p-3.5 rounded-xl border border-sky-900/50 bg-sky-950/20 my-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-1.5">
                3 คำถามที่ผู้เล่นต้องตอบให้ได้:
              </h4>
              <ol className="text-xs list-decimal pl-4 space-y-1 text-zinc-300">
                <li><strong>คนตรงหน้าคุณคือใคร?</strong> (เฉลย: ตฤณ)</li>
                <li><strong>ฆาตกรในแฟ้มคดีคือใคร?</strong> (เฉลย: เดชา)</li>
                <li><strong>เรียบเรียงลำดับการลงมือและวิธีการก่อเหตุ</strong></li>
              </ol>
            </div>

            <SpokenBox
              dialogue={`“ตอนนี้คงรู้แล้วสินะว่าผู้ชายคนนี้คือใคร? (รอคำตอบจากผู้เล่น) อย่างนั้นก็แปลว่าความทรงจำของเหตุการณ์นี้คืนมาแล้วสินะตฤณ เอาหล่ะมาดูสิว่าความทรงจำอะไรตื่นขึ้นบ้าง ขอให้ทั้งคู่อ่านหน้าต่อไปได้เลย”`}
              instruction="เมื่อผู้เล่นตอบคำถามได้ถูกต้องสมบูรณ์แล้ว ให้อ่านเพื่อเข้าสู่ฉาก 2"
              stageName="ฉาก 1: สรุปคดี"
            />
          </div>

          <Case712Timeline />
        </section>
      )}

      {/* 4. SCENE 2 */}
      {activeTab === 'scene2' && (
        <section className="space-y-5 animate-in fade-in duration-300">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">ฉาก 2: สำรวจและเรียงไดอารี่ 13 แผ่น</h3>
                <p className="text-xs text-zinc-400">
                  ค้นหาไดอารี่ในที่มืดด้วยเทียนไฟฟ้า
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-amber-950/80 text-amber-400 border border-amber-900/60 font-semibold">
                <Clock size={13} />
                <span>20 นาที</span>
              </span>
            </div>

            {/* Atmosphere instructions */}
            <div className="p-3.5 rounded-xl border border-amber-900/50 bg-amber-950/20 mb-4 text-xs space-y-1.5 text-zinc-300">
              <div className="font-bold text-amber-400 flex items-center gap-1.5">
                <Flame size={14} />
                <span>การเซ็ตติ้งห้องและแสงสว่าง:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-zinc-400">
                <li>นำ <strong className="text-white">ไดอารี่ทั้ง 13 แผ่น</strong> วางกระจายทั่วห้องล้อมรอบโต๊ะ</li>
                <li><strong className="text-amber-300">ปิดไฟทั้งห้องหรือหรี่ไฟให้จางที่สุด</strong> ตั้งโคมไฟกลางโต๊ะ</li>
                <li>ให้ผู้เล่นใช้ <strong className="text-white">เทียนไขไฟฟ้า</strong> เดินค้นหาไดอารี่ทั้ง 13 แผ่น</li>
              </ul>
            </div>

            <SpokenBox
              dialogue={`“ตอนนี้กระดาษไดอารี่จากกล่องพวยพุ่งกระจัดกระจาย เพื่อความทรงจำที่มากขึ้น และตอบข้อสงสัยที่ปรากฏในใจของพวกคุณ จงรวบรวมไดอารี่ทั้งหมด และเรียงเหตุการณ์ที่เกิดขึ้นดี ๆ เถิด หวังว่าคงจะไม่ยากจนเกินไปนะ…”`}
              instruction="ให้เวลา 20 นาที เมื่อหาครบ 13 แผ่นแล้ว ให้ผู้เล่นนำมาจัดเรียงตามเหตุการณ์ที่ควรจะเป็นและเรียบเรียงเรื่องราวคร่าว ๆ"
              stageName="ฉาก 2: ค้นหาไดอารี่"
            />

            {/* Critical Warning */}
            <div className="p-4 rounded-xl border border-rose-900/80 bg-rose-950/30 text-xs text-rose-200 space-y-1">
              <div className="font-bold text-rose-400 flex items-center gap-1.5 text-sm">
                <AlertTriangle size={16} />
                <span>** หมายเหตุสำคัญที่สุดสำหรับ DM:</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">
                ไดอารี่ทั้ง 13 แผ่นมีการปะปนกันระหว่างของตฤณและของแพม หากผู้เล่นสังเกตเห็น ให้ DM เพียง ‘รับรู้’ แต่ <strong className="text-rose-400 underline">“ต้องห้ามให้ผู้เล่นคัดแยกในตอนนี้เด็ดขาด”</strong> เพราะจะส่งผลเสียต่อการดำเนินเรื่อง!
              </p>
            </div>

            <div className="mt-4">
              <SpokenBox
                dialogue={`“สังเกตแล้วสินะว่ามีเรื่องบางอย่างแปลก ๆ ปรากฏขึ้นตรงหน้า เหมือนว่าการเรียงไดอารี่จะไม่ช่วยนะ เพราะงั้นลองหาวิธีเพิ่มเติมดูไหม ขอให้ทั้งคู่อ่านหน้าต่อไปได้เลย”`}
                instruction="เมื่อเรียบเรียงและอ่านเนื้อความตามที่ควรจะเป็นแล้ว ให้อ่านเพื่อเปิดหน้าถัดไปเข้าสู่ฉาก 3"
                stageName="ฉาก 2: สรุป"
              />
            </div>
          </div>
        </section>
      )}

      {/* 5. SCENE 3 */}
      {activeTab === 'scene3' && (
        <section className="space-y-5 animate-in fade-in duration-300">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">ฉาก 3: คัดแยกไดอารี่ & 4 ปริศนาสำคัญ</h3>
                <p className="text-xs text-zinc-400">
                  แยกไดอารี่ 2 กอง (ตฤณ vs แพม) และตอบคำถามสะท้อนความจริง
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-amber-950/80 text-amber-400 border border-amber-900/60 font-semibold">
                <Clock size={13} />
                <span>20 นาที</span>
              </span>
            </div>

            <SpokenBox
              dialogue={`“ตอนนี้พวกคุณคงมีคําถามเกิดขึ้นในใจ และแน่นอนว่าวิธีการตามหาคําตอบคือการแยกไดอารี่ออกเป็นสองส่วน แล้วพวกคุณคิดว่าส่วนไหนเป็นของใครกันล่ะ”`}
              instruction="ให้ผู้เล่นแบ่งไดอารี่ออกเป็น 2 กอง (ตฤณ vs แพม) ภายในเวลาประมาณ 20 นาที"
              stageName="ฉาก 3: แยกไดอารี่"
            />

            {/* 4 Questions */}
            <div className="mt-4 space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <HelpCircle size={14} />
                <span>4 คำถามสำคัญและแนวทางสำหรับ DM:</span>
              </h4>

              {SCENE_3_QUESTIONS.map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-900/60 shrink-0">
                      #{idx + 1}
                    </span>
                    <h5 className="text-xs sm:text-sm font-semibold text-white">
                      {item.q}
                    </h5>
                  </div>
                  <div className="pl-6 space-y-1">
                    <div className="text-xs text-emerald-400 font-bold">
                      คำตอบ: {item.answer}
                    </div>
                    <div className="text-[11px] text-zinc-400 leading-relaxed bg-black/60 p-2 rounded-lg border border-zinc-800">
                      <strong className="text-amber-400">แนวทาง DM:</strong> {item.dmTip}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <SpokenBox
                dialogue={`“ตอนนี้พวกคุณคงได้คําตอบมากขึ้นแล้ว แต่คําตอบก็ยังไม่มากพอที่จะทำให้ความทรงจําทั้งหมดมันฟื้นขึ้นมาได้ ถ้าอย่างนั้นคงต้องรื้อฟื้นให้มากขึ้นด้วยของชิ้นอื่น ดังนั้นขอให้ทั้งคู่อ่านหน้าต่อไปได้เลย”`}
                instruction="เมื่อผู้เล่นได้ข้อสังเกตครบถ้วนแล้ว ให้อ่านเพื่อเข้าสู่ฉากที่ 4"
                stageName="ฉาก 3: สรุป"
              />
            </div>
          </div>
        </section>
      )}

      {/* 6. SCENE 4 */}
      {activeTab === 'scene4' && (
        <section className="space-y-5 animate-in fade-in duration-300">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">ฉาก 4: ซ่อมแซม 5 ชิ้น & สคริปต์ความทรงจำ</h3>
                <p className="text-xs text-zinc-400">
                  จิ๊กซอว์ 5 ชิ้น • ส่อง Black Light • รหัส 945
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-amber-950/80 text-amber-400 border border-amber-900/60 font-semibold">
                <Clock size={13} />
                <span>10 นาที</span>
              </span>
            </div>

            <div className="text-xs text-zinc-400 mb-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
              นำ <strong>กล่องจิ๊กซอว์ 5 ชิ้น</strong> และ <strong>กล่องล็อกรหัสสคริปต์ความทรงจำ</strong> ออกมาวาง และ <strong>เปิดไฟ Black Light ที่มุมห้อง</strong>
            </div>

            <SpokenBox
              dialogue={`“ของทั้ง 5 ชิ้นนี้จะทำให้ความทรงจำของพวกคุณตื่นขึ้นทั้งหมด แต่เมื่อซ่อมแซมของเหล่านี้เรียบร้อยแล้ว อย่าลืมหารหัสที่ซ่อนอยู่แล้วเอาไปเปิดความทรงจำให้ได้ล่ะ เอ้า! จัดการซะสิ”`}
              instruction="ให้เวลาต่อภาพและถอดรหัสประมาณ 10 นาที"
              stageName="ฉาก 4: เริ่มมินิเกม"
            />
          </div>

          <PuzzleSolver />

          {/* Reflection & God's Story */}
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
            <h4 className="text-sm sm:text-base font-bold text-white mb-2 flex items-center gap-2">
              <Heart size={16} className="text-rose-400" />
              <span>การอ่านสคริปต์ความทรงจำ & คำถามสะท้อนความรู้สึก</span>
            </h4>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              เมื่อปลดล็อกรหัส [ 9 4 5 ] ได้แล้ว ให้ผู้เล่นอ่านสคริปต์ความทรงจำจนจบ (เปิดเพลงคลอตามคู่มือ BGM) จากนั้นให้ทั้งคู่เล่าความทรงจำ โดย <strong>เริ่มจากแพมก่อน แล้วตามด้วยตฤณ</strong>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div className="p-3.5 rounded-xl border border-rose-900/50 bg-rose-950/20 text-xs">
                <div className="font-bold text-rose-400 mb-1">คำถามที่ DM ถาม ‘แพม’:</div>
                <p className="italic text-zinc-300">
                  “แพม ในความทรงจำของคุณ ความรักของคุณหน้าตาเป็นแบบไหนล่ะ... ความรักที่คุณมีให้เขามันเทียบได้กับอะไรบ้างเหรอ... คุณรู้สึกอย่างไรกับเขา...”
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-sky-900/50 bg-sky-950/20 text-xs">
                <div className="font-bold text-sky-400 mb-1">คำถามที่ DM ถาม ‘ตฤณ’:</div>
                <p className="italic text-zinc-300">
                  “ตฤณ ในความทรงจำของคุณ ความรักของคุณหน้าตาเหมือนคนตรงหน้าหรือเปล่า... ความรักที่คุณมีให้เธอมันเทียบได้กับอะไรบ้างเหรอ... คุณรู้สึกอย่างไรกับเธอกันแน่...”
                </p>
              </div>
            </div>

            {/* Monologue */}
            <div className="p-4 rounded-xl border border-indigo-900/50 bg-indigo-950/10">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-indigo-300 uppercase tracking-wide">
                <Sparkles size={14} className="text-indigo-400" />
                <span>เรื่องเล่าเฉลยความจริงจากปาก ‘เทพผู้สร้างไดอารี่’ (Full Monologue):</span>
              </div>
              <div className="p-3.5 rounded-xl bg-black/70 border border-zinc-800 text-xs sm:text-sm font-serif italic text-zinc-300 leading-relaxed whitespace-pre-line">
                {GOD_MONOLOGUE}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 7. SCENE 5 */}
      {activeTab === 'scene5' && (
        <section className="space-y-5 animate-in fade-in duration-300">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] text-zinc-100 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">ฉาก 5: การตัดสินใจครั้งสุดท้าย & ฉากจบ</h3>
                <p className="text-xs text-zinc-400">
                  ร่างของตฤณกำลังเลือนหาย • พิธีกรรมโปสการ์ด • ดับไฟมืดสนิท
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-900/60 font-bold">
                Climax
              </span>
            </div>

            <SpokenBox
              dialogue={`“ในตอนนี้คงเห็นแล้วว่าร่างของตฤณกําลังจะเลือนหายไป หากชักช้าไม่ทันการ ถ้าตฤณหายไป เขาจะหายไปจากทุก ๆ โลกเลยนะ และถ้าเป็นอย่างนั้น ต่อให้เป็นผม ก็ช่วยอะไรไม่ได้เลย ดังนั้น นี่คือโอกาสครั้งสุดท้ายที่พวกคุณจะจบเรื่องราวเหล่านี้ ผมให้โอกาสพวกคุณอธิษฐานต่อไดอารี่ที่ผมสร้างขึ้นได้อีกครั้ง แต่... สามารถอธิษฐานได้แค่คนเดียวเท่านั้นนะ... แล้วทางไหนคือทางออกของพวกคุณกันล่ะ”`}
              instruction="ให้ผู้เล่นปรึกษาและเลือกทางออกร่วมกัน ซึ่งต้องได้รับการยินยอมจากทั้งสองฝ่าย"
              stageName="ฉาก 5: ทางแยกสุดท้าย"
            />

            {/* 3 Endings */}
            <div className="my-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
                3 ทางเลือกฉากจบที่เป็นไปได้:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {ENDINGS_DATA.map((end) => (
                  <div key={end.id} className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/50 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-bold text-white mb-1">
                        {end.title}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed mb-3">
                        {end.desc}
                      </p>
                    </div>
                    <div className="text-[10px] font-mono px-2 py-1 rounded bg-black/60 text-sky-300 border border-zinc-800 text-center">
                      🔊 {end.audioFile}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Postcard Ritual */}
            <div className="mt-5 pt-4 border-t border-zinc-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5 flex items-center gap-1.5">
                <Mail size={14} />
                <span>พิธีกรรมเขียนโปสการ์ดของแทนใจ:</span>
              </h4>

              <SpokenBox
                dialogue={`“การจากลาอาจไม่ได้งดงามขนาดนั้น บางครั้งอาจต้องถูกเติมเต็มด้วยความเจ็บปวด หรือความชื่นมื่นก็ไม่มีใครรับรู้ได้ และบางทีการเลือกเส้นทางหลังจากนี้อาจทำให้พวกคุณจากกันไปโดยไร้วันหวนคืน ดังนั้นขอให้โปสการ์ดที่อยู่ตรงหน้าของพวกคุณเป็นของแทนใจให้กัน อยากให้อีกฝ่ายได้อ่านอะไร ก็เขียนลงไปแบบนั้นเลยนะ เมื่อเสร็จแล้วก็ให้ส่งให้กับอีกฝ่ายได้เลย ผมจะดลบันดาลให้สิ่งนี้ติดตัวพวกคุณไปไม่ว่าจะเกิดอะไรขึ้น คุณจะได้เห็นหน้าค่าตากัน และคุณจะได้รับรู้ความรู้สึกสุดท้ายนี้ตลอดกาล”`}
                instruction="อ่านด้วยน้ำเสียงซาบซึ้ง ให้ทั้งคู่เขียนโปสการ์ดและผลัดกันอ่านออกเสียง"
                stageName="ฉาก 5: เขียนโปสการ์ด"
              />

              {/* Protocol */}
              <div className="mt-4 p-4 rounded-xl border border-zinc-800 bg-black/60 text-zinc-300 text-xs">
                <div className="font-bold text-white mb-2">ลำดับขั้นตอนการปิดฉากเกม:</div>
                <ol className="list-decimal pl-4 space-y-1.5 text-zinc-400">
                  <li>เขียนโปสการ์ดเสร็จแล้วส่งมอบให้อีกฝ่าย</li>
                  <li>อ่านออกเสียงโปสการ์ด โดย <strong className="text-white">เริ่มจากแพมก่อน แล้วตามด้วยตฤณ</strong></li>
                  <li>แยกผู้เล่น 1 คนที่จะเป็นผู้อธิษฐานออกมาอีกฝั่งหนึ่ง</li>
                  <li>ส่ง <strong className="text-white">การ์ดความปรารถนาสุดท้าย</strong> ให้เขียนตาม <strong className="text-amber-400">โดยไม่ต้องอ่านออกเสียง</strong></li>
                  <li>ปิดไดอารี่แล้วโยนกลับลงในกล่อง</li>
                  <li>พาผู้เล่นกลับมานั่งที่ <strong className="text-rose-400 font-bold">ปิดไฟทุกดวงให้ห้องมืดสนิท</strong></li>
                  <li><strong className="text-sky-400 font-bold">เปิดไฟล์เสียงฉากจบที่เลือก</strong> สิ้นสุดการเดินทาง</li>
                </ol>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Mobile Next / Prev Buttons */}
      <div className="flex items-center justify-between gap-3 pt-3">
        <button
          onClick={goToPrev}
          disabled={currentIndex === 0}
          className={`h-11 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
            currentIndex === 0
              ? 'opacity-30 cursor-not-allowed bg-zinc-900 text-zinc-500'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white active:scale-95'
          }`}
        >
          <ChevronLeft size={16} />
          <span>ฉากก่อนหน้า</span>
        </button>

        <span className="text-xs text-zinc-500 font-mono">
          {currentIndex + 1} / {tabs.length}
        </span>

        <button
          onClick={goToNext}
          disabled={currentIndex === tabs.length - 1}
          className={`h-11 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
            currentIndex === tabs.length - 1
              ? 'opacity-30 cursor-not-allowed bg-zinc-900 text-zinc-500'
              : 'bg-sky-500 text-black hover:bg-sky-400 active:scale-95 shadow-lg shadow-sky-500/20'
          }`}
        >
          <span>ฉากถัดไป</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
