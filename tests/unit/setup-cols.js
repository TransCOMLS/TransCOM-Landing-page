const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
// Simulate the owner's sheet before Phase 5: Jobs with the 24 Phase 3/4 headers, Users with 9, 26 columns max
const old = ['เลขที่งาน','วันที่ส่งงาน','สถานะ','ชื่อ–นามสกุล','อีเมล','LINE ID','โทรศัพท์','คู่ภาษา','ประเภทเอกสาร','จำนวนหน้า','วันที่ต้องการรับงาน','รับรองคำแปล','จัดส่งฉบับจริง','ที่อยู่จัดส่ง','การสะกดชื่อ','หมายเหตุ','โฟลเดอร์ไฟล์','ภาษาลูกค้า','แนบบัตร (ทะเบียนราษฎร)','ลูกค้ายืนยันความถูกต้องเมื่อ','กำหนดลบข้อมูล','จำนวนไฟล์','ส่งมอบเมื่อ','ลบข้อมูลแล้วเมื่อ'];
const ss = g.ctx.SpreadsheetApp.getActiveSpreadsheet();
const J = ss.insertSheet('Jobs'); J.data.push(old.slice()); J.data.push(old.map((h, i) => i === 0 ? 'TR-2569-0001' : i === 2 ? 'ได้รับงานแล้ว' : 'x'));
const U = ss.insertSheet('Users'); U.data.push(['อีเมล','ชื่อ–นามสกุล','LINE ID','โทรศัพท์','การสะกดชื่อ (หนังสือเดินทาง)','คู่ภาษาที่ใช้บ่อย','ภาษาเว็บไซต์','สมัครเมื่อ','เข้าสู่ระบบล่าสุด']);
J.maxCols = 26; U.maxCols = 26;
let err = null; try { g.ctx.setup(); } catch (e) { err = e.message; }
ok(!err, 'setup runs on a 26-column sheet that needs 29 columns ' + (err || ''));
const width = J.data[0].length;
ok(width > 26 && J.data[0].slice(0, 24).join() === old.join() && J.data[0].includes('คำขอแก้ไขล่าสุด') && J.data[0].includes('รหัสตรวจสอบการรับรอง') && J.maxCols >= width, 'Jobs widened, old headers kept in place, new headers added at the right (' + width + ' columns)');
ok(J.data[1][0] === 'TR-2569-0001' && J.data[1][2] === 'ได้รับงานแล้ว', 'existing job row untouched');
let err2 = null; try { g.ctx.setup(); } catch (e) { err2 = e.message; }
ok(!err2 && J.data[0].length === width && J.data[1][0] === 'TR-2569-0001', 'running setup again changes nothing');
