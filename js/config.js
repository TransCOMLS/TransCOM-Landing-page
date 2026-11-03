/*
 * config.js — ค่าที่แก้ไขได้ของเว็บไซต์ (แก้ไฟล์นี้ไฟล์เดียว ไม่ต้องแตะโค้ดส่วนอื่น)
 * Editable settings. Values in [brackets] are placeholders — replace them.
 * ราคาทั้งหมดเป็นตัวอย่าง โปรดแก้ไขเป็นราคาจริง (หน่วย: บาท)
 */
window.APP_CONFIG = {
  // ชื่อบริการ / Service name (shown in header, footer, page title)
  serviceName: { th: "TransCOM", en: "TransCOM" },

  // URL ของ Google Apps Script Web App (ใส่ใน Phase 3)
  appsScriptUrl: "",

  // ช่องทางติดต่อ / Contact
  contact: {
    email: "contact@prathaitranslation.com",
    phoneDisplay: "080-629-7450",
    phoneTel: "+66806297450",          // ใช้สำหรับปุ่มโทร (รูปแบบสากล ไม่มีขีด)
    lineId: "@xxxx",
    lineUrl: "https://line.me/R/ti/p/@xxxx",
    hours: { th: "จันทร์–ศุกร์ 09:00–17:00 น.", en: "Mon–Fri, 9:00–17:00 (GMT+7)" }
  },

  // คู่ภาษา / Language pairs (เพิ่มรายการได้)
  languagePairs: [
    { id: "th-en", th: "ไทย → อังกฤษ", en: "Thai → English" },
    { id: "en-th", th: "อังกฤษ → ไทย", en: "English → Thai" }
  ],

  // ประเภทเอกสารและราคาต่อหน้า / Categories and price per page (THB)
  // requiresId: ต้องแนบบัตรประชาชน/เอกสารที่ราชการออกให้ (ราคาพิเศษ — แสดงป้าย "ราคาพิเศษ")
  categories: [
    { id: "civil",    normal: 300, express: 450, requiresId: true },
    { id: "official", normal: 400, express: 600 },
    { id: "academic", normal: 450, express: 650 },
    { id: "business", normal: 550, express: 800 },
    { id: "sports",   normal: 500, express: 700 }
  ],

  // เอกสารทะเบียนราษฎร (ประเภท "civil") — แสดงในหน้าบริการ / Civil registration documents
  civilDocuments: [
    { th: "สูติบัตร", en: "Birth certificate" },
    { th: "ทะเบียนบ้าน", en: "House registration" },
    { th: "บัตรประจำตัวประชาชน", en: "Thai national ID card" },
    { th: "ข้อมูลส่วนบุคคลขณะขอมีบัตร", en: "Personal record from ID card application" },
    { th: "หนังสือรับรองการใช้คำนำหน้านาม", en: "Certificate of use of title" },
    { th: "ทะเบียนฐานะแห่งครอบครัว", en: "Family status registration" },
    { th: "แบบรับรองรายการทะเบียนราษฎร", en: "Certified civil registration record" },
    { th: "ใบสำคัญการสมรส", en: "Marriage certificate" },
    { th: "ทะเบียนสมรส", en: "Marriage registration" },
    { th: "ทะเบียนหย่า", en: "Divorce registration" },
    { th: "ใบสำคัญการหย่า", en: "Divorce certificate" },
    { th: "หนังสือสำคัญการจัดตั้งนามสกุล", en: "Surname registration certificate" },
    { th: "หนังสือสำคัญการเปลี่ยนชื่อ", en: "Change of first name certificate" },
    { th: "หนังสือสำคัญแสดงการจดทะเบียนเปลี่ยนชื่อ-สกุล", en: "Change of name and surname certificate" },
    { th: "มรณบัตร", en: "Death certificate" },
    { th: "หนังสือรับรองการใช้อำนาจปกครองบุตร", en: "Certificate of parental authority" },
    { th: "หนังสือรับรองการใช้คำนำหน้านามหญิง", en: "Certificate of use of a woman's title" },
    { th: "หนังสือรับรองสถานภาพการสมรส", en: "Certificate of marital status" }
  ],

  // ลบข้อมูลและไฟล์งานประเภท requiresId ภายในกี่วัน นับจากวันที่ลูกค้ายืนยันว่าเอกสารแปลถูกต้อง
  idRetentionDays: 15,

  // ระยะเวลาดำเนินการ (วันทำการ) / Turnaround in working days
  turnaround: {
    normal: "3–5",
    express: "1–2"
  },

  // ค่ารับรองคำแปล (ต่องาน) / Certified translation fee (per job)
  certificationFee: 300,

  // นโยบาย / Policy values
  revisionDays: 7,        // แก้ไขคำแปลได้ภายในกี่วันหลังส่งงาน
  retentionDays: 90,      // เก็บไฟล์และข้อมูลกี่วันหลังส่งมอบงาน
  privacyUpdated: { th: "4 พฤศจิกายน 2569", en: "4 November 2026" },

  // ไฟล์แนบ / File upload limits
  maxFileMB: 10,
  allowedExtensions: ["pdf", "jpg", "jpeg", "png", "docx"]
};
