/*
 * terms.js — ข้อกำหนดและเงื่อนไขการรับบริการ (Terms and Conditions of Service), TH + EN
 * Source of truth: the owner's Claude doc "ข้อกำหนดและเงื่อนไขการรับบริการ TransCOM".
 * Edit the legal text here only; app.js renders it into #terms and the pop-up.
 * Format: each section has a title and blocks; a string = paragraph, {list: [...]} = bullet list.
 * **text** = bold. Numbers in the text are written out by hand (e.g. "เจ็ด (7)") and do not
 * follow config.js — update both if a policy number changes.
 */
window.TERMS = {
  th: {
    intro: [
      "ข้อกำหนดและเงื่อนไขการรับบริการฉบับนี้ (ต่อไปนี้เรียกว่า “ข้อกำหนด”) ใช้บังคับกับการให้บริการแปลเอกสาร การรับรองคำแปล และบริการอื่นที่เกี่ยวเนื่องของ TransCOM ทุกช่องทาง ได้แก่ เว็บไซต์ ระบบสั่งงาน และอีเมล",
      "ผู้รับบริการซึ่งส่งเอกสารผ่านแบบฟอร์ม ทำเครื่องหมายแสดงความยินยอม หรือชำระค่าบริการ ให้ถือว่าได้อ่าน เข้าใจ และยอมรับข้อกำหนดนี้ทุกประการ ข้อกำหนดนี้ ใบเสนอราคา และข้อความยืนยันการรับงาน รวมกันเป็นสัญญาระหว่างผู้ให้บริการกับผู้รับบริการ หากใบเสนอราคากำหนดเงื่อนไขเฉพาะงานไว้แตกต่างจากข้อกำหนดนี้ ให้ใช้ใบเสนอราคาบังคับเฉพาะงานนั้น เว้นแต่ในเรื่องข้อจำกัดความรับผิด การคุ้มครองข้อมูลส่วนบุคคล และเหตุสุดวิสัย ให้ใช้ข้อกำหนดนี้",
      "ผู้รับบริการซึ่งเป็นผู้เยาว์ต้องได้รับความยินยอมจากผู้แทนโดยชอบธรรมก่อนใช้บริการ"
    ],
    sections: [
      {
        title: "ข้อ 1 คำนิยาม",
        blocks: [
          "ในข้อกำหนดและเงื่อนไขนี้",
          { list: [
            "**ผู้ให้บริการ** หมายถึง TransCOM โดย นายชุษณะ รุ่งเป้า ซึ่งเป็นผู้ควบคุมข้อมูลส่วนบุคคลตามข้อกำหนดนี้",
            "**ผู้รับบริการ** หมายถึง บุคคลหรือนิติบุคคลที่ส่งเอกสารหรือว่าจ้างผู้ให้บริการ รวมถึงผู้ซึ่งกระทำการแทนบุคคลหรือนิติบุคคลนั้น",
            "**บริการ** หมายถึง การแปลเอกสาร การตรวจทาน การรับรองคำแปล และบริการอื่นที่เกี่ยวเนื่องซึ่งระบุไว้ในใบเสนอราคา",
            "**เอกสารต้นฉบับ** หมายถึง ไฟล์หรือเอกสารที่ผู้รับบริการส่งมาเพื่อแปล",
            "**งานแปล** หมายถึง คำแปลของเอกสารต้นฉบับที่ผู้ให้บริการส่งมอบ",
            "**คำรับรองคำแปล** หมายถึง ข้อความที่ผู้ให้บริการรับรองว่างานแปลถูกต้องตรงตามเอกสารต้นฉบับที่ได้รับ ไม่รวมการรับรองความถูกต้องหรือความแท้จริงของเอกสารต้นฉบับ",
            "**ใบเสนอราคา** หมายถึง เอกสารหรือข้อความทางอีเมลที่ผู้ให้บริการแจ้งค่าบริการ ขอบเขตงาน และกำหนดส่งงานสำหรับงานแต่ละงาน",
            "**วันทำการ** หมายถึง วันจันทร์ถึงวันศุกร์ ยกเว้นวันหยุดราชการและวันหยุดที่ผู้ให้บริการประกาศล่วงหน้า",
            "**หน่วยงานปลายทาง** หมายถึง สถานเอกอัครราชทูต หน่วยงานของรัฐ สถานศึกษา หรือบุคคลอื่นที่ผู้รับบริการจะนำงานแปลไปยื่น",
            "**ข้อมูลส่วนบุคคล** หมายความตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (ต่อไปนี้เรียกว่า “พ.ร.บ. คุ้มครองข้อมูลฯ”)"
          ] }
        ]
      },
      {
        title: "ข้อ 2 การให้บริการ",
        blocks: [
          "2.1 **ขอบเขตบริการ** ผู้ให้บริการรับแปลเอกสารภาษาไทย–อังกฤษ และออกคำรับรองคำแปลเมื่อผู้รับบริการร้องขอ ผู้ให้บริการแปลตามความหมายของเอกสารต้นฉบับ และใช้ดุลพินิจทางวิชาชีพในการเลือกถ้อยคำ ศัพท์เฉพาะ และการถอดอักษรชื่อเฉพาะ เว้นแต่ผู้รับบริการระบุการสะกดไว้เป็นหนังสือ บริการไม่รวมการรับรองเอกสารโดยกรมการกงสุล สถานเอกอัครราชทูต หรือโนตารี การจัดส่งเอกสารฉบับพิมพ์ และการจัดรูปแบบให้เหมือนต้นฉบับทุกประการ เว้นแต่ระบุไว้ในใบเสนอราคา",
          "2.2 **สิทธิปฏิเสธหรือระงับงาน** ผู้ให้บริการมีสิทธิปฏิเสธหรือระงับงานได้ทุกขั้นตอน หากเอกสารมีเนื้อหาขัดต่อกฎหมายหรือศีลธรรมอันดีของประชาชน มีเหตุอันควรสงสัยว่าเอกสารปลอม ตัดต่อ หรือจะนำไปใช้ในการกระทำความผิด อยู่นอกความชำนาญของผู้ให้บริการ อ่านไม่ออกจนไม่อาจแปลได้ หรือผู้รับบริการไม่ปฏิบัติตามข้อกำหนดนี้",
          "2.3 **ข้อความที่อ่านไม่ออก** ส่วนของเอกสารต้นฉบับที่อ่านไม่ออกหรือไม่ชัดเจน ผู้ให้บริการจะระบุว่า [อ่านไม่ออก] หรือ [illegible] ไว้ในงานแปล ตราประทับ ลายมือชื่อ และลายมือเขียน จะแปลหรือระบุเท่าที่อ่านได้",
          "2.4 **การส่งงานและใบเสนอราคา** เมื่อได้รับเอกสารต้นฉบับ ผู้ให้บริการจะแจ้งใบเสนอราคาและกำหนดส่งงานทางอีเมล ราคาที่แสดงบนเว็บไซต์และผลจากตัวคำนวณราคาเป็นราคาประมาณการ ราคาที่ผูกพันคือราคาในใบเสนอราคา ซึ่งมีอายุเจ็ด (7) วันนับจากวันที่ออก หากจำนวนหน้า ความยาก หรือรูปแบบของเอกสารต่างจากที่แจ้งไว้ ผู้ให้บริการอาจแก้ไขใบเสนอราคาก่อนเริ่มงาน",
          "2.5 **ค่าบริการและการชำระเงิน** ผู้รับบริการชำระค่าบริการเต็มจำนวนก่อนเริ่มงานแปล ผ่านระบบรับชำระเงินออนไลน์ Beam (Beam Checkout) ตามช่องทางที่แสดงในหน้าชำระเงิน เช่น บัตรเครดิตหรือบัตรเดบิต และ QR PromptPay หรือผ่านช่องทางอื่นที่ผู้ให้บริการระบุไว้ในใบเสนอราคา ระบบจะยืนยันการชำระเงินผ่าน Beam โดยอัตโนมัติ กรณีชำระผ่านช่องทางอื่น ผู้รับบริการต้องส่งหลักฐานการชำระเงินทางอีเมลหรือระบบสั่งงาน ผู้ให้บริการเริ่มงานเมื่อการชำระเงินได้รับการยืนยันแล้ว ผู้ให้บริการไม่ได้รับหรือจัดเก็บเลขบัตรเต็มและรหัสความปลอดภัยของบัตร ข้อมูลบัตรประมวลผลโดยผู้ให้บริการระบบรับชำระเงิน ผู้ให้บริการเป็นผู้รับภาระค่าธรรมเนียมของระบบรับชำระเงิน ผู้รับบริการชำระตามยอดในใบเสนอราคาโดยไม่มีค่าธรรมเนียมเพิ่ม เว้นแต่ค่าธรรมเนียมที่ธนาคารหรือผู้ออกบัตรของผู้รับบริการเรียกเก็บเอง (ถ้ามี) ซึ่งเป็นภาระของผู้รับบริการ และผู้ให้บริการมีสิทธิยึดหน่วงงานแปลและคำรับรองคำแปลไว้จนกว่าจะได้รับชำระค่าบริการครบถ้วน ทั้งนี้ ผู้ให้บริการมิได้เป็นผู้ประกอบการจดทะเบียนภาษีมูลค่าเพิ่ม ค่าบริการจึงไม่มีภาษีมูลค่าเพิ่ม",
          "2.6 **ระยะเวลาและการส่งมอบ** ระยะเวลาดำเนินการนับแต่วันทำการถัดจากวันที่การชำระเงินได้รับการยืนยันและผู้ให้บริการได้รับเอกสารครบถ้วน เอกสารหรือการชำระเงินที่ได้รับหลังเวลา 17.00 น. หรือในวันหยุด ให้ถือว่าได้รับในวันทำการถัดไป กำหนดส่งงานอาจเลื่อนออกไปเท่ากับระยะเวลาที่ล่าช้า หากผู้รับบริการส่งเอกสารไม่ครบ ไม่ชัดเจน หรือแก้ไขคำสั่งงานภายหลัง ผู้ให้บริการส่งมอบงานแปลเป็นไฟล์ทางอีเมลที่ผู้รับบริการแจ้งไว้ กรณีงานด่วนส่งมอบล่าช้าด้วยเหตุที่เกิดจากผู้ให้บริการ ผู้ให้บริการจะคืนเงินร้อยละสิบห้า (15) ของค่าแปลของงานนั้น ไม่รวมค่ารับรองคำแปล และให้ถือเป็นการเยียวยาทั้งหมดสำหรับความล่าช้านั้น",
          "2.7 **การตรวจรับงาน** ผู้รับบริการต้องตรวจงานแปลและแจ้งข้อผิดพลาดเป็นหนังสือหรือทางอีเมลภายในเจ็ด (7) วันนับแต่วันส่งมอบ หากไม่แจ้งภายในกำหนด ให้ถือว่าผู้รับบริการได้ตรวจรับงานโดยไม่อิดเอื้อนแล้ว",
          "2.8 **การแก้ไขงานแปล** ผู้ให้บริการแก้ไขข้อผิดพลาดที่เกิดจากการแปลโดยไม่คิดค่าใช้จ่าย หากผู้รับบริการแจ้งภายในกำหนดตามข้อ 2.7 การแก้ไขตามความชอบด้านสำนวนที่ไม่กระทบความหมาย ข้อผิดพลาดที่มีอยู่ในเอกสารต้นฉบับ หรือข้อมูลที่ผู้รับบริการแจ้งผิด ไม่ถือเป็นข้อผิดพลาดของผู้ให้บริการ การเปลี่ยนแปลงเนื้อหาต้นฉบับหรือคำขอเพิ่มเติมนอกขอบเขตงานเดิม คิดค่าบริการเพิ่มตามใบเสนอราคาใหม่",
          "2.9 **การยกเลิกโดยผู้รับบริการ** ผู้รับบริการยกเลิกงานได้โดยไม่มีค่าใช้จ่ายก่อนชำระเงิน หากผู้รับบริการยกเลิกหลังชำระเงินและยืนยันการสั่งแปลแล้ว ผู้ให้บริการจะคืนเงินดังต่อไปนี้",
          { list: [
            "(ก) ยกเลิกก่อนผู้ให้บริการส่งงานแปลฉบับร่างให้ผู้รับบริการตรวจสอบ คืนเงินร้อยละเจ็ดสิบ (70) ของค่าบริการที่ชำระเต็มจำนวน",
            "(ข) ยกเลิกหลังผู้ให้บริการส่งงานแปลฉบับร่างให้ผู้รับบริการตรวจสอบหรือแก้ไขแล้ว คืนเงินร้อยละสามสิบ (30) ของค่าบริการที่ชำระเต็มจำนวน",
            "(ค) ยกเลิกหลังผู้ให้บริการส่งมอบงานแปลฉบับสมบูรณ์แล้ว ไม่คืนเงินไม่ว่ากรณีใด"
          ] },
          "2.10 **การยกเลิกโดยผู้ให้บริการ** ผู้ให้บริการอาจยกเลิกงานได้ โดยคืนเงินดังต่อไปนี้",
          { list: [
            "(ก) กรณีเหตุเกิดจากผู้รับบริการ ซึ่งทำให้ผู้ให้บริการไม่อาจดำเนินงานให้แล้วเสร็จหรือส่งมอบงานได้ รวมถึงกรณีตามข้อ 2.2 คืนเงินร้อยละห้าสิบ (50) ของค่าบริการที่ชำระเต็มจำนวน",
            "(ข) กรณีเหตุสุดวิสัยตามข้อ 8 คืนเงินตามขั้นของงาน ดังนี้ (1) ยังไม่เริ่มแปล คืนเงินร้อยละเก้าสิบ (90) ของค่าบริการที่ชำระเต็มจำนวน (2) เริ่มแปลแล้วแต่ยังไม่ส่งงานแปลฉบับร่าง คืนเงินร้อยละเจ็ดสิบ (70) ของค่าบริการที่ชำระเต็มจำนวน และส่งมอบงานส่วนที่แปลแล้ว (3) ส่งงานแปลฉบับร่างแล้ว คืนเงินร้อยละสามสิบ (30) ของค่าบริการที่ชำระเต็มจำนวน และส่งมอบงานแปลฉบับร่าง",
            "(ค) กรณีเหตุเกิดจากผู้ให้บริการเอง คืนค่าบริการส่วนที่ยังไม่ได้ดำเนินการ"
          ] },
          "ผู้ให้บริการจะดำเนินการคืนเงินตามข้อ 2.9 และข้อนี้ภายในสิบห้า (15) วันทำการนับแต่วันที่ยกเลิก โดยคืนผ่านช่องทางเดิมที่ใช้ชำระเงินเท่าที่ระบบรับชำระเงินรองรับ เช่น คืนเข้าบัตรที่ใช้ชำระ หากไม่อาจคืนผ่านช่องทางเดิมได้ จะคืนเข้าบัญชีที่ผู้รับบริการแจ้งไว้ ระยะเวลาที่เงินคืนปรากฏในบัญชีหรือใบแจ้งยอดบัตรขึ้นอยู่กับธนาคารหรือผู้ออกบัตร"
        ]
      },
      {
        title: "ข้อ 3 คำรับรอง หน้าที่ และการชดใช้ความเสียหายของผู้รับบริการ",
        blocks: [
          "3.1 ผู้รับบริการรับรองว่า เอกสารต้นฉบับทุกฉบับเป็นเอกสารที่แท้จริง ไม่ได้ปลอม ตัดต่อ หรือแก้ไขโดยมิชอบ และได้มาโดยชอบด้วยกฎหมาย",
          "3.2 ผู้รับบริการรับรองว่า ตนมีสิทธิตามกฎหมายในการส่งเอกสารต้นฉบับและข้อมูลส่วนบุคคลที่ปรากฏอยู่ในเอกสารนั้นให้แก่ผู้ให้บริการ รวมถึงข้อมูลส่วนบุคคลของบุคคลอื่น เช่น บิดา มารดา คู่สมรส บุตร หรือพยาน โดยได้แจ้งหรือได้รับความยินยอมจากบุคคลดังกล่าวตามที่กฎหมายกำหนดแล้ว และการส่งเอกสารดังกล่าวไม่ละเมิดลิขสิทธิ์ ความลับทางการค้า หรือสิทธิอื่นใดของบุคคลภายนอก",
          "3.3 ผู้รับบริการมีหน้าที่ให้ข้อมูลที่ถูกต้อง ครบถ้วน และเป็นปัจจุบัน ได้แก่ การสะกดชื่อและชื่อเฉพาะตามหนังสือเดินทางหรือเอกสารทางราชการ หน่วยงานปลายทางที่จะนำงานแปลไปใช้ รูปแบบและคำศัพท์ที่หน่วยงานนั้นกำหนด และที่อยู่อีเมลสำหรับรับงาน ผู้ให้บริการไม่ต้องรับผิดในความคลาดเคลื่อนหรือความเสียหายอันเกิดจากข้อมูลที่ผู้รับบริการให้ไว้ไม่ถูกต้องหรือไม่ครบถ้วน",
          "3.4 ผู้รับบริการมีหน้าที่ตรวจสอบข้อกำหนดของหน่วยงานปลายทางด้วยตนเอง รวมถึงคุณสมบัติของผู้แปลและผู้รับรองคำแปล การรับรองโดยกรมการกงสุล สถานเอกอัครราชทูต หรือโนตารี ก่อนส่งงาน ผู้ให้บริการไม่รับประกันว่าหน่วยงานใดจะยอมรับงานแปลหรือคำรับรองคำแปล เว้นแต่ได้ตกลงไว้เป็นหนังสือ",
          "3.5 ผู้รับบริการมีหน้าที่ตรวจทานงานแปลก่อนนำไปใช้ โดยเฉพาะชื่อบุคคล วัน เดือน ปี ตัวเลข และเลขที่เอกสาร และแจ้งข้อผิดพลาดตามข้อ 2.7",
          "3.6 ผู้รับบริการต้องไม่นำงานแปลไปใช้ในทางที่ผิดกฎหมายหรืออันอาจก่อให้เกิดความเสียหายแก่ผู้ให้บริการหรือบุคคลอื่น และต้องไม่แก้ไข ตัดทอน หรือเพิ่มเติมงานแปลที่มีคำรับรองคำแปลแล้วอ้างว่าเป็นงานของผู้ให้บริการ หากมีการแก้ไขดังกล่าวโดยบุคคลอื่น ให้คำรับรองคำแปลสิ้นผลทันที",
          "3.7 ผู้รับบริการมีหน้าที่ดูแลบัญชีอีเมลและหมายเลขโทรศัพท์ที่ใช้ติดต่อให้ปลอดภัย คำสั่ง คำยืนยัน หรือการแจ้งใด ๆ ที่ส่งมาจากช่องทางดังกล่าว ให้ถือเป็นการกระทำของผู้รับบริการ",
          "3.8 ผู้ซึ่งส่งงานแทนบุคคลอื่นหรือนิติบุคคลรับรองว่าตนมีอำนาจกระทำการแทน และตกลงร่วมรับผิดกับบุคคลหรือนิติบุคคลนั้นตามข้อกำหนดนี้",
          "3.9 หากผู้รับบริการผิดคำรับรองหรือไม่ปฏิบัติตามหน้าที่ตามข้อนี้ ผู้รับบริการตกลงชดใช้และปกป้องผู้ให้บริการ ผู้แปล และผู้ตรวจทานที่ได้รับมอบหมาย จากความเสียหาย ค่าเสียหาย ค่าปรับ ค่าใช้จ่าย และค่าทนายความตามสมควร อันเกิดจากการกระทำดังกล่าว รวมถึงการเรียกร้องของบุคคลภายนอก และให้ผู้ให้บริการมีสิทธิระงับการให้บริการและแจ้งเหตุต่อหน่วยงานที่มีอำนาจตามที่กฎหมายกำหนด"
        ]
      },
      {
        title: "ข้อ 4 ทรัพย์สินทางปัญญาและขอบเขตของคำรับรองคำแปล",
        blocks: [
          "4.1 ลิขสิทธิ์และสิทธิอื่นใดในเอกสารต้นฉบับยังคงเป็นของผู้ทรงสิทธิเดิม",
          "4.2 เมื่อผู้รับบริการชำระค่าบริการครบถ้วนแล้ว ให้ลิขสิทธิ์ในงานแปลตกเป็นของผู้รับบริการ ก่อนชำระครบถ้วน ผู้รับบริการไม่มีสิทธิใช้ ทำซ้ำ หรือเผยแพร่งานแปลหรือส่วนใดของงานแปล",
          "4.3 ผู้ให้บริการยังคงเป็นเจ้าของและมีสิทธิใช้องค์ความรู้ วิธีการทำงาน แม่แบบเอกสาร อภิธานศัพท์ และความจำการแปล (Translation Memory) ของตน ทั้งที่มีอยู่เดิมและที่เกิดขึ้นระหว่างการให้บริการ ทั้งนี้ เฉพาะส่วนที่ได้ลบหรือทำให้ไม่สามารถระบุตัวบุคคลและข้อมูลอันเป็นความลับของผู้รับบริการแล้ว",
          "4.4 คำรับรองคำแปล รับรองเฉพาะว่างานแปลถูกต้องตรงตามเอกสารต้นฉบับที่ผู้ให้บริการได้รับ ณ วันที่รับรอง ไม่เป็นการรับรองความแท้จริง ความถูกต้อง หรือผลทางกฎหมายของเอกสารต้นฉบับ และใช้ได้เฉพาะกับงานแปลฉบับที่ผู้ให้บริการส่งมอบเท่านั้น",
          "4.5 ห้ามมิให้ผู้ใดคัดลอก ตัดต่อ หรือนำลายมือชื่อ ตราประทับ หรือข้อความรับรองของผู้ให้บริการไปใช้กับเอกสารอื่น การกระทำดังกล่าวไม่ก่อให้เกิดความรับผิดใดแก่ผู้ให้บริการ และผู้ให้บริการสงวนสิทธิดำเนินคดีตามกฎหมายแก่ผู้กระทำ",
          "4.6 ผู้ให้บริการจะไม่เปิดเผยชื่อผู้รับบริการหรือเนื้อหางานแปลเป็นผลงานอ้างอิง เว้นแต่ได้รับความยินยอมเป็นหนังสือจากผู้รับบริการ"
        ]
      },
      {
        title: "ข้อ 5 การคุ้มครองข้อมูลส่วนบุคคล",
        blocks: [
          "5.1 ผู้ให้บริการเป็นผู้ควบคุมข้อมูลส่วนบุคคล และจะเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลตาม พ.ร.บ. คุ้มครองข้อมูลฯ และกฎหมายลำดับรองที่เกี่ยวข้อง เท่าที่จำเป็นต่อการให้บริการเท่านั้น",
          "5.2 **ข้อมูลที่เก็บรวบรวม** ได้แก่ (ก) ชื่อ–นามสกุล อีเมล LINE ID หมายเลขโทรศัพท์ และการสะกดชื่อตามหนังสือเดินทาง (ข) ข้อมูลการชำระเงิน เช่น ชื่อผู้ชำระ จำนวนเงิน วิธีชำระเงิน เลขอ้างอิงรายการ และหลักฐานการโอน (ถ้ามี) โดยผู้ให้บริการไม่ได้รับหรือจัดเก็บเลขบัตรเต็มและรหัสความปลอดภัยของบัตร (ค) ข้อมูลที่ปรากฏในเอกสารต้นฉบับ ซึ่งอาจรวมถึงข้อมูลส่วนบุคคลที่มีความอ่อนไหวตามมาตรา 26 เช่น ศาสนา ข้อมูลสุขภาพ ประวัติอาชญากรรม หรือเชื้อชาติ (ง) ข้อมูลการติดต่อสื่อสารระหว่างผู้รับบริการกับผู้ให้บริการ และ (จ) ข้อมูลบัญชีผู้ใช้ในกรณีที่ผู้รับบริการสมัครบัญชี ได้แก่ ข้อมูลที่บันทึกไว้ในบัญชีและวันเวลาที่เข้าสู่ระบบ",
          "5.3 **ฐานในการประมวลผล** ผู้ให้บริการประมวลผลข้อมูลตามข้อ 5.2 (ก) (ข) (ง) และ (จ) โดยอาศัยฐานความจำเป็นเพื่อปฏิบัติตามสัญญาตามมาตรา 24 (3) ฐานประโยชน์อันชอบด้วยกฎหมายตามมาตรา 24 (5) เพื่อการรักษาความปลอดภัยและการปกป้องสิทธิเรียกร้องตามกฎหมาย และฐานการปฏิบัติตามกฎหมายตามมาตรา 24 (6) สำหรับข้อมูลตามข้อ 5.2 (ค) ซึ่งเป็นข้อมูลส่วนบุคคลที่มีความอ่อนไหว ผู้ให้บริการจะประมวลผลเมื่อได้รับความยินยอมโดยชัดแจ้งตามมาตรา 26 ซึ่งผู้รับบริการให้ไว้โดยทำเครื่องหมายแสดงความยินยอมในแบบฟอร์มส่งงาน",
          "5.4 **วัตถุประสงค์** ผู้ให้บริการใช้ข้อมูลส่วนบุคคลเพื่อจัดทำใบเสนอราคา แปลและตรวจทานเอกสาร ออกคำรับรองคำแปล ติดต่อสื่อสาร แจ้งสถานะงาน ส่งมอบงาน ออกใบเสร็จ และปฏิบัติตามกฎหมายเท่านั้น ผู้ให้บริการจะไม่ใช้ข้อมูลเพื่อการตลาด เว้นแต่ได้รับความยินยอมแยกต่างหาก และจะไม่ขาย ให้เช่า หรือแลกเปลี่ยนข้อมูลส่วนบุคคลแก่บุคคลใด",
          "5.5 **การเปิดเผย** ผู้ให้บริการเปิดเผยข้อมูลส่วนบุคคลเท่าที่จำเป็นแก่ (ก) ผู้แปลหรือผู้ตรวจทานที่ได้รับมอบหมาย ซึ่งมีหน้าที่รักษาความลับไม่น้อยกว่าที่กำหนดในข้อกำหนดนี้ (ข) ผู้ประมวลผลข้อมูลส่วนบุคคลซึ่งให้บริการระบบจัดเก็บและสื่อสาร ได้แก่ Google Workspace และผู้ให้บริการระบบรับชำระเงินออนไลน์ Beam เท่าที่จำเป็นต่อการชำระเงินและการคืนเงิน และ (ค) หน่วยงานของรัฐหรือศาลเมื่อกฎหมายกำหนดหรือมีคำสั่งโดยชอบด้วยกฎหมาย",
          "5.6 **การส่งหรือโอนไปต่างประเทศ** เนื่องจากผู้ให้บริการระบบตามข้อ 5.5 (ข) อาจจัดเก็บข้อมูลไว้ในเครื่องแม่ข่ายนอกราชอาณาจักร ผู้ให้บริการจะส่งหรือโอนข้อมูลเท่าที่จำเป็นเพื่อปฏิบัติตามสัญญา และตามหลักเกณฑ์ในมาตรา 28 และมาตรา 29 แห่ง พ.ร.บ. คุ้มครองข้อมูลฯ ผู้รับบริการรับทราบและยินยอมให้ดำเนินการดังกล่าว",
          "5.7 **ระยะเวลาการเก็บรักษา** ผู้ให้บริการเก็บเอกสารต้นฉบับ งานแปล และข้อมูลตามข้อ 5.2 ไว้ไม่เกินเก้าสิบ (90) วันนับแต่วันส่งมอบงาน สำหรับงานเอกสารทะเบียนราษฎรซึ่งต้องแนบสำเนาบัตรประจำตัวประชาชนหรือเอกสารที่ราชการออกให้ จะเก็บไว้ไม่เกินสิบห้า (15) วันนับแต่วันที่ผู้รับบริการยืนยันว่างานแปลถูกต้อง ส่วนข้อมูลบัญชีผู้ใช้เก็บไว้จนกว่าผู้รับบริการจะลบบัญชี เมื่อพ้นกำหนดจะลบ ทำลาย หรือทำให้ไม่สามารถระบุตัวบุคคลได้ เว้นแต่ (ก) หลักฐานทางการเงินและภาษี เก็บตามระยะเวลาที่กฎหมายกำหนด (ข) ทะเบียนการรับรองคำแปล ซึ่งบันทึกเฉพาะเลขที่งาน ชื่อผู้รับบริการ ประเภทเอกสาร และวันที่รับรอง เก็บไว้หนึ่ง (1) ปี เพื่อการตรวจสอบคำรับรองและการปกป้องสิทธิเรียกร้อง และ (ค) ข้อมูลที่จำเป็นต่อการต่อสู้หรือดำเนินคดี เก็บไว้จนกว่าข้อพิพาทจะสิ้นสุด",
          "5.8 **สิทธิของเจ้าของข้อมูล** ผู้รับบริการมีสิทธิตามหมวด 3 แห่ง พ.ร.บ. คุ้มครองข้อมูลฯ ได้แก่ สิทธิขอเข้าถึงและขอรับสำเนา สิทธิขอให้โอนย้ายข้อมูล สิทธิคัดค้าน สิทธิขอให้ลบหรือทำลาย สิทธิขอให้ระงับการใช้ สิทธิขอให้แก้ไขให้ถูกต้อง สิทธิถอนความยินยอม และสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล ผู้รับบริการใช้สิทธิได้โดยแจ้งทางอีเมลพร้อมเลขที่งาน ผู้ให้บริการอาจขอให้ยืนยันตัวตนก่อนดำเนินการ และจะดำเนินการภายในสามสิบ (30) วันนับแต่ได้รับคำขอ เว้นแต่กรณีที่กฎหมายให้สิทธิปฏิเสธคำขอ",
          "5.9 การถอนความยินยอมไม่กระทบการประมวลผลที่ได้ดำเนินการไปแล้วโดยชอบ หากผู้รับบริการถอนความยินยอมหรือขอให้ลบข้อมูลระหว่างดำเนินงาน จนผู้ให้บริการไม่อาจให้บริการต่อได้ ให้ถือเป็นการยกเลิกงานโดยผู้รับบริการตามข้อ 2.9",
          "5.10 เว็บไซต์ของผู้ให้บริการบันทึกเฉพาะภาษาที่ผู้ใช้เลือก และรหัสการเข้าสู่ระบบสำหรับผู้มีบัญชี ไว้ในอุปกรณ์ของผู้ใช้ และไม่ใช้คุกกี้เพื่อติดตามหรือโฆษณา ทั้งนี้ แพลตฟอร์มของบุคคลภายนอก เช่น Google Sites และ GitHub อาจใช้คุกกี้ตามนโยบายของแพลตฟอร์มนั้น"
        ]
      },
      {
        title: "ข้อ 6 การรักษาความลับและความมั่นคงปลอดภัยของข้อมูล",
        blocks: [
          "6.1 ผู้ให้บริการถือว่าเอกสารต้นฉบับและงานแปลเป็นความลับ และจะไม่เปิดเผยแก่บุคคลใด เว้นแต่ตามข้อ 5.5 หรือได้รับความยินยอมเป็นหนังสือจากผู้รับบริการ",
          "6.2 ผู้ให้บริการจัดให้มีมาตรการรักษาความมั่นคงปลอดภัยที่เหมาะสมตามมาตรา 37 (1) ได้แก่",
          { list: [
            "จำกัดการเข้าถึงเฉพาะผู้ให้บริการและผู้ที่ได้รับมอบหมายให้ดำเนินงานนั้น",
            "จัดเก็บไฟล์ในบริการคลาวด์ที่เข้ารหัสข้อมูลระหว่างส่งและขณะจัดเก็บ แยกโฟลเดอร์ตามเลขที่งาน และไม่เปิดเผยต่อสาธารณะ",
            "ใช้บัญชีที่มีการยืนยันตัวตนสองขั้นตอน",
            "ส่งมอบงานเฉพาะทางอีเมลที่ผู้รับบริการแจ้งไว้",
            "ระบบติดตามงานแสดงเฉพาะสถานะงาน เมื่อกรอกเลขที่งานและอีเมลตรงกัน",
            "ลบข้อมูลตามกำหนดในข้อ 5.7"
          ] },
          "6.3 ผู้แปล ผู้ตรวจทาน และบุคคลที่ได้รับมอบหมายทุกคนต้องผูกพันตามหน้าที่รักษาความลับเป็นหนังสือ และหน้าที่ดังกล่าวคงมีผลแม้สิ้นสุดงานหรือสิ้นสุดการปฏิบัติหน้าที่แล้ว",
          "6.4 หากเกิดเหตุการณ์ละเมิดข้อมูลส่วนบุคคล ผู้ให้บริการจะแจ้งสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลโดยไม่ชักช้าภายในเจ็ดสิบสอง (72) ชั่วโมงนับแต่ทราบเหตุ เว้นแต่การละเมิดนั้นไม่มีความเสี่ยงที่จะมีผลกระทบต่อสิทธิและเสรีภาพของบุคคล หากมีความเสี่ยงสูง จะแจ้งผู้รับบริการพร้อมแนวทางเยียวยาโดยไม่ชักช้า ตามมาตรา 37 (4)",
          "6.5 ผู้รับบริการรับทราบว่า การส่งข้อมูลผ่านอินเทอร์เน็ต อีเมล หรือแอปพลิเคชันสนทนา ไม่อาจปลอดภัยได้สมบูรณ์ ผู้ให้บริการไม่ต้องรับผิดในความเสียหายที่เกิดขึ้นในระบบของบุคคลภายนอกซึ่งอยู่นอกการควบคุมของผู้ให้บริการ หรือในอุปกรณ์และบัญชีของผู้รับบริการเอง ทั้งนี้ ไม่ตัดความรับผิดของผู้ให้บริการตามที่กฎหมายกำหนดไว้โดยเฉพาะ"
        ]
      },
      {
        title: "ข้อ 7 ข้อจำกัดความรับผิด",
        blocks: [
          "7.1 ผู้ให้บริการจะใช้ความรู้ ความชำนาญ และความระมัดระวังตามมาตรฐานวิชาชีพผู้แปลในการให้บริการ ทั้งนี้ ผู้ให้บริการไม่รับประกันผลใด ๆ ที่ขึ้นอยู่กับดุลพินิจของบุคคลอื่น เช่น การอนุมัติวีซ่า การรับเข้าศึกษา การรับรองเอกสารโดยหน่วยงานปลายทาง หรือผลของคดี",
          "7.2 ผู้ให้บริการไม่ต้องรับผิดในความเสียหายที่เกิดจากกรณีดังต่อไปนี้",
          { list: [
            "(ก) หน่วยงานปลายทางไม่ยอมรับงานแปลหรือคำรับรองคำแปล ด้วยเหตุอื่นที่มิใช่ความผิดพลาดในการแปล",
            "(ข) ข้อผิดพลาดที่มีอยู่ในเอกสารต้นฉบับ หรือข้อมูลที่ผู้รับบริการให้ไว้ไม่ถูกต้องหรือไม่ครบถ้วน",
            "(ค) ส่วนของเอกสารต้นฉบับที่อ่านไม่ออกหรือไม่ชัดเจน ซึ่งผู้ให้บริการได้ระบุไว้ในงานแปล",
            "(ง) การแก้ไขงานแปลโดยบุคคลอื่น หรือการใช้งานแปลนอกวัตถุประสงค์ที่แจ้งไว้",
            "(จ) ความล่าช้าที่เกิดจากผู้รับบริการ หน่วยงานปลายทาง หรือบุคคลภายนอก",
            "(ฉ) การที่ผู้รับบริการไม่ได้รับอีเมลเนื่องจากแจ้งที่อยู่อีเมลผิด กล่องจดหมายเต็ม หรือระบบกรองจดหมายขยะของผู้รับบริการ",
            "(ช) เหตุสุดวิสัยตามข้อ 8"
          ] },
          "7.3 ผู้ให้บริการไม่ต้องรับผิดในความเสียหายทางอ้อม ความเสียหายพิเศษ หรือความเสียหายสืบเนื่อง ไม่ว่าจะได้รับแจ้งถึงความเป็นไปได้หรือไม่ รวมถึงการสูญเสียรายได้หรือโอกาส ค่าตั๋วเดินทางและที่พัก ค่าธรรมเนียมวีซ่าหรือค่าธรรมเนียมอื่นที่ชำระแก่บุคคลภายนอก ค่าปรับ และค่าเสียเวลา",
          "7.4 ความรับผิดทั้งหมดของผู้ให้บริการต่อผู้รับบริการ ไม่ว่าตามสัญญา ละเมิด หรือมูลเหตุอื่นใด ให้จำกัดไม่เกินจำนวนค่าบริการที่ผู้รับบริการได้ชำระจริงสำหรับงานที่เป็นเหตุแห่งความเสียหายนั้น และการแก้ไขงานแปลตามข้อ 2.8 หรือการคืนเงินตามสัดส่วนของส่วนที่บกพร่อง ให้ถือเป็นการเยียวยาหลักของผู้รับบริการ",
          "7.5 ข้อจำกัดความรับผิดตามข้อนี้ไม่ใช้บังคับกับความเสียหายอันเกิดจากกลฉ้อฉล การกระทำโดยจงใจ หรือความประมาทเลินเล่ออย่างร้ายแรงของผู้ให้บริการ ความเสียหายต่อชีวิต ร่างกาย หรืออนามัย และความรับผิดอื่นใดที่กฎหมายห้ามมิให้จำกัดหรือยกเว้น ทั้งนี้ ตามมาตรา 373 แห่งประมวลกฎหมายแพ่งและพาณิชย์ และพระราชบัญญัติว่าด้วยข้อสัญญาที่ไม่เป็นธรรม พ.ศ. 2540"
        ]
      },
      {
        title: "ข้อ 8 เหตุสุดวิสัย",
        blocks: [
          "8.1 “เหตุสุดวิสัย” หมายความตามมาตรา 8 แห่งประมวลกฎหมายแพ่งและพาณิชย์ คือ เหตุใด ๆ อันจะเกิดขึ้นก็ดี จะให้ผลพิบัติก็ดี เป็นเหตุที่ไม่อาจป้องกันได้ แม้บุคคลผู้ต้องประสบหรือใกล้จะต้องประสบเหตุนั้นจะได้จัดการระมัดระวังตามสมควรอันพึงคาดหมายได้จากบุคคลในฐานะและภาวะเช่นนั้น ให้รวมถึงแต่ไม่จำกัดเพียง",
          { list: [
            "(ก) ภัยธรรมชาติ เช่น อุทกภัย อัคคีภัย แผ่นดินไหว พายุ และโรคระบาด",
            "(ข) สงคราม การจลาจล การก่อการร้าย การประกาศภาวะฉุกเฉิน การปิดเมือง หรือคำสั่งของหน่วยงานของรัฐ",
            "(ค) ไฟฟ้าดับ ระบบโทรคมนาคมหรืออินเทอร์เน็ตขัดข้อง หรือระบบของผู้ให้บริการภายนอกขัดข้อง เช่น Google ธนาคาร ระบบรับชำระเงินออนไลน์ Beam และระบบ PromptPay",
            "(ง) การโจมตีทางไซเบอร์ซึ่งไม่อาจป้องกันได้ แม้ผู้ให้บริการได้ใช้มาตรการตามข้อ 6.2 แล้ว",
            "(จ) การเจ็บป่วยร้ายแรงหรืออุบัติเหตุของผู้แปลที่รับผิดชอบงาน ซึ่งไม่อาจคาดหมายได้และไม่อาจมอบหมายผู้อื่นทำแทนได้ทันกำหนด"
          ] },
          "8.2 หากเกิดเหตุสุดวิสัย ผู้ให้บริการไม่ต้องรับผิดในการไม่ชำระหนี้หรือชำระหนี้ล่าช้า และให้ขยายกำหนดส่งมอบงานออกไปเท่ากับระยะเวลาที่เหตุนั้นดำรงอยู่ รวมกับเวลาอันสมควรในการกลับมาดำเนินงาน",
          "8.3 ผู้ให้บริการจะแจ้งเหตุสุดวิสัยแก่ผู้รับบริการภายในเวลาอันสมควร ทางช่องทางใดที่ยังใช้งานได้ และจะพยายามลดผลกระทบตามสมควร",
          "8.4 หากเหตุสุดวิสัยดำรงอยู่เกินสามสิบ (30) วัน คู่สัญญาฝ่ายใดฝ่ายหนึ่งอาจบอกเลิกสัญญาได้ ในกรณีนี้ ผู้ให้บริการจะคืนเงินตามข้อ 2.10 (ข) โดยคู่สัญญาไม่มีสิทธิเรียกค่าเสียหายอื่นใดจากกัน",
          "8.5 เหตุสุดวิสัยไม่เป็นเหตุให้ผู้รับบริการพ้นจากหน้าที่ชำระค่าบริการสำหรับงานที่ผู้ให้บริการได้ดำเนินการแล้ว"
        ]
      },
      {
        title: "ข้อ 9 บทเบ็ดเตล็ด",
        blocks: [
          "9.1 **การแก้ไขข้อกำหนด** ผู้ให้บริการอาจแก้ไขข้อกำหนดนี้ได้โดยประกาศบนเว็บไซต์ ข้อกำหนดที่แก้ไขมีผลเมื่อประกาศ และไม่ใช้บังคับกับงานที่ผู้รับบริการชำระค่าบริการแล้วก่อนวันประกาศ",
          "9.2 **ความเป็นอิสระของข้อกำหนด** หากข้อกำหนดข้อใดตกเป็นโมฆะหรือใช้บังคับไม่ได้ ให้ข้อกำหนดส่วนที่เหลือยังคงมีผลใช้บังคับ และให้ข้อกำหนดที่ไม่มีผลนั้นใช้บังคับเท่าที่กฎหมายอนุญาต",
          "9.3 **การไม่ใช้สิทธิ** การที่ผู้ให้บริการไม่ใช้สิทธิตามข้อกำหนดนี้ในกรณีใด ไม่ถือเป็นการสละสิทธินั้น",
          "9.4 **การโอนสิทธิ** ผู้รับบริการจะโอนสิทธิหรือหน้าที่ตามข้อกำหนดนี้ให้แก่บุคคลอื่นไม่ได้ เว้นแต่ได้รับความยินยอมเป็นหนังสือจากผู้ให้บริการ",
          "9.5 **การติดต่อและพยานหลักฐานอิเล็กทรอนิกส์** การติดต่อ การบอกกล่าว และการส่งมอบงานทางอีเมลที่ผู้รับบริการแจ้งไว้ ให้ถือว่าได้รับเมื่อข้อมูลอิเล็กทรอนิกส์เข้าสู่ระบบข้อมูลที่ผู้รับกำหนด ตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 คู่สัญญาตกลงให้บันทึกการส่งแบบฟอร์ม การทำเครื่องหมายแสดงความยินยอม และอีเมล ใช้เป็นพยานหลักฐานได้",
          "9.6 **ภาษา** หากข้อกำหนดฉบับภาษาไทยและฉบับภาษาอังกฤษขัดหรือแย้งกัน ให้ใช้ฉบับภาษาไทยเป็นหลัก",
          "9.7 **กฎหมายที่ใช้บังคับและการระงับข้อพิพาท** ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย หากมีข้อพิพาท คู่สัญญาจะเจรจากันโดยสุจริตภายในสามสิบ (30) วันนับแต่ฝ่ายใดฝ่ายหนึ่งแจ้งข้อพิพาทเป็นหนังสือ หากไม่อาจตกลงกันได้ ให้ศาลไทยที่มีเขตอำนาจเป็นผู้พิจารณาชี้ขาด",
          "9.8 **ช่องทางติดต่อผู้ให้บริการ** อีเมล contact@prathaitranslation.com โทรศัพท์ 080-629-7450 ที่อยู่ เลขที่ 87 หมู่ที่ 8 ตำบลประทาย อำเภอประทาย จังหวัดนครราชสีมา 30180"
        ]
      }
    ],
    closing: "ข้อกำหนดนี้มีผลใช้บังคับตั้งแต่วันที่ 1 พฤศจิกายน 2569 เป็นต้นไป ปรับปรุงล่าสุดวันที่ 9 พฤศจิกายน 2569 (ช่องทางชำระเงินผ่านระบบ Beam ค่าธรรมเนียมการชำระเงิน และวิธีคืนเงิน)"
  },

  en: {
    intro: [
      "These Terms and Conditions of Service (the “Terms”) govern the translation, certified translation and related services provided by TransCOM through all channels, namely the website, the job ordering system and email.",
      "A Customer who submits documents through the form, ticks the consent box or pays the service fee is deemed to have read, understood and accepted these Terms in full. These Terms, the Quotation and the job confirmation together form the contract between the Provider and the Customer. Where a Quotation sets out job-specific conditions that differ from these Terms, the Quotation prevails for that job only, except in matters of limitation of liability, personal data protection and force majeure, where these Terms prevail.",
      "A Customer who is a minor must obtain the consent of his or her statutory representative before using the Services."
    ],
    sections: [
      {
        title: "Clause 1 Definitions",
        blocks: [
          "In these Terms:",
          { list: [
            "**“Provider”** means TransCOM, operated by Mr. Chusana Rungpao, who is the data controller under these Terms.",
            "**“Customer”** means any natural or juristic person who submits documents to or engages the Provider, including any person acting on behalf of such natural or juristic person.",
            "**“Services”** means document translation, review, certification of translation and other related services specified in the Quotation.",
            "**“Source Document”** means any file or document submitted by the Customer for translation.",
            "**“Translation”** means the translation of the Source Document delivered by the Provider.",
            "**“Certification of Translation”** means the Provider’s statement certifying that the Translation is a true and accurate rendering of the Source Document received; it does not certify the accuracy or authenticity of the Source Document.",
            "**“Quotation”** means the document or email message in which the Provider states the fee, scope of work and delivery date for each job.",
            "**“Working Day”** means Monday to Friday, excluding official public holidays and holidays announced in advance by the Provider.",
            "**“Receiving Authority”** means any embassy, government agency, educational institution or other person to whom the Customer will submit the Translation.",
            "**“Personal Data”** has the meaning given in the Personal Data Protection Act B.E. 2562 (2019) (the “PDPA”)."
          ] }
        ]
      },
      {
        title: "Clause 2 Services",
        blocks: [
          "2.1 **Scope of Services** The Provider translates documents between Thai and English and issues a Certification of Translation at the Customer’s request. The Provider translates according to the meaning of the Source Document and exercises professional judgment in the choice of wording, terminology and transliteration of proper names, unless the Customer has specified the spelling in writing. The Services do not include legalisation by the Department of Consular Affairs or an embassy, notarisation, delivery of printed documents, or reproduction of the exact layout of the Source Document, unless specified in the Quotation.",
          "2.2 **Right to Refuse or Suspend** The Provider may refuse or suspend a job at any stage if the document contains content contrary to law or public order and good morals; there is reasonable cause to suspect that the document is forged, altered or will be used to commit an offence; the work is outside the Provider’s expertise; the document is illegible to the extent that it cannot be translated; or the Customer fails to comply with these Terms.",
          "2.3 **Illegible Text** Any part of the Source Document that is illegible or unclear will be marked “[illegible]” in the Translation. Seals, signatures and handwriting will be translated or indicated to the extent legible.",
          "2.4 **Job Submission and Quotation** Upon receipt of the Source Document, the Provider will send the Quotation and delivery date by email. Prices shown on the website and results of the price calculator are estimates only. The binding price is the price stated in the Quotation, which is valid for seven (7) days from its date of issue. If the number of pages, difficulty or format of the document differs from what was stated, the Provider may revise the Quotation before work begins.",
          "2.5 **Fees and Payment** The Customer shall pay the full service fee before translation begins through the Beam online payment system (Beam Checkout), using the methods shown on the payment page, such as credit or debit card and PromptPay QR, or through another method specified by the Provider in the quotation. Payments made through Beam are confirmed by the system automatically; for any other method, the Customer shall send proof of payment by email or the job ordering system. The Provider will begin work once payment has been confirmed. The Provider does not receive or store full card numbers or card security codes; card data is processed by the payment system provider. The Provider bears the fees of the payment system; the Customer pays the amount in the quotation with no added payment fee, except any fees charged by the Customer’s own bank or card issuer, which shall be borne by the Customer. The Provider has the right to retain the Translation and the Certification of Translation until the service fee has been paid in full. The Provider is not registered for value added tax; accordingly, the service fee is not subject to value added tax.",
          "2.6 **Turnaround and Delivery** Turnaround time begins on the Working Day following the day on which payment is confirmed and the Provider receives complete documents. Documents or payments received after 17:00 or on a holiday are deemed received on the next Working Day. The delivery date may be extended by the period of any delay if the Customer submits incomplete or unclear documents or changes the job instructions afterwards. The Provider delivers the Translation as a file to the email address provided by the Customer. If an express job is delivered late for reasons attributable to the Provider, the Provider will refund fifteen percent (15%) of the translation fee for that job, excluding the certification fee, and such refund shall constitute the Customer’s sole remedy for that delay.",
          "2.7 **Acceptance** The Customer shall review the Translation and notify any errors in writing or by email within seven (7) days from the date of delivery. If no notice is given within that period, the Customer is deemed to have accepted the work without objection.",
          "2.8 **Revisions** The Provider will correct translation errors free of charge if the Customer gives notice within the period in Clause 2.7. Changes based on stylistic preference that do not affect the meaning, errors contained in the Source Document, and information incorrectly provided by the Customer are not errors of the Provider. Changes to the source content or requests beyond the original scope of work will be charged under a new Quotation.",
          "2.9 **Cancellation by the Customer** The Customer may cancel a job free of charge before payment. If the Customer cancels after payment and after confirming the translation order, the Provider will refund as follows:",
          { list: [
            "(a) cancellation before the Provider sends the draft Translation to the Customer for review: seventy percent (70%) of the full fee paid;",
            "(b) cancellation after the Provider has sent the draft Translation to the Customer for review or revision: thirty percent (30%) of the full fee paid;",
            "(c) cancellation after the Provider has delivered the final Translation: no refund in any case."
          ] },
          "2.10 **Cancellation by the Provider** The Provider may cancel a job and will refund as follows:",
          { list: [
            "(a) where the cause is attributable to the Customer and prevents the Provider from completing or delivering the work, including the cases in Clause 2.2: fifty percent (50%) of the full fee paid;",
            "(b) in the event of Force Majeure under Clause 8, according to the stage of work: (1) before translation begins, ninety percent (90%) of the full fee paid; (2) after translation begins but before the draft Translation is sent, seventy percent (70%) of the full fee paid, together with delivery of the work completed; (3) after the draft Translation has been sent, thirty percent (30%) of the full fee paid, together with delivery of the draft Translation;",
            "(c) where the cause is attributable to the Provider: the fee for the portion of work not yet performed."
          ] },
          "Refunds under Clause 2.9 and this Clause will be initiated within fifteen (15) Working Days from the date of cancellation, to the original payment method where the payment system allows it (for example, back to the card used). If a refund cannot be made to the original payment method, it will be made to the account designated by the Customer. The time for the refund to appear in the Customer’s account or card statement depends on the bank or card issuer."
        ]
      },
      {
        title: "Clause 3 Customer Warranties, Duties and Indemnity",
        blocks: [
          "3.1 The Customer warrants that every Source Document is genuine, has not been forged, manipulated or unlawfully altered, and was lawfully obtained.",
          "3.2 The Customer warrants that it has the legal right to provide the Source Documents and the Personal Data contained in them to the Provider, including the Personal Data of other persons such as parents, spouses, children or witnesses, that it has notified or obtained consent from such persons as required by law, and that providing such documents does not infringe any copyright, trade secret or other right of any third party.",
          "3.3 The Customer shall provide accurate, complete and up-to-date information, including the spelling of names and proper nouns as shown in the passport or official documents, the Receiving Authority, the format and terminology required by that authority, and the email address for delivery. The Provider shall not be liable for any inaccuracy or damage arising from information provided by the Customer that is incorrect or incomplete.",
          "3.4 The Customer is responsible for checking the requirements of the Receiving Authority before submitting the job, including the required qualifications of the translator and certifier, and any legalisation by the Department of Consular Affairs, an embassy or a notary. The Provider does not guarantee that any authority will accept the Translation or the Certification of Translation unless agreed in writing.",
          "3.5 The Customer shall review the Translation before use, in particular names, dates, figures and document numbers, and shall notify any errors in accordance with Clause 2.7.",
          "3.6 The Customer shall not use the Translation unlawfully or in any manner that may cause damage to the Provider or any other person, and shall not alter, abridge or add to a certified Translation and represent it as the Provider’s work. If such alteration is made by any other person, the Certification of Translation shall immediately cease to have effect.",
          "3.7 The Customer is responsible for keeping its email and telephone accounts used for communication secure. Any instruction, confirmation or notice sent from those channels shall be deemed an act of the Customer.",
          "3.8 Any person submitting a job on behalf of another person or a juristic person warrants that he or she has authority to act on that party’s behalf and agrees to be jointly liable with that party under these Terms.",
          "3.9 If the Customer breaches any warranty or fails to perform any duty under this Clause, the Customer shall indemnify and hold harmless the Provider and any assigned translators and reviewers against all losses, damages, fines, costs and reasonable legal fees arising therefrom, including claims by third parties, and the Provider may suspend the Services and report the matter to the competent authorities as required by law."
        ]
      },
      {
        title: "Clause 4 Intellectual Property and Scope of the Certification of Translation",
        blocks: [
          "4.1 Copyright and any other rights in the Source Document remain with the original rights holder.",
          "4.2 Upon full payment of the service fee, copyright in the Translation shall vest in the Customer. Until full payment, the Customer has no right to use, reproduce or disclose the Translation or any part of it.",
          "4.3 The Provider retains ownership of, and the right to use, its know-how, working methods, document templates, glossaries and translation memory, whether existing before or created during the Services, provided that personal identifiers and the Customer’s confidential information have been removed or rendered non-identifiable.",
          "4.4 The Certification of Translation certifies only that the Translation is a true and accurate rendering of the Source Document received by the Provider as at the date of certification. It does not certify the authenticity, accuracy or legal effect of the Source Document, and applies only to the copy of the Translation delivered by the Provider.",
          "4.5 No person may copy, manipulate or transfer the Provider’s signature, seal or certification statement to any other document. Such act shall give rise to no liability on the part of the Provider, and the Provider reserves the right to take legal action against the person responsible.",
          "4.6 The Provider will not disclose the Customer’s name or the content of the Translation as a reference without the Customer’s written consent."
        ]
      },
      {
        title: "Clause 5 Personal Data Protection",
        blocks: [
          "5.1 The Provider is the data controller and will collect, use and disclose Personal Data in accordance with the PDPA and its subordinate legislation, only to the extent necessary to provide the Services.",
          "5.2 **Data Collected** (a) name, email, LINE ID, telephone number and name spelling as in the passport; (b) payment information, such as the payer’s name, amount, payment method, transaction reference and proof of transfer (if any); the Provider does not receive or store full card numbers or card security codes; (c) data contained in the Source Document, which may include sensitive personal data under Section 26, such as religion, health data, criminal records or ethnicity; (d) records of communications between the Customer and the Provider; and (e) account data, if the Customer creates an account, namely the details saved in the account and sign-in times.",
          "5.3 **Legal Basis** The Provider processes the data in Clause 5.2 (a), (b), (d) and (e) on the basis of contractual necessity under Section 24 (3), legitimate interests under Section 24 (5) for security and the protection of legal claims, and legal obligation under Section 24 (6). The data in Clause 5.2 (c), being sensitive personal data, is processed on the basis of explicit consent under Section 26, which the Customer gives by ticking the consent box in the job submission form.",
          "5.4 **Purposes** The Provider uses Personal Data only to prepare quotations, translate and review documents, issue Certifications of Translation, communicate, report job status, deliver work, issue receipts and comply with the law. The Provider will not use Personal Data for marketing without separate consent, and will not sell, rent or exchange Personal Data with any person.",
          "5.5 **Disclosure** The Provider discloses Personal Data only as necessary to (a) assigned translators or reviewers bound by confidentiality obligations no less strict than those in these Terms; (b) data processors providing storage and communication systems, namely Google Workspace, and the Beam online payment system provider, as necessary for payments and refunds; and (c) government agencies or courts where required by law or by a lawful order.",
          "5.6 **Cross-border Transfer** As the system providers in Clause 5.5 (b) may store data on servers outside Thailand, the Provider will transfer data only as necessary to perform the contract and in accordance with Sections 28 and 29 of the PDPA. The Customer acknowledges and consents to such transfer.",
          "5.7 **Retention** The Provider retains the Source Document, the Translation and the data in Clause 5.2 for no more than ninety (90) days from the date of delivery or, for civil registration document jobs that require a copy of the national ID card or other government-issued identification, for no more than fifteen (15) days from the date the Customer confirms that the Translation is correct, and retains account data until the Customer deletes the account, after which they are deleted, destroyed or anonymised, except (a) financial and tax records, which are retained for the period required by law; (b) the register of certified translations, which records only the job number, Customer name, document type and date of certification, and is retained for one (1) year for verification of certifications and protection of legal claims; and (c) data necessary to establish or defend legal claims, which is retained until the dispute is finally resolved.",
          "5.8 **Data Subject Rights** The Customer has the rights under Chapter 3 of the PDPA, namely the rights of access and to obtain a copy, data portability, objection, erasure or destruction, restriction of processing, rectification, withdrawal of consent, and to lodge a complaint with the Office of the Personal Data Protection Committee. The Customer may exercise these rights by email quoting the job number. The Provider may require identity verification and will act within thirty (30) days of receiving the request, except where the law permits the request to be refused.",
          "5.9 Withdrawal of consent does not affect processing lawfully carried out before the withdrawal. If the Customer withdraws consent or requests erasure during the job such that the Provider cannot continue the Services, this shall be treated as cancellation by the Customer under Clause 2.9.",
          "5.10 The Provider’s website stores only the user’s language preference and, for account holders, a sign-in token on the user’s device and does not use cookies for tracking or advertising. Third-party platforms such as Google Sites and GitHub may use cookies under their own policies."
        ]
      },
      {
        title: "Clause 6 Confidentiality and Data Security",
        blocks: [
          "6.1 The Provider treats Source Documents and Translations as confidential and will not disclose them to any person except under Clause 5.5 or with the Customer’s written consent.",
          "6.2 The Provider maintains appropriate security measures under Section 37 (1), including:",
          { list: [
            "restricting access to the Provider and persons assigned to the job;",
            "storing files in a cloud service encrypted in transit and at rest, in separate folders per job number, not publicly accessible;",
            "using accounts protected by two-step verification;",
            "delivering work only to the email address provided by the Customer;",
            "a job tracking system that shows only the job status when a matching job number and email address are entered; and",
            "deleting data in accordance with Clause 5.7."
          ] },
          "6.3 All translators, reviewers and other assigned persons must be bound by written confidentiality obligations, which survive completion of the job and termination of their engagement.",
          "6.4 In the event of a personal data breach, the Provider will notify the Office of the Personal Data Protection Committee without delay and within seventy-two (72) hours of becoming aware of it, unless the breach is unlikely to result in a risk to the rights and freedoms of individuals. Where the risk is high, the Provider will notify the Customer, together with remedial measures, without delay, in accordance with Section 37 (4).",
          "6.5 The Customer acknowledges that transmission of data over the internet, email or messaging applications cannot be completely secure. The Provider shall not be liable for damage occurring in third-party systems beyond the Provider’s control, or in the Customer’s own devices and accounts, without prejudice to any liability of the Provider expressly imposed by law."
        ]
      },
      {
        title: "Clause 7 Limitation of Liability",
        blocks: [
          "7.1 The Provider will perform the Services with the knowledge, skill and care expected of a professional translator. The Provider does not guarantee any outcome that depends on the discretion of others, such as visa approval, admission to study, acceptance of documents by a Receiving Authority, or the outcome of legal proceedings.",
          "7.2 The Provider shall not be liable for any damage arising from:",
          { list: [
            "(a) refusal by a Receiving Authority to accept the Translation or the Certification of Translation for reasons other than a translation error;",
            "(b) errors contained in the Source Document, or information provided by the Customer that is incorrect or incomplete;",
            "(c) any part of the Source Document that is illegible or unclear and has been so indicated in the Translation;",
            "(d) alteration of the Translation by any other person, or use of the Translation for a purpose other than that notified;",
            "(e) delay caused by the Customer, the Receiving Authority or any third party;",
            "(f) non-receipt of email by the Customer due to an incorrect email address, a full mailbox or the Customer’s spam filter; or",
            "(g) force majeure under Clause 8."
          ] },
          "7.3 The Provider shall not be liable for any indirect, special or consequential damage, whether or not advised of its possibility, including loss of income or opportunity, travel and accommodation costs, visa or other fees paid to third parties, fines, and loss of time.",
          "7.4 The Provider’s total liability to the Customer, whether in contract, tort or otherwise, shall not exceed the service fee actually paid by the Customer for the job giving rise to the damage. Correction of the Translation under Clause 2.8 or a pro rata refund for the defective portion shall be the Customer’s primary remedy.",
          "7.5 The limitations of liability in this Clause do not apply to damage caused by the fraud, wilful misconduct or gross negligence of the Provider, damage to life, body or health, or any other liability that may not be limited or excluded by law, in accordance with Section 373 of the Civil and Commercial Code and the Unfair Contract Terms Act B.E. 2540 (1997)."
        ]
      },
      {
        title: "Clause 8 Force Majeure",
        blocks: [
          "8.1 “Force Majeure” has the meaning given in Section 8 of the Civil and Commercial Code, namely any event the occurrence or consequences of which could not be prevented even if the person affected or about to be affected had taken such reasonable care as might be expected of a person in that situation and condition, including but not limited to:",
          { list: [
            "(a) natural disasters such as floods, fires, earthquakes, storms and epidemics;",
            "(b) war, riot, terrorism, declaration of a state of emergency, lockdown or orders of government authorities;",
            "(c) power outages, failure of telecommunication or internet systems, or failure of third-party service providers such as Google, banks, the Beam online payment system and the PromptPay system;",
            "(d) cyberattacks that could not be prevented despite the Provider having taken the measures in Clause 6.2; and",
            "(e) serious illness or accident of the translator responsible for the job which could not be foreseen and where the work could not be reassigned in time."
          ] },
          "8.2 In the event of Force Majeure, the Provider shall not be liable for non-performance or delay in performance, and the delivery date shall be extended by the duration of the event plus a reasonable period to resume work.",
          "8.3 The Provider will notify the Customer of the Force Majeure event within a reasonable time by any channel still available and will make reasonable efforts to mitigate its effects.",
          "8.4 If the Force Majeure event continues for more than thirty (30) days, either party may terminate the contract. In that case, the Provider will make a refund in accordance with Clause 2.10 (b), and neither party may claim any other damages from the other.",
          "8.5 Force Majeure does not release the Customer from the obligation to pay for work already performed by the Provider."
        ]
      },
      {
        title: "Clause 9 General Provisions",
        blocks: [
          "9.1 **Amendment** The Provider may amend these Terms by publishing them on the website. Amended Terms take effect upon publication and do not apply to jobs for which the Customer has paid before the date of publication.",
          "9.2 **Severability** If any provision of these Terms is void or unenforceable, the remaining provisions shall remain in full force and effect, and the void provision shall apply to the extent permitted by law.",
          "9.3 **No Waiver** Failure by the Provider to exercise any right under these Terms in any instance shall not constitute a waiver of that right.",
          "9.4 **Assignment** The Customer may not assign any right or obligation under these Terms to any other person without the Provider’s written consent.",
          "9.5 **Notices and Electronic Evidence** Communications, notices and delivery of work by email to the address provided by the Customer are deemed received when the electronic data enters the information system designated by the recipient, in accordance with the Electronic Transactions Act B.E. 2544 (2001). The parties agree that records of form submissions, consent ticks and emails may be used as evidence.",
          "9.6 **Language** In the event of any conflict or inconsistency between the Thai and English versions of these Terms, the Thai version shall prevail.",
          "9.7 **Governing Law and Dispute Resolution** These Terms are governed by the laws of Thailand. In the event of a dispute, the parties shall negotiate in good faith for thirty (30) days from the date either party gives written notice of the dispute. If no agreement is reached, the dispute shall be decided by the competent Thai courts.",
          "9.8 **Provider Contact Details** Email: contact@prathaitranslation.com Telephone: +66 80 629 7450 Address: 87 Moo 8, Prathai Subdistrict, Prathai District, Nakhon Ratchasima 30180, Thailand"
        ]
      }
    ],
    closing: "These Terms take effect from 1 November 2026. Last updated 9 November 2026 (payment through the Beam system, payment fees and how refunds are made)."
  }
};
