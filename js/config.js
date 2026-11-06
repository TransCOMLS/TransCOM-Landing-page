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
    showLine: true,                    // false = ซ่อนปุ่ม LINE ทั้งเว็บ
    lineId: "@transcomls",             // LINE Official Account
    lineUrl: "https://line.me/R/ti/p/@transcomls",   // ลิงก์เพิ่มเพื่อน
    hours: { th: "ทุกวัน 09:00–17:00 น.", en: "Daily, 9:00–17:00 (GMT+7)" }
  },

  // คู่ภาษา / Language pairs (เพิ่มรายการได้)
  languagePairs: [
    { id: "th-en", th: "ไทย → อังกฤษ", en: "Thai → English" },
    { id: "en-th", th: "อังกฤษ → ไทย", en: "English → Thai" }
  ],

  // ประเภทเอกสารและราคาต่อหน้า / Categories and price per page (THB)
  // ราคาเป็นช่วง [ต่ำสุด, สูงสุด] ต่อหน้า (หรือใส่ตัวเลขเดียวถ้าราคาคงที่)
  // requiresId: ต้องแนบบัตรประชาชน/เอกสารที่ราชการออกให้ (ราคาพิเศษ — แสดงป้าย "ราคาพิเศษ")
  categories: [
    { id: "civil",    normal: [150, 250], express: [300, 450], requiresId: true },
    { id: "official", normal: [250, 350], express: [450, 550] },
    { id: "academic", normal: [250, 350], express: [450, 550] },
    { id: "business", normal: [350, 550], express: [650, 850] },
    { id: "other",    normal: [250, 450], express: [450, 650] }   // เอกสารอื่น ๆ
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

  // ===== หน้าแรก / Home page =====
  // โปรโมชั่นและบริการเด่น — เมื่อเชื่อม Apps Script แล้ว ระบบจะใช้ข้อมูลจากชีต "Promotions"
  // แทนรายการนี้ (ถ้าชีตมีรายการที่เปิดแสดงอย่างน้อย 1 รายการ)
  // start / end: "YYYY-MM-DD" (เว้นว่าง = ไม่จำกัด) · cta: หน้าที่ปุ่มพาไป
  // ใช้ {civilFrom} {minPrice} {expressDays} {normalDays} {certFee} ในข้อความได้
  // โปรดใส่เฉพาะข้อเสนอที่มีจริง
  promotions: [
    {
      tag: { th: "ราคาพิเศษ", en: "Special rate" },
      title: { th: "เอกสารทะเบียนราษฎร เริ่มต้น {civilFrom} บาท/หน้า", en: "Civil registration documents from {civilFrom} THB a page" },
      text: { th: "สูติบัตร ทะเบียนบ้าน บัตรประจำตัวประชาชน ทะเบียนสมรส มรณบัตร และเอกสารอื่นรวม 18 รายการ ในอัตราต่ำกว่าเอกสารราชการทั่วไป",
              en: "Birth certificates, house registrations, ID cards, marriage registrations, death certificates and more — 18 documents at a lower rate than other official documents." },
      cta: "services", start: "", end: ""
    },
    {
      tag: { th: "งานด่วน", en: "Express" },
      title: { th: "รับงานแปลภายใน {expressDays} วันทำการ", en: "Your translation in {expressDays} working days" },
      text: { th: "เลือกบริการแบบด่วนเมื่อต้องใช้เอกสารเร่งด่วน ตรวจสอบราคาได้ทันทีในหน้าคำนวณราคา",
              en: "Choose express when you need the document soon. See the price straight away in the calculator." },
      cta: "calculator", start: "", end: ""
    },
    {
      tag: { th: "ฟรี", en: "Free" },
      title: { th: "สมัครบัญชีฟรี ไม่ต้องตั้งรหัสผ่าน", en: "Free account — no password needed" },
      text: { th: "บันทึกข้อมูลไว้ครั้งเดียว ระบบกรอกแบบฟอร์มส่งงานให้อัตโนมัติ และดูสถานะงานทุกชิ้นได้ในที่เดียว",
              en: "Save your details once. We fill in the job form for you and show all your jobs in one place." },
      cta: "account", start: "", end: ""   // แสดงเมื่อเชื่อม Apps Script แล้วเท่านั้น
    }
  ],

  // ข่าวสารและประกาศ (หน้า "ข่าวสารและประกาศ" ในเมนูบริการและราคา) — โพสต์สี่เหลี่ยมจัตุรัส
  // กดแล้วเปิดป๊อปอัพ · image: ลิงก์รูป https (แนะนำ 1080×1080) หรือเว้นว่างเพื่อใช้ภาพปกอัตโนมัติ
  // text: ขึ้นบรรทัดใหม่ด้วย \n · cta: หน้าที่ปุ่มในป๊อปอัพพาไป (ไม่ใส่ก็ได้)
  // active: true = แสดงบนเว็บ, false = ซ่อนไว้ (ฉบับร่าง) — ถ้าไม่มีโพสต์ที่แสดง หน้าข่าวจะขึ้นว่า "ยังไม่มีข่าวสาร"
  // เมื่อเชื่อม Apps Script แล้ว ระบบจะใช้ข้อมูลจากชีต "News" แทน
  news: [
    {
      active: false, date: "2026-11-03", image: "", cta: "services",
      title: { th: "เพิ่มบริการแปลเอกสารทะเบียนราษฎรในอัตราพิเศษ", en: "New: civil registration documents at a special rate" },
      text: { th: "แปลสูติบัตร ทะเบียนบ้าน ทะเบียนสมรส และเอกสารทะเบียนราษฎรอื่นรวม 18 รายการ ราคาเริ่มต้น {civilFrom} บาทต่อหน้า โปรดแนบบัตรประจำตัวประชาชนหรือเอกสารที่ราชการออกให้ทุกครั้ง",
              en: "We now translate birth certificates, house registrations, marriage registrations and 15 other civil registration documents from {civilFrom} THB a page. Please always attach your ID card or other government-issued ID." }
    },
    {
      active: false, date: "2026-11-03", image: "", cta: "privacy",
      title: { th: "ลบข้อมูลเอกสารทะเบียนราษฎรภายใน {idRetentionDays} วัน", en: "Civil registration data deleted within {idRetentionDays} days" },
      text: { th: "เพื่อคุ้มครองข้อมูลส่วนบุคคล ข้อมูลและสำเนาบัตรของงานเอกสารทะเบียนราษฎรจะถูกลบออกจากระบบภายใน {idRetentionDays} วัน นับจากวันที่ท่านยืนยันว่าเอกสารแปลถูกต้อง",
              en: "To protect your personal data, all data and ID copies for civil registration jobs are deleted within {idRetentionDays} days of the day you confirm the translation is correct." }
    }
  ],

  // ปุ่มลัด "เอกสารที่แปลบ่อย" (cat = id ประเภทเอกสารด้านบน)
  popularDocs: [
    { th: "สูติบัตร", en: "Birth certificate", cat: "civil" },
    { th: "ทะเบียนบ้าน", en: "House registration", cat: "civil" },
    { th: "บัตรประจำตัวประชาชน", en: "ID card", cat: "civil" },
    { th: "ทะเบียนสมรส", en: "Marriage registration", cat: "civil" },
    { th: "ใบแสดงผลการเรียน", en: "Transcript", cat: "academic" },
    { th: "ปริญญาบัตร", en: "Degree certificate", cat: "academic" },
    { th: "สัญญา", en: "Contract", cat: "business" },
    { th: "หนังสือรับรองบริษัท", en: "Company certificate", cat: "business" },
    { th: "ใบขับขี่", en: "Driving licence", cat: "official" },
    { th: "หนังสือรับรองความประพฤติ", en: "Police clearance", cat: "official" }
  ],

  // ระยะเวลาดำเนินการ (วันทำการ) / Turnaround in working days
  turnaround: {
    normal: "3–5",
    express: "1–2"
  },

  // ค่ารับรองคำแปล (ต่องาน) / Certified translation fee (per job)
  certificationFee: 300,

  // ค่าจัดส่งเอกสารฉบับจริงทางไปรษณีย์ (ต่องาน) / Posting the paper copy (per job)
  shippingFee: 50,

  // นโยบาย / Policy values
  revisionDays: 7,        // แก้ไขคำแปลได้ภายในกี่วันหลังส่งงาน
  retentionDays: 90,      // เก็บไฟล์และข้อมูลกี่วันหลังส่งมอบงาน
  privacyUpdated: { th: "4 พฤศจิกายน 2569", en: "4 November 2026" },

  // ไฟล์แนบ / File upload limits
  maxFileMB: 10,
  maxFiles: 10,           // ต่องาน รวมไฟล์เอกสารและไฟล์บัตร (ตรงกับ CONFIG.maxFiles ใน Code.gs)
  allowedExtensions: ["pdf", "jpg", "jpeg", "png", "docx"]
};
