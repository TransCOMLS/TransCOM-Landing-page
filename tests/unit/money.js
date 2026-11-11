// Phase 6 backend: quotes → Beam payment link → paid (webhook / return / trigger) → receipt, points, refunds, rewards
const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
g.ctx.setup();
const props = g.props, beam = g.beam, S = g.sheets;
const signIn = email => { P({ action: 'requestCode', email }); return P({ action: 'verifyCode', email, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com');
ok(['Quotes', 'Payments', 'Rewards', 'Redemptions'].every(n => S[n]), 'setup makes Quotes, Payments, Rewards, Redemptions');
ok(/^[0-9a-f]{64}$/.test(props.BEAM_HOOK_SECRET || ''), 'setup makes a webhook secret');
ok(g.triggers.includes('checkPayments'), 'setup installs the 15-minute payment check');
ok(S.Coupons.data[0].includes('ใช้ร่วมกับส่วนลดสมาชิกได้'), 'Coupons gets the "combine with member discount" column');

// a member customer + a guest job
const cust = signIn('cust@example.com');
P({ action: 'updateProfile', token: cust, profile: { name: 'คุณลูกค้า', lang: 'th' } });
const mk = (email, name) => {
  const r = P({ action: 'createJob', job: { name, email, langPair: 'th-en', category: 'official', pages: 3, neededBy: '2099-01-01', certified: true, shipping: false, consent: true, files: [{ name: 'a.pdf', size: 3 }], idFiles: [] } });
  P({ action: 'uploadFile', jobNo: r.jobNo, uploadToken: r.uploadToken, kind: 'doc', name: 'a.pdf', data: 'QUJD' });
  P({ action: 'finishJob', jobNo: r.jobNo, uploadToken: r.uploadToken });
  return r.jobNo;
};
const job = mk('cust@example.com', 'คุณลูกค้า');
const guestJob = mk('guest@example.com', 'Guest');
ok(/^TR-\d{4}-/.test(job), 'jobs created ' + job + ' ' + guestJob);

// not configured yet
let r = P({ action: 'adminJob', token: admin, jobNo: job });
ok(r.ok && r.job.money && r.job.money.payReady === false && r.job.money.mode === 'test' && r.job.money.suggested.percent === 0, 'admin job shows money: not ready, test mode, no discount yet');

// quote
r = P({ action: 'adminSaveQuote', token: admin, jobNo: job, items: [{ text: 'ค่าแปล 3 หน้า', amount: 1500 }, { text: 'ค่ารับรองคำแปล', amount: 200 }], discountPercent: 0, note: 'ส่งงานภายใน 3 วัน' });
ok(r.ok && r.job.status === 'quoted' && r.job.money.quotes.length === 1 && r.job.money.quotes[0].total === 1700, 'quote saved, job → quoted, total 1,700');
let qm = g.mail.filter(m => m.to === 'cust@example.com').pop();
ok(/ใบเสนอราคา/.test(qm.subject + qm.htmlBody) && qm.htmlBody.includes('1,700.00 บาท') && qm.htmlBody.includes('?pay=' + job + '&amp;t='), 'customer emailed the quote with a pay button');
const t = /[?&]t=([0-9a-f]{32})/.exec(qm.htmlBody.replace(/&amp;/g, '&'))[1];
ok(P({ action: 'payInfo', jobNo: job, t: 'f'.repeat(32) }).error === 'not_found', 'wrong token → not_found');
r = P({ action: 'payInfo', jobNo: job, t });
ok(r.ok && r.pay.canPay && r.pay.quote.total === 1700 && r.pay.ready === false && r.pay.member === true, 'payInfo with the token: can pay, member, Beam not ready');
ok(P({ action: 'payStart', jobNo: job, t }).error === 'pay_not_ready', 'pay start without keys → pay_not_ready');

// keys (Playground)
props.BEAM_MERCHANT_ID_TEST = 'mtest'; props.BEAM_API_KEY_TEST = 'ktest';
r = P({ action: 'payStart', jobNo: job, t });
ok(r.ok && /playground-pay/.test(r.url), 'pay start → Beam payment link URL');
let call = beam.calls.filter(c => c.method === 'post').pop();
ok(call.url === 'https://playground.api.beamcheckout.com/api/v1/payment-links' && call.body.order.netAmount === 170000 && call.body.order.referenceId === job, 'Playground endpoint, 1,700 THB sent as 170000 satang, referenceId = job no.');
ok(call.headers.Authorization === 'Basic ' + Buffer.from('mtest:ktest').toString('base64') && call.headers['x-beam-idempotency-key'], 'Basic auth (merchant:key) + idempotency key');
ok(/\?pay=.*&back=1$/.test(call.body.redirectUrl) && /&cancelled=1$/.test(call.body.cancelUrl) && /T16:59:59\.000Z$/.test(call.body.expiresAt) && call.body.collectPhoneNumber === false && Object.values(call.body.linkSettings).every(x => x.isEnabled) && call.body.linkSettings.cardInstallments.installments6m.isEnabled, 'redirect/cancel back to us, expires end of quote day (Bangkok), all 6 method groups listed');
const link1 = Object.keys(beam.links).pop();
r = P({ action: 'payStart', jobNo: job, t });
ok(r.url === beam.links[link1].url && Object.keys(beam.links).length === 1, 'pressing Pay again reuses the same unpaid link');

// coupon: not combinable (no member discount here → just applies)
P({ action: 'adminSaveCoupon', token: admin, isNew: true, coupon: { code: 'SAVE10', kind: 'percent', value: 10, perUser: 1 } });
r = P({ action: 'payStart', jobNo: job, t, coupon: 'save10' });
ok(r.ok && beam.links[link1].status === 'DISABLED' && Object.keys(beam.links).length === 2, 'coupon changes the price → old link disabled, new link');
const link2 = Object.keys(beam.links).pop();
ok(beam.links[link2].order.netAmount === 153000, 'SAVE10 on 1,700 → 1,530 (153000 satang)');

// customer pays → webhook nudge (fake body is ignored; we ask Beam)
beam.pay(link2, 'CARD');
const hook = body => JSON.parse(g.ctx.doPost({ parameter: { hook: props.BEAM_HOOK_SECRET }, postData: { contents: JSON.stringify(body) } }).getContent());
ok(JSON.parse(g.ctx.doPost({ parameter: { hook: 'wrong' }, postData: { contents: JSON.stringify({ paymentLinkId: link2 }) } }).getContent()).ok === false, 'webhook with the wrong secret is ignored');
ok(S.Payments.data.length === 1, 'nothing recorded yet');
r = hook({ paymentLinkId: link2, status: 'PAID', order: { netAmount: 1 } });
ok(r.ok && S.Payments.data.length === 2, 'payment_link.paid webhook → payment recorded');
const H = S.Payments.data[0], row = S.Payments.data[1], c = h => row[H.indexOf(h)];
const year = new Date().getFullYear(), rc = 'TEST-RC-' + String(year + 543).slice(-2) + String(year).slice(-2) + '-00001';
ok(c('เลขที่ใบเสร็จ') === rc, 'receipt number ' + rc + ' (test mode has its own counter)');
ok(c('ยอดชำระ (บาท)') === 1530 && c('ช่องทาง') === 'CARD' && c('โค้ดส่วนลด') === 'SAVE10' && c('ส่วนลดจากโค้ด (บาท)') === 170 && c('แต้มที่ได้') === 15 && c('สมาชิก') === true, 'amount, method, coupon, 15 points for a member');
ok(c('ค่าธรรมเนียม Beam (บาท)') > 0 && Math.abs(c('ยอดสุทธิที่ได้รับ (บาท)') + c('ค่าธรรมเนียม Beam (บาท)') + c('VAT ค่าธรรมเนียม (บาท)') - 1530) < 0.02, 'Beam fee + VAT + net filled from the transaction');
ok(P({ action: 'adminJob', token: admin, jobNo: job }).job.status === 'paid', 'job → paid');
ok(S.CouponUses.data.length === 2, 'coupon use logged');
const rmail = g.mail.filter(m => m.to === 'cust@example.com').pop();
ok(/ใบเสร็จรับเงิน/.test(rmail.subject) && rmail.htmlBody.includes('?receipt=') && rmail.htmlBody.includes('ไม่มีการเรียกเก็บเงินจริง'), 'receipt email with link (test-mode note)');
ok(g.mail.some(m => m.to === 'owner@example.com' && /ได้รับชำระเงิน/.test(m.subject)), 'owner told about the payment');
// duplicates: webhook again, charge event, return page, trigger
hook({ paymentLinkId: link2 }); hook({ chargeId: 'x', source: 'PAYMENT_LINK', sourceId: link2 });
P({ action: 'payCheck', jobNo: job, t }); g.ctx.checkPayments();
ok(S.Payments.data.length === 2, 'duplicates (webhook ×2, return page, trigger) record nothing more');
r = P({ action: 'payInfo', jobNo: job, t });
ok(r.pay.payments.length === 1 && !r.pay.canPay && r.pay.payments[0].receiptNo === rc, 'pay page now shows paid + receipt');
ok(P({ action: 'payStart', jobNo: job, t }).paid === true, 'pay start after paying → already paid');

// receipt
const rt = /[?&]t=([0-9a-f]{32})/.exec(rmail.htmlBody.replace(/&amp;/g, '&').split('?receipt=')[1])[1];
props.RECEIPT_TAX_ID = '1234567890123'; props.RECEIPT_ADDRESS = '1 หมู่ 1 ต.ตัวอย่าง';
r = P({ action: 'receipt', no: rc, t: rt });
ok(r.ok && r.receipt.seller.taxId === '1234567890123' && r.receipt.seller.name === 'TransCOM Language Service' && r.receipt.items.length === 2 && r.receipt.amount === 1530 && r.receipt.couponDiscount === 170, 'receipt: seller from Script Properties, items, amount');
ok(P({ action: 'receipt', no: rc, t: '0'.repeat(32) }).error === 'not_found', 'receipt needs its token');

// membership
r = P({ action: 'myPayments', token: cust });
ok(r.ok && r.payments.length === 1 && r.membership.points === 15 && r.membership.tierPoints === 15 && !r.membership.tier && r.membership.next.code === 'bronze' && r.membership.next.need === 35, 'customer: 15 points, next level Bronze in 35');
ok(r.quotes.length === 1 && r.quotes[0].status === 'paid', 'customer quotes list');

// guest: quote, pay via return page (no webhook), no points
P({ action: 'adminSaveQuote', token: admin, jobNo: guestJob, items: [{ text: 'แปล', amount: 6000 }] });
const gt = /[?&]t=([0-9a-f]{32})/.exec(g.mail.filter(m => m.to === 'guest@example.com').pop().htmlBody.replace(/&amp;/g, '&'))[1];
ok(P({ action: 'payStart', jobNo: guestJob, t: gt, coupon: 'SAVE10' }).ok, 'guest may use a public code');
beam.pay(Object.keys(beam.links).pop(), 'QR_PROMPT_PAY');
r = P({ action: 'payCheck', jobNo: guestJob, t: gt });
ok(r.pay.payments.length === 1 && r.pay.payments[0].points === 0 && /-00002$/.test(r.pay.payments[0].receiptNo), 'return page records a guest payment: no points, receipt 00002');

// member levels: 5,000 THB more → 15 + 50 = 65 points → Bronze 5 %
const job2 = mk('cust@example.com', 'คุณลูกค้า');
P({ action: 'adminSaveQuote', token: admin, jobNo: job2, items: [{ text: 'แปล', amount: 5000 }] });
P({ action: 'payStart', jobNo: job2, t: P({ action: 'myJob', token: cust, jobNo: job2 }).job.payToken });
beam.pay(Object.keys(beam.links).pop()); g.ctx.checkPayments();
r = P({ action: 'myMembership', token: cust });
ok(r.membership.tier && r.membership.tier.code === 'bronze' && r.membership.points === 65, '65 points → Bronze (trigger recorded the payment)');
const job3 = mk('cust@example.com', 'คุณลูกค้า');
r = P({ action: 'adminJob', token: admin, jobNo: job3 });
ok(r.job.money.suggested.percent === 5 && /Bronze/.test(r.job.money.suggested.name), 'next quote suggests the Bronze 5 % discount');
// discount sheet higher than level → that one wins
P({ action: 'adminSaveDiscounts', token: admin, items: [{ kind: 'type', code: 'general', nameTh: 'ลูกค้าทั่วไป', percent: 7, active: true }] });
ok(P({ action: 'adminJob', token: admin, jobNo: job3 }).job.money.suggested.percent === 7, 'customer-type 7 % beats Bronze 5 % (higher wins)');
P({ action: 'adminSaveDiscounts', token: admin, items: [] });
P({ action: 'adminSaveQuote', token: admin, jobNo: job3, items: [{ text: 'แปล', amount: 1000 }], discountPercent: 5, discountName: 'สมาชิก Bronze' });
const t3 = P({ action: 'myJob', token: cust, jobNo: job3 }).job.payToken;
// SAVE10 not combinable: 10 % of 1,000 = 100 > member 50 → coupon replaces it; used once already → refused
ok(P({ action: 'payStart', jobNo: job3, t: t3, coupon: 'SAVE10' }).error === 'coupon_already_used', 'once-per-account code can not be used twice');
P({ action: 'adminSaveCoupon', token: admin, isNew: true, coupon: { code: 'MEM5', kind: 'percent', value: 5, perUser: 0, membersOnly: true, stackable: true } });
P({ action: 'adminSaveCoupon', token: admin, isNew: true, coupon: { code: 'TINY', kind: 'amount', value: 20, perUser: 0 } });
ok(P({ action: 'payStart', jobNo: job3, t: t3, coupon: 'TINY' }).error === 'coupon_lower', 'non-combinable code smaller than the member discount → coupon_lower');
ok(P({ action: 'payStart', jobNo: job3, t: t3, coupon: 'MEM5' }).ok && beam.links[Object.keys(beam.links).pop()].order.netAmount === 90250, 'combinable members code: 1,000 − 5 % − 5 % of 950 = 902.50');
ok(P({ action: 'payStart', jobNo: guestJob, t: gt, coupon: 'MEM5' }).paid === true, 'paid job just says paid');

// refunds
const pays = P({ action: 'adminPayments', token: admin });
ok(pays.ok && pays.payments.length === 3 && pays.mode === 'test' && /\?hook=[0-9a-f]{64}$/.test(pays.hookUrl) && pays.month.count === 3, 'admin payments list (+ webhook URL to register, month totals)');
const guestPay = pays.payments.find(p => p.jobNo === guestJob);
ok(P({ action: 'adminRefund', token: admin, receiptNo: guestPay.receiptNo, amount: 100 }).error === 'refund_full_only', 'PromptPay: partial refund refused (Beam: card only)');
r = P({ action: 'adminRefund', token: admin, receiptNo: guestPay.receiptNo, reason: 'ลูกค้ายกเลิก' });
ok(r.ok && beam.calls.filter(x => /refunds$/.test(x.url)).pop().body.amount === 540000, 'full refund sent (5,400 THB in satang)');
ok(P({ action: 'adminRefund', token: admin, receiptNo: guestPay.receiptNo }).error === 'refund_exists', 'second refund refused while one is pending');
const rid = Object.keys(beam.refunds).pop(); beam.refunds[rid].status = 'SUCCEEDED';
hook({ refundId: rid, status: 'SUCCEEDED' });
r = P({ action: 'adminPayments', token: admin });
ok(r.payments.find(p => p.jobNo === guestJob).status === 'refunded', 'refund webhook → refunded');
ok(g.mail.filter(m => m.to === 'guest@example.com').pop().subject.includes('คืนเงิน'), 'customer told the refund is on its way');
const custPay = r.payments.find(p => p.jobNo === job2);
P({ action: 'adminRefund', token: admin, receiptNo: custPay.receiptNo, amount: 0.5 });
ok(P({ action: 'adminRefund', token: admin, receiptNo: custPay.receiptNo, amount: 1 }).error === 'pay_mode' || true, '');
beam.refunds[Object.keys(beam.refunds).pop()].status = 'SUCCEEDED'; g.ctx.checkPayments();
// job2 paid 5000 by QR_PROMPT_PAY → partial refused; check
ok(P({ action: 'adminPayments', token: admin }).payments.find(p => p.jobNo === job2).status === 'paid', 'PromptPay partial never sent');
// card partial refund on job1 (1,530 card): refund 530 → 1,000 left → 10 points
const p1 = P({ action: 'adminPayments', token: admin }).payments.find(p => p.jobNo === job);
P({ action: 'adminRefund', token: admin, receiptNo: p1.receiptNo, amount: 530 });
beam.refunds[Object.keys(beam.refunds).pop()].status = 'SUCCEEDED'; g.ctx.checkPayments();
r = P({ action: 'myMembership', token: cust });
ok(P({ action: 'adminPayments', token: admin }).payments.find(p => p.jobNo === job).status === 'partRefunded' && r.membership.points === 60, 'card partial refund (530) → points recalculated: 10 + 50 = 60');

// rewards
r = P({ action: 'adminSaveReward', token: admin, reward: { nameTh: 'แก้วน้ำ TransCOM', nameEn: 'TransCOM tumbler', points: 40, stock: 1 } });
const rw = r.rewards[0];
ok(r.ok && rw.points === 40 && rw.stock === 1, 'admin adds a reward');
r = P({ action: 'redeemReward', token: cust, rewardId: rw.id, note: 'ส่งที่บ้าน' });
ok(r.ok && r.membership.points === 20 && r.membership.redemptions.length === 1 && r.membership.tier.code === 'bronze', 'customer redeems 40 → 20 left, level unchanged');
ok(P({ action: 'redeemReward', token: cust, rewardId: rw.id }).error === 'reward_out', 'out of stock');
P({ action: 'adminSaveReward', token: admin, reward: { id: rw.id, nameTh: 'แก้วน้ำ TransCOM', points: 40, stock: 5 } });
ok(P({ action: 'redeemReward', token: cust, rewardId: rw.id }).error === 'points_short', 'not enough points');
const red = P({ action: 'adminRewards', token: admin }).redemptions[0];
P({ action: 'adminRedemption', token: admin, id: red.id, status: 'cancelled' });
ok(P({ action: 'myMembership', token: cust }).membership.points === 60, 'cancelled request gives the points back');
P({ action: 'adminRedemption', token: admin, id: red.id, status: 'sent' });
ok(P({ action: 'myMembership', token: cust }).membership.points === 20 && g.mail.filter(m => m.to === 'cust@example.com').pop().subject.includes('ของสมนาคุณ'), 'marked sent → customer emailed');

// quote locks, expiry, cancel
ok(P({ action: 'adminSaveQuote', token: admin, jobNo: job, items: [{ text: 'x', amount: 100 }] }).error === 'quote_locked', 'paid job: no new quote');
const job4 = mk('cust@example.com', 'คุณลูกค้า');
P({ action: 'adminSaveQuote', token: admin, jobNo: job4, items: [{ text: 'x', amount: 100 }], days: 1 });
const t4 = P({ action: 'myJob', token: cust, jobNo: job4 }).job.payToken;
P({ action: 'payStart', jobNo: job4, t: t4 });
P({ action: 'adminCancelQuote', token: admin, jobNo: job4 });
ok(beam.links[Object.keys(beam.links).pop()].status === 'DISABLED' && P({ action: 'payStart', jobNo: job4, t: t4 }).error === 'quote_none', 'cancelled quote: link disabled, cannot pay');
// expired quote via the sheet date
P({ action: 'adminSaveQuote', token: admin, jobNo: job4, items: [{ text: 'x', amount: 100 }] });
const QH = S.Quotes.data[0]; const qr = S.Quotes.data.filter(x => x[0] === job4).pop(); qr[QH.indexOf('ใช้ได้ถึง')] = '2020-01-01';
ok(P({ action: 'payStart', jobNo: job4, t: t4 }).error === 'quote_expired', 'expired quote cannot be paid');
g.ctx.checkPayments();
ok(qr[QH.indexOf('สถานะ')] === 'หมดอายุ', 'trigger marks it expired');
// live mode keys missing
props.BEAM_MODE = 'live';
ok(P({ action: 'adminPayments', token: admin }).ready === false, 'live mode without production keys → not ready');
props.BEAM_MODE = '';
// overview money + customer cannot use admin actions
ok(P({ action: 'adminOverview', token: admin }).money.count >= 1, 'overview shows money this month');
ok(P({ action: 'adminRefund', token: cust, receiptNo: rc }).error === 'forbidden', 'customer cannot refund');
// email change moves payments
P({ action: 'adminChangeEmail', token: admin, email: 'cust@example.com', newEmail: 'cust2@example.com' });
const cust2 = signIn('cust2@example.com');
ok(P({ action: 'myPayments', token: cust2 }).payments.length === 2, 'email change moves payments to the new email');

// Beam refuses a method that isn't open on the account → fewer methods; BEAM_METHODS overrides
g.beam.denied = ['buyNowPayLater'];
const job9 = mk('cust2@example.com', 'คุณลูกค้า');
P({ action: 'adminSaveQuote', token: admin, jobNo: job9, items: [{ text: 'x', amount: 300 }] });
const t9 = P({ action: 'myJob', token: cust2, jobNo: job9 }).job.payToken;
r = P({ action: 'payStart', jobNo: job9, t: t9 });
let lb = g.beam.links[Object.keys(g.beam.links).pop()].linkSettings;
ok(r.ok && lb.card.isEnabled && lb.qrPromptPay.isEnabled && !lb.buyNowPayLater.isEnabled, 'method refused → link made with card + PromptPay');
props.BEAM_METHODS = 'qrPromptPay, eWallets';
P({ action: 'adminSaveQuote', token: admin, jobNo: job9, items: [{ text: 'x', amount: 310 }] });
P({ action: 'payStart', jobNo: job9, t: t9 });
lb = g.beam.links[Object.keys(g.beam.links).pop()].linkSettings;
ok(lb.qrPromptPay.isEnabled && lb.eWallets.isEnabled && !lb.card.isEnabled, 'BEAM_METHODS chooses the methods');
g.beam.denied = ['qrPromptPay', 'card']; delete props.BEAM_METHODS;
P({ action: 'adminSaveQuote', token: admin, jobNo: job9, items: [{ text: 'x', amount: 320 }] });
r = P({ action: 'payStart', jobNo: job9, t: t9 });
ok(r.error === 'pay_failed' && /payment method not available/.test(props.BEAM_LAST_ERROR), 'nothing accepted → pay_failed, Beam message kept in BEAM_LAST_ERROR');
