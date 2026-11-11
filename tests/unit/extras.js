const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
g.ctx.setup();
const signIn = email => { P({ action: 'requestCode', email }); return P({ action: 'verifyCode', email, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com'), cust = signIn('nida@example.com'), cust2 = signIn('mali@example.com');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// ---- visitors
ok(P({ action: 'visit', isNew: false }).total === 0, 'visitor count starts at 0 (real visits only)');
P({ action: 'visit', isNew: true }); P({ action: 'visit', isNew: true });
ok(P({ action: 'visit', isNew: true }).total === 3, 'new visits counted');
ok(P({ action: 'visit', isNew: false }).total === 3, 'repeat visit the same day is not counted');
const ov = P({ action: 'adminOverview', token: admin });
ok(ov.visits.total === 3 && ov.visits.days.length === 7 && ov.visits.days[6].count === 3, 'admin overview: total + today');

// ---- coupons
ok(g.sheets.Coupons && g.sheets.CouponUses, 'setup creates Coupons + CouponUses sheets');
ok(P({ action: 'adminSaveCoupon', token: cust, isNew: true, coupon: { code: 'X1', value: 5 } }).error === 'forbidden', 'customer cannot create codes');
let r = P({ action: 'adminSaveCoupon', token: admin, isNew: true, coupon: { code: 'new10', kind: 'percent', value: 10, maxDiscount: 200, minSpend: 500, maxUses: 2, perUser: 1, start: day(-1), end: day(30) } });
ok(r.ok && r.coupons[0].code === 'NEW10' && r.coupons[0].perUser === 1, 'admin creates a code (upper-cased)');
ok(P({ action: 'adminSaveCoupon', token: admin, isNew: true, coupon: { code: 'NEW10', value: 5 } }).error === 'coupon_exists', 'duplicate code refused');
ok(P({ action: 'adminSaveCoupon', token: admin, isNew: true, coupon: { code: 'BAD', kind: 'percent', value: 150 } }).error === 'invalid_number', 'percent over 100 refused');
ok(P({ action: 'adminSaveCoupon', token: admin, isNew: true, coupon: { code: 'BAD', value: 5, start: day(5), end: day(1) } }).error === 'invalid_date', 'end before start refused');
ok(P({ action: 'checkCoupon', code: 'NEW10', amount: 1000 }).error === 'coupon_sign_in', 'once-per-account code needs sign-in');
let c = P({ action: 'checkCoupon', token: cust, code: 'new10', amount: 1000 });
ok(c.ok && c.coupon.discount === 100, '10% of 1,000 = 100');
ok(P({ action: 'checkCoupon', token: cust, code: 'NEW10', amount: 5000 }).coupon.discount === 200, 'capped at max discount 200');
ok(P({ action: 'checkCoupon', token: cust, code: 'NEW10', amount: 300 }).error === 'coupon_min_spend', 'minimum spend');
ok(P({ action: 'checkCoupon', token: cust, code: 'NOPE', amount: 300 }).error === 'coupon_invalid', 'unknown code');
// usage limits
const U = g.sheets.CouponUses;
U.data.push(['NEW10', 'nida@example.com', 'TR-2569-0001', 100, new Date()]);
ok(P({ action: 'checkCoupon', token: cust, code: 'NEW10', amount: 1000 }).error === 'coupon_already_used', 'once per account');
ok(P({ action: 'checkCoupon', token: cust2, code: 'NEW10', amount: 1000 }).ok, 'another account can still use it');
U.data.push(['NEW10', 'other@example.com', 'TR-2569-0002', 100, new Date()]);
ok(P({ action: 'checkCoupon', token: cust2, code: 'NEW10', amount: 1000 }).error === 'coupon_used_up', 'first N people: used up');
r = P({ action: 'adminCoupons', token: admin });
ok(r.coupons[0].used === 2, 'admin sees how many times it was used');
P({ action: 'adminSaveCoupon', token: admin, isNew: true, coupon: { code: 'LATER', kind: 'amount', value: 50, perUser: 0, start: day(3) } });
ok(P({ action: 'checkCoupon', code: 'LATER', amount: 1000 }).error === 'coupon_not_started', 'not started yet (guest allowed when unlimited per account)');
P({ action: 'adminSaveCoupon', token: admin, coupon: { code: 'LATER', kind: 'amount', value: 50, perUser: 0, start: day(-10), end: day(-1) } });
ok(P({ action: 'checkCoupon', code: 'LATER', amount: 1000 }).error === 'coupon_expired', 'edit: dates changed → expired');
P({ action: 'adminSaveCoupon', token: admin, coupon: { code: 'LATER', kind: 'amount', value: 50, perUser: 0, active: false } });
ok(P({ action: 'checkCoupon', code: 'LATER', amount: 1000 }).error === 'coupon_invalid', 'switched off → not usable');
r = P({ action: 'adminDeleteCoupon', token: admin, code: 'LATER' });
ok(r.coupons.length === 1 && !g.sheets.Coupons.data.some(x => x[0] === 'LATER'), 'admin deletes a code');
let n = 0; for (let i = 0; i < 35; i++) n = P({ action: 'checkCoupon', code: 'GUESS' + i, amount: 1 });
ok(n.error === 'rate_limited', 'code guessing is rate limited');

// ---- posts
ok(g.sheets.News.data[0].includes('รหัสโพสต์') && g.sheets.Promotions.data[0].includes('รหัสโพสต์'), 'post id column added');
ok(P({ action: 'adminSavePost', token: cust, kind: 'news', post: { titleTh: 'x' } }).error === 'forbidden', 'customer cannot post');
ok(P({ action: 'adminSavePost', token: admin, kind: 'news', post: { textTh: 'x' } }).error === 'post_title', 'title required');
const img = P({ action: 'adminUploadImage', token: admin, name: 'promo.png', data: Buffer.from('PNG').toString('base64') });
ok(img.ok && /drive\.google\.com\/thumbnail\?id=/.test(img.imageUrl) && g.drive.files.find(f => f.name === 'promo.png').sharing === 'anyone', 'picture uploaded to the public folder, shared, thumbnail link');
ok(P({ action: 'adminUploadImage', token: admin, name: 'x.exe', data: 'QUJD' }).error === 'bad_file', 'only pictures');
g.drive.blockSharing = true;
ok(P({ action: 'adminUploadImage', token: admin, name: 'b.png', data: 'QUJD' }).error === 'sharing_blocked', 'org blocks public sharing → clear error, file removed');
g.drive.blockSharing = false;
g.cache.set('content', { v: '{"ok":true,"news":[],"promotions":[]}', exp: Date.now() + 1e6 });
r = P({ action: 'adminSavePost', token: admin, kind: 'news', post: { active: true, date: day(0), titleTh: 'โปรเปิดร้าน', titleEn: 'Opening offer', textTh: 'บรรทัด 1\nบรรทัด 2', image: img.image, cta: 'submit' } });
const mine = x => x.posts.filter(p => p.titleTh !== 'หัวข้อข่าว');   // setup's example draft is listed too
ok(r.ok && mine(r).length === 1 && mine(r)[0].id && mine(r)[0].textTh === 'บรรทัด 1\nบรรทัด 2' && r.posts.some(p => p.titleTh === 'หัวข้อข่าว' && !p.active), 'admin creates a news post (line breaks kept); example draft listed');
const content = P({ action: 'getContent' });
ok(content.news.length === 1 && content.news[0].title.th === 'โปรเปิดร้าน' && /thumbnail/.test(content.news[0].image), 'website sees the new post at once (cache cleared)');
const id = mine(r)[0].id;
r = P({ action: 'adminSavePost', token: admin, kind: 'news', post: Object.assign({}, mine(r)[0], { active: false, titleTh: 'แก้แล้ว' }) });
ok(mine(r).length === 1 && mine(r)[0].titleTh === 'แก้แล้ว' && !mine(r)[0].active && P({ action: 'getContent' }).news.length === 0, 'edit + hide (draft)');
ok(P({ action: 'adminSavePost', token: admin, kind: 'news', post: { titleTh: 'x', image: 'javascript:alert(1)' } }).error === 'post_image', 'unsafe picture link refused');
r = P({ action: 'adminSavePost', token: admin, kind: 'promo', post: { active: true, titleTh: 'ลด 10%', tagTh: 'โปร', start: day(0), end: day(10), cta: 'calculator' } });
ok(r.kind === 'promo' && r.posts.some(p => p.titleTh === 'ลด 10%' && p.end === day(10)), 'admin creates an offer with dates');
ok(P({ action: 'getContent' }).promotions.some(p => p.title.th === 'ลด 10%'), 'offer on the website');
r = P({ action: 'adminDeletePost', token: admin, kind: 'news', id });
ok(mine(r).length === 0, 'admin deletes a post');
// older rows typed in the sheet get an id when listed
g.sheets.News.data.push([true, day(-1), 'จากชีต', '', 'x', '', '', '', '']);
r = P({ action: 'adminPosts', token: admin, kind: 'news' });
ok(r.posts.some(p => p.titleTh === 'จากชีต' && p.id), 'rows typed in the sheet appear and get an id');
