// Festive themes (owner 2026-11-12): Themes sheet, admin actions, what getContent gives visitors.
const { load } = require('../lib/mock');
const g = load(require('../lib/paths').CODE_GS);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const P = g.post;
g.ctx.setup();
const signIn = email => { P({ action: 'requestCode', email }); return P({ action: 'verifyCode', email, code: g.lastCode() }).token; };
const admin = signIn('owner@example.com'), cust = signIn('nida@example.com');

// setup: 4 examples, switched off, only the first time
const T = g.sheets.Themes;
ok(T && T.data[0].join('|') === 'เปิดใช้|ชื่อธีม|เริ่ม|สิ้นสุด|ภาพพื้นหลัง (ลิงก์)|สีหลัก|สีรอง|รหัสธีม', 'setup creates the Themes sheet with Thai headers');
ok(T.data.length === 5 && T.data.slice(1).every(r => r[0] === false) && /ปีใหม่/.test(T.data[1][1]) && /ลอยกระทง/.test(T.data[4][1]), 'four example themes, all switched off');
g.ctx.setup();
ok(g.sheets.Themes.data.length === 5, 'running setup again does not add them twice');

// list
let r = P({ action: 'adminThemes', token: admin });
ok(r.ok && r.themes.length === 4 && r.themes.every(x => /^#[0-9a-f]{6}$/.test(x.accent) && x.id), 'admin lists the themes with colours and ids');
ok(P({ action: 'adminThemes', token: cust }).error === 'forbidden', 'customers cannot see theme settings');
ok(P({ action: 'getContent' }).themes.length === 0, 'visitors get no theme while all are off');

// save: checks
const base = { name: 'สงกรานต์ 2570', accent: '#0E7490', accent2: '#ec4899', start: '2027-04-10', end: '2027-04-16', active: true,
  image: 'https://drive.google.com/file/d/abcdefghijklmnop/view' };
ok(P({ action: 'adminSaveTheme', token: cust, theme: base }).error === 'forbidden', 'customers cannot save themes');
ok(P({ action: 'adminSaveTheme', token: admin, theme: Object.assign({}, base, { name: ' ' }) }).error === 'theme_name', 'a name is required');
ok(P({ action: 'adminSaveTheme', token: admin, theme: Object.assign({}, base, { accent: 'red' }) }).error === 'theme_color', 'colours must be #rrggbb');
ok(P({ action: 'adminSaveTheme', token: admin, theme: Object.assign({}, base, { end: '2027-04-01' }) }).error === 'invalid_date', 'end before start refused');
ok(P({ action: 'adminSaveTheme', token: admin, theme: Object.assign({}, base, { image: 'javascript:alert(1)' }) }).error === 'post_image', 'only https picture links');
ok(P({ action: 'adminSaveTheme', token: admin, theme: Object.assign({}, base, { image: 'https://x.test/a.jpg") ; }' }) }).error === 'post_image', 'a link that could break out of CSS is refused');

r = P({ action: 'adminSaveTheme', token: admin, theme: base });
const mine = r.themes.find(x => x.name === 'สงกรานต์ 2570');
ok(mine && mine.accent === '#0e7490' && mine.active && mine.start === '2027-04-10' && /thumbnail\?id=abcdefghijklmnop&sz=w1920/.test(mine.imageUrl), 'saved: colours lower-cased, dates, Drive link → large image link');
let c = P({ action: 'getContent' });
ok(c.themes.length === 1 && c.themes[0].accent === '#0e7490' && c.themes[0].image.includes('sz=w1920') && !('name' in c.themes[0]), 'visitors get switched-on themes (colours, dates, picture; no admin fields)');

// edit + switch off + delete
r = P({ action: 'adminSaveTheme', token: admin, theme: Object.assign({}, mine, { active: false }) });
ok(r.themes.find(x => x.id === mine.id).active === false && r.themes.length === 5, 'switch off by id (no new row)');
ok(P({ action: 'getContent' }).themes.length === 0, 'content cache cleared: the switch-off shows at once');
ok(P({ action: 'adminSaveTheme', token: admin, theme: Object.assign({}, mine, { id: 'nope' }) }).error === 'not_found', 'unknown id refused');
r = P({ action: 'adminDeleteTheme', token: admin, id: mine.id });
ok(r.themes.length === 4 && !r.themes.some(x => x.id === mine.id), 'delete removes the row');
ok(P({ action: 'adminDeleteTheme', token: cust, id: r.themes[0].id }).error === 'forbidden', 'customers cannot delete themes');

// a theme typed straight into the sheet still works
g.sheets.Themes.data.push([true, 'ทดสอบในชีต', '', '', '', '#123456', 'bad', '']);
c = P({ action: 'adminThemes', token: admin });
const typed = c.themes.find(x => x.name === 'ทดสอบในชีต');
ok(typed && typed.id && typed.accent2 === '#006192', 'row typed in the sheet gets an id; a bad colour falls back');
