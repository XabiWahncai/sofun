// Default receipt and order-in slip settings
export const DEFAULT_RECEIPT_SETTINGS = {
  // ข้อมูลร้าน / บริษัท (Company & Store Info)
  companyNameEn: 'Sofun Club Co., Ltd.',
  companyNameTh: 'บริษัท โซฟัน จำกัด',
  branch: 'สาขาอาร์ซีเอ (RCA)',
  addressLine1: '21/81 ซอยศูนย์วิจัย แขวงบางกะปิ เขตห้วยขวาง',
  addressLine2: 'กรุงเทพ 10310',
  taxId: '0105565117207',
  website: 'www.sofunclub.com',
  phone: '+66 0814661166',
  footerSlogan: 'Just so fun!',
  footerThankYou: 'Thank you very much',

  // การตั้งค่าใบสลีปชำระเงิน (Payment Receipt Settings)
  paymentSlip: {
    title: 'ORDER',
    paperWidth: '80mm', // '80mm' | '58mm'
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    headerFontSize: 15,
    fontWeight: 'normal', // 'normal' | '500' | '600' | 'bold' | '800'
    lineHeight: 1.3,
    headerAlign: 'center', // 'center' | 'left'
    separatorStyle: 'dashed', // 'dashed' | 'solid' | 'double' | 'equal' | 'dots'
    showCompanyEn: true,
    showCompanyTh: true,
    showBranch: true,
    showTaxId: true,
    showAddress: true,
    showPhone: true,
    showWebsite: true,
    showSlogan: true,
    showVat: true,
    vatRate: 7,
    showRoomGst: true,
    showPaidBadge: true,
    showSerialChk: true,
    showPrintTimes: true,
  },

  // การตั้งค่า Order In (Kitchen / Bar / Order Slip)
  orderIn: {
    headerTitle: 'ORDER IN',
    subHeader: 'สาขาอาร์ซีเอ (RCA)',
    paperWidth: '80mm',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    headerFontSize: 18,
    itemFontSize: 14,
    fontWeight: 'bold',
    lineHeight: 1.35,
    headerAlign: 'center',
    separatorStyle: 'equal',
    showCompanyHeader: true,
    showRoomGst: true,
    showTime: true,
    showOrderedBy: true,
    showItemPrice: true,
    showAddons: true,
    showStatusBadge: true,
    kitchenNote: '',
  }
}

export const AVAILABLE_FONTS = [
  { label: 'Courier New (คลาสสิก Thermal Monospace)', value: "'Courier New', monospace" },
  { label: 'Sarabun (ไทย สารบรรณ คมชัด อ่านง่าย)', value: "'Sarabun', sans-serif" },
  { label: 'Prompt (โมเดิร์น สวยงามทันสมัย)', value: "'Prompt', sans-serif" },
  { label: 'Tahoma (กะทัดรัด ตัวหนาชัดเจน)', value: "'Tahoma', sans-serif" },
  { label: 'Monospace (ฟอนต์ระบบเครื่องพิมพ์)', value: "monospace" },
]

export const SEPARATOR_STYLES = [
  { id: 'dashed', label: 'เส้นประ (- - - -)', sample: '- - - - - - - - - - - - - -' },
  { id: 'solid', label: 'เส้นทึบ (────────)', sample: '──────────────────────────' },
  { id: 'double', label: 'เส้นคู่ (════════)', sample: '══════════════════════════' },
  { id: 'equal', label: 'เครื่องหมายเท่ากับ (====)', sample: '==========================' },
  { id: 'dots', label: 'จุดไข่ปลา (· · · ·)', sample: '· · · · · · · · · · · · ·' },
]

export const PAPER_WIDTHS = [
  { id: '80mm', label: '80 mm (เครื่องพิมพ์ขนาดมาตรฐาน - 302px)', bodyWidth: 302 },
  { id: '58mm', label: '58 mm (เครื่องพิมพ์พกพา/ขนาดเล็ก - 215px)', bodyWidth: 215 },
]

export const FONT_WEIGHTS = [
  { id: 'normal', label: 'ปกติ (400)' },
  { id: '600', label: 'กึ่งหนา (600)' },
  { id: 'bold', label: 'หนา (700)' },
  { id: '800', label: 'หนามาก (800)' },
]

const p2 = n => String(Math.round(n)).padStart(2, '0')
export const fmtSlipDT = d => {
  if (!d) return 'N/A'
  const dt = d instanceof Date ? d : (d?.toDate ? d.toDate() : (d?.seconds ? new Date(d.seconds * 1000) : new Date(d)))
  if (isNaN(dt.getTime())) return 'N/A'
  return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}`
}

function getSeparatorCSS(style) {
  switch (style) {
    case 'solid': return 'border-top: 1px solid #000;'
    case 'double': return 'border-top: 3px double #000;'
    case 'dots': return 'border-top: 1px dotted #000;'
    case 'equal': return 'border-top: 2px solid #000;'
    case 'dashed':
    default:
      return 'border-top: 1px dashed #000;'
  }
}

function getSeparatorText(style, len = 30) {
  switch (style) {
    case 'solid': return '─'.repeat(len)
    case 'double': return '═'.repeat(len)
    case 'equal': return '='.repeat(len)
    case 'dots': return '· '.repeat(Math.floor(len / 2))
    case 'dashed':
    default:
      return '- '.repeat(Math.floor(len / 2))
  }
}

// ── HTML Builder for Payment Receipt ──────────────────────────────────────────
export function buildSlipHTML({
  serial = 1,
  members = [],
  room = '',
  scriptTitle = '',
  gameUnitPrice = 0,
  gameTotal = 0,
  foodItems = [],
  discount = null,
  grandTotal = 0,
  openAt = new Date(),
  printAt = new Date(),
  printCount = 1,
  customerName = '',
  characterName = '',
  ending = '',
}, customSettings = null) {
  const cfg = {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...customSettings,
    paymentSlip: {
      ...DEFAULT_RECEIPT_SETTINGS.paymentSlip,
      ...customSettings?.paymentSlip,
    }
  }
  const ps = cfg.paymentSlip
  const serialStr = String(serial || 1).padStart(10, '0')
  const chkStr = String(serial || 1).padStart(5, '0') + '/' + (members?.length || 1)
  const vatRate = Number(ps.vatRate) || 7
  const tax = ps.showVat ? (grandTotal * vatRate / (100 + vatRate)) : 0
  const subtotal = grandTotal - tax
  const discAmt = discount?.applied || 0

  const itemRows = []
  if (gameUnitPrice > 0) {
    // Per-person slip: show the unit price (what this customer actually pays for the game),
    // not the total × N (that would mismatch grandTotal which is also per-person)
    itemRows.push(`<tr><td>${scriptTitle || 'เกม'}</td><td class="r">${Number(gameUnitPrice || 0).toFixed(2)}</td></tr>`)
  }
  ;(foodItems || []).forEach(fi => {
    const addStr = fi.addons?.length ? ` (${fi.addons.map(a => a.name).join(',')})` : ''
    itemRows.push(`<tr><td>${fi.name}${addStr} ×${fi.qty}</td><td class="r">${((fi.price || 0) * (fi.qty || 1)).toFixed(2)}</td></tr>`)
  })

  const paperWidth = ps.paperWidth || '80mm'
  const is58 = paperWidth === '58mm'
  const bodyWidthPx = is58 ? 215 : 302
  const sepCSS = getSeparatorCSS(ps.separatorStyle)

  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8"><title>Receipt #${serialStr}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:${ps.fontFamily};
  font-size:${ps.fontSize}px;
  font-weight:${ps.fontWeight};
  line-height:${ps.lineHeight};
  color:#000;
  background:#fff;
  width:${bodyWidthPx}px;
  margin:0 auto;
  padding:10px 8px;
}
.c{text-align:${ps.headerAlign || 'center'}}
.b{font-weight:bold}
.head-title{font-size:${ps.headerFontSize}px;font-weight:bold;margin-bottom:2px}
.sep{border:none;${sepCSS}margin:6px 0}
table{width:100%;border-collapse:collapse}
td{padding:2px 0;vertical-align:top}
td.r{text-align:right;white-space:nowrap;padding-left:6px}
.foot{font-size:${Math.max(9, ps.fontSize - 2)}px;text-align:center;line-height:1.4}
@media print{
  @page{margin:0;size:${paperWidth} auto}
  body{width:${paperWidth};padding:6px 4px}
}
</style></head><body>
${ps.showCompanyEn && cfg.companyNameEn ? `<div class="c head-title">${cfg.companyNameEn}</div>` : ''}
${ps.showCompanyTh && cfg.companyNameTh ? `<div class="c">${cfg.companyNameTh}</div>` : ''}
${ps.showBranch && cfg.branch ? `<div class="c">${cfg.branch}</div>` : ''}
${ps.showSerialChk ? `<div>Serial: ${serialStr}</div><div>CHK: ${chkStr}</div>` : ''}
<div>Open at: ${fmtSlipDT(openAt)}</div>
<hr class="sep">
${ps.showRoomGst ? `<div class="c">ROOM: ${room || '-'} | GST: ${members?.length || 1}</div><hr class="sep">` : ''}
${customerName ? `<div>Customer: ${customerName}${characterName ? ` (${characterName})` : ''}</div>` : ''}
<div class="c b">${ps.title || 'ORDER'}</div>
<table>${itemRows.join('')}${discAmt > 0 ? `<tr><td>Discount (${discount.type === 'percent' ? discount.value+'%' : '฿'+discount.value})</td><td class="r">-${discAmt.toFixed(2)}</td></tr>` : ''}</table>
<hr class="sep">
<table>
<tr><td>Subtotal:</td><td class="r">${subtotal.toFixed(2)}</td></tr>
${ps.showVat ? `<tr><td>Tax (${vatRate}%):</td><td class="r">${tax.toFixed(2)}</td></tr>` : ''}
<tr class="b"><td>Total:</td><td class="r">${grandTotal.toFixed(2)}</td></tr>
<tr><td>Cash:</td><td class="r">${grandTotal.toFixed(2)}</td></tr>
</table>
<hr class="sep">
${ps.showPaidBadge ? `<div>[PAID]</div>` : ''}
${ending ? `<div>Result: ${ending}</div>` : ''}
<div>Print at: ${fmtSlipDT(printAt)}</div>
${ps.showPrintTimes ? `<div>Times of Printing: ${printCount}</div>` : ''}
<br>
<div class="foot">
${ps.showAddress && cfg.addressLine1 ? `<div>${cfg.addressLine1}</div>` : ''}
${ps.showAddress && cfg.addressLine2 ? `<div>${cfg.addressLine2}</div>` : ''}
${ps.showTaxId && cfg.taxId ? `<div>Tax ID No.${cfg.taxId}</div>` : ''}
${ps.showWebsite && cfg.website ? `<div>${cfg.website}</div>` : ''}
${ps.showPhone && cfg.phone ? `<div>Tell ${cfg.phone}</div>` : ''}
${ps.showSlogan && cfg.footerSlogan ? `<div>${cfg.footerSlogan}</div>` : ''}
${ps.showSlogan && cfg.footerThankYou ? `<div>${cfg.footerThankYou}</div>` : ''}
</div>
</body></html>`
}

// ── HTML Builder for Kitchen / Order In Ticket ───────────────────────────────
export function buildKitchenTicketHTML(items = [], session = {}, now = new Date(), isPaid = false, customSettings = null) {
  const cfg = {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...customSettings,
    orderIn: {
      ...DEFAULT_RECEIPT_SETTINGS.orderIn,
      ...customSettings?.orderIn,
    }
  }
  const oi = cfg.orderIn
  const paperWidth = oi.paperWidth || '80mm'
  const is58 = paperWidth === '58mm'
  const bodyWidthPx = is58 ? 215 : 302
  const sepCSS = getSeparatorCSS(oi.separatorStyle)

  const row = (label, price, indent = false) =>
    `<tr><td style="word-break:break-word;padding-left:${indent ? 12 : 0}px;font-size:${indent ? oi.fontSize : oi.itemFontSize}px">${label}</td>${oi.showItemPrice ? `<td class="p" style="font-size:${oi.itemFontSize}px">${price}</td>` : ''}</tr>`

  const rows = `<table>${(items || []).flatMap(qi => {
    const addonSum = (qi.addons || []).reduce((s, a) => s + (a.price || 0), 0)
    const baseTotal = ((qi.totalPrice || qi.price || 0) - addonSum) * (qi.qty || 1)
    const byName = (oi.showOrderedBy && qi.orderedBy?.name) ? `(${qi.orderedBy.name.split(' ')[0]})` : ''
    const label = `${qi.name}${qi.qty > 1 ? ` ×${qi.qty}` : ''} ${byName}`.trim()
    const addonLines = (oi.showAddons && qi.addons?.length)
      ? qi.addons.map(a => row(`+ ${a.name}${qi.qty > 1 ? ` ×${qi.qty}` : ''}`, oi.showItemPrice ? ((a.price || 0) * (qi.qty || 1)).toFixed(2) : '', true))
      : []
    const noteLines = qi.note
      ? [`<tr><td colspan="${oi.showItemPrice ? 2 : 1}" style="padding-left:12px;font-size:${oi.fontSize}px;font-weight:bold;font-style:italic">** ${qi.note} **</td></tr>`]
      : []
    return [row(label, baseTotal.toFixed(2), false), ...addonLines, ...noteLines]
  }).join('')}</table>`

  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8"><title>${oi.headerTitle || 'Kitchen Ticket'}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:${oi.fontFamily};
  font-size:${oi.fontSize}px;
  font-weight:${oi.fontWeight};
  line-height:${oi.lineHeight};
  color:#000;
  background:#fff;
  width:${bodyWidthPx}px;
  margin:0 auto;
  padding:10px 8px;
}
.c{text-align:${oi.headerAlign || 'center'}}
.b{font-weight:bold}
.head-title{font-size:${oi.headerFontSize}px;font-weight:bold;margin-bottom:2px}
.sep{border:none;${sepCSS}margin:6px 0}
table{width:100%;border-collapse:collapse}
td{padding:2px 0;vertical-align:top}
td.p{white-space:nowrap;text-align:right;padding-left:8px;width:1%}
@media print{
  @page{margin:0;size:${paperWidth} auto}
  body{width:${paperWidth};padding:6px 4px}
}
</style></head><body>
<div class="c head-title">${oi.headerTitle || 'ORDER IN'}</div>
${oi.showCompanyHeader && cfg.companyNameTh ? `<div class="c">${cfg.companyNameTh}</div>` : ''}
${oi.subHeader ? `<div class="c">${oi.subHeader}</div>` : ''}
<hr class="sep">
${oi.showRoomGst ? `<div>ROOM: ${session.room || '-'} GST: ${session.members?.length || 0}</div><hr class="sep">` : ''}
${rows}
<hr class="sep">
${oi.showStatusBadge ? `<div>[${isPaid ? 'PAID' : 'OPEN'}]</div>` : ''}
${oi.showTime ? `<div>Print at: ${fmtSlipDT(now)}</div><div>Times of Printing: 1</div>` : ''}
${oi.kitchenNote ? `<div style="margin-top:6px;font-style:italic">* ${oi.kitchenNote}</div>` : ''}
</body></html>`
}
