/*
 * config.js — ค่าที่แก้ไขได้ของเว็บไซต์ (แก้ไฟล์นี้ไฟล์เดียว ไม่ต้องแตะโค้ดส่วนอื่น)
 * Editable settings. Values in [brackets] are placeholders — replace them.
 * ราคาทั้งหมดเป็นตัวอย่าง โปรดแก้ไขเป็นราคาจริง (หน่วย: บาท)
 */
window.APP_CONFIG = {
  // ชื่อบริการ / Service name (shown in header, footer, page title)
  serviceName: { th: "TransCOM", en: "TransCOM" },

  // URL ของ Google Apps Script Web App (Deploy → Manage deployments — ใช้ URL เดิมเมื่ออัปเดตโค้ด)
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwIY9ZDR8VmNISMM9Z6om3VG8RcFSuYA6giidzOjInc31JrVoVpdxVp4ne-5PKEhDfDFQ/exec",

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

  // คู่ภาษา / Language pairs
  // active: false = เตรียมไว้ ยังไม่เปิดรับ (ไม่แสดงในฟอร์ม แต่ชื่อยังแสดงในงานเก่าได้)
  // เปิดใช้: เปลี่ยนเป็น active: true ที่นี่ และใน LANG_PAIRS ของ apps-script/Code.gs (ต้องตรงกัน)
  // ภาษาเป้าหมายไม่ใช่ไทย → ตราประทับรับรองอิเล็กทรอนิกส์ใช้ข้อความภาษาอังกฤษ
  languagePairs: [
    { id: "th-en", th: "ไทย → อังกฤษ", en: "Thai → English", active: true },
    { id: "en-th", th: "อังกฤษ → ไทย", en: "English → Thai", active: true },
    { id: "th-zh", th: "ไทย → จีน", en: "Thai → Chinese", active: false },
    { id: "zh-th", th: "จีน → ไทย", en: "Chinese → Thai", active: false },
    { id: "th-ja", th: "ไทย → ญี่ปุ่น", en: "Thai → Japanese", active: false },
    { id: "ja-th", th: "ญี่ปุ่น → ไทย", en: "Japanese → Thai", active: false },
    { id: "th-ko", th: "ไทย → เกาหลี", en: "Thai → Korean", active: false },
    { id: "ko-th", th: "เกาหลี → ไทย", en: "Korean → Thai", active: false },
    { id: "th-fr", th: "ไทย → ฝรั่งเศส", en: "Thai → French", active: false },
    { id: "fr-th", th: "ฝรั่งเศส → ไทย", en: "French → Thai", active: false },
    { id: "th-de", th: "ไทย → เยอรมัน", en: "Thai → German", active: false },
    { id: "de-th", th: "เยอรมัน → ไทย", en: "German → Thai", active: false },
    { id: "th-es", th: "ไทย → สเปน", en: "Thai → Spanish", active: false },
    { id: "es-th", th: "สเปน → ไทย", en: "Spanish → Thai", active: false },
    { id: "th-ru", th: "ไทย → รัสเซีย", en: "Thai → Russian", active: false },
    { id: "ru-th", th: "รัสเซีย → ไทย", en: "Russian → Thai", active: false },
    { id: "th-vi", th: "ไทย → เวียดนาม", en: "Thai → Vietnamese", active: false },
    { id: "vi-th", th: "เวียดนาม → ไทย", en: "Vietnamese → Thai", active: false },
    { id: "th-lo", th: "ไทย → ลาว", en: "Thai → Lao", active: false },
    { id: "lo-th", th: "ลาว → ไทย", en: "Lao → Thai", active: false },
    { id: "th-my", th: "ไทย → เมียนมา", en: "Thai → Burmese", active: false },
    { id: "my-th", th: "เมียนมา → ไทย", en: "Burmese → Thai", active: false }
  ],

  // ภาษาที่ผู้แปลเลือกได้ในใบสมัคร (แปลไป-กลับกับภาษาไทย) — ภาษาที่ยังไม่เปิดรับงาน (คู่ภาษา active: false) แสดงแยกไว้
  // Languages a translator can pick (both directions with Thai); the job pairs come from languagePairs above
  translatorLanguages: [
    { code: "en", th: "อังกฤษ", en: "English" },
    { code: "zh", th: "จีน", en: "Chinese" },
    { code: "ja", th: "ญี่ปุ่น", en: "Japanese" },
    { code: "ko", th: "เกาหลี", en: "Korean" },
    { code: "fr", th: "ฝรั่งเศส", en: "French" },
    { code: "de", th: "เยอรมัน", en: "German" },
    { code: "es", th: "สเปน", en: "Spanish" },
    { code: "ru", th: "รัสเซีย", en: "Russian" },
    { code: "vi", th: "เวียดนาม", en: "Vietnamese" },
    { code: "lo", th: "ลาว", en: "Lao" },
    { code: "my", th: "เมียนมา", en: "Burmese" }
  ],
  // ผลสอบภาษาอังกฤษในใบสมัครผู้แปล: ขั้นต่ำ CEFR B1 ตามตารางเทียบของผู้จัดสอบ (ต้องตรงกับ CONFIG.translator.tests ใน Code.gs)
  // English test on the translator application — minimum CEFR B1 (keep in step with Code.gs)
  translatorTests: [
    { id: "ielts", name: "IELTS", min: 0, max: 9, step: 0.5, b1: 4 },
    { id: "toefl", name: "TOEFL iBT", min: 0, max: 120, step: 1, b1: 42 },
    { id: "toeic", name: "TOEIC (Listening & Reading)", min: 10, max: 990, step: 5, b1: 550 },
    { id: "cambridge", name: "Cambridge English Scale", min: 80, max: 230, step: 1, b1: 140 },
    { id: "cefr", name: "CEFR", levels: ["A1", "A2", "B1", "B2", "C1", "C2"], b1: "B1" },
    { id: "other", name: "" }
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
      title: { th: "สมัครบัญชีฟรี เข้าสู่ระบบด้วยอีเมล", en: "Free account — sign in with your email" },
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

  // Electronic certification stamp (owner's design, 2026-11-09): the shop seal (img/seal.png), the check QR
  // and the code, put bottom-right on translation PDFs/images when staff upload them — only for certified
  // jobs WITHOUT a paper copy by post (paper copies get the rubber stamp by hand). The wording follows the
  // translation's language (Thai → English job: English stamp). {code} = the job's check code.
  certStamp: {
    pages: "all",          // "all" pages, or "last" page only
    th: ["เอกสารนี้ได้รับการรับรองผ่านระบบอิเล็กทรอนิกส์", "รหัสรับรองเอกสาร ( {code} )"],
    en: ["This Document has been E-Certified", "Certification Code ( {code} )"]
  },

  // Online payment fees of Beam Checkout (% of the amount paid), shown on the pricing page.
  // Owner's decision 2026-11-09 (final): the shop bears all payment fees (terms 2.5), so the table is hidden.
  // The rates stay here for the owner's reference and for Phase 6 reports.
  showPaymentFees: false,
  paymentFees: [
    { key: "cardStandard", rate: 1.80 },
    { key: "cardPremium", rate: 2.95 },
    { key: "cardOverseas", rate: 3.25 },
    { key: "cardAmex", rate: 3.50 },
    { key: "promptpay", rate: 0.25 }
  ],

  // นโยบาย / Policy values
  revisionDays: 7,        // แก้ไขคำแปลได้ภายในกี่วันหลังส่งงาน
  retentionDays: 90,      // เก็บไฟล์และข้อมูลกี่วันหลังส่งมอบงาน
  privacyUpdated: { th: "4 พฤศจิกายน 2569", en: "4 November 2026" },

  // แสดงจำนวนผู้เยี่ยมชมที่ส่วนท้ายเว็บ (นับจริง 1 ครั้งต่อเครื่องต่อวัน — ต้องเชื่อม Apps Script)
  showVisitorCount: true,

  // ไฟล์แนบ / File upload limits
  maxFileMB: 10,
  maxFiles: 10,           // ต่องาน รวมไฟล์เอกสารและไฟล์บัตร (ตรงกับ CONFIG.maxFiles ใน Code.gs)
  allowedExtensions: ["pdf", "jpg", "jpeg", "png", "docx"]
};
