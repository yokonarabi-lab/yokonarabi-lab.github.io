// GA4（ハブページ）の数字を1回で全部読む：着地（/ と /index.html）・参照元別・基準期間の読み直し・note_click・コタロウ
// ページ: https://analytics.google.com/analytics/web/ （ホームが出てから実行。幅は 1280×900 でよい）
// 使い方: 下の TO（集計日）と BASE_TO（前回差の基準の集計日）を YYYYMMDD に書き換えて実行。FROM は 9/14 固定
// レポートの設定は変えない（URLの hash で表示だけ変える。鉛筆→保存は押さない）
const FROM = '20260914', TO = 'YYYYMMDD', BASE_TO = 'YYYYMMDD';
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(3000);
const prefix = (location.hash.match(/^#\/(a\d+p\d+)/) || [])[1];
const clickLeaf = (t) => { const l = [...document.querySelectorAll('*')].find(e => e.children.length == 0 && e.textContent.trim() == t); let e = l; for (let i = 0; i < 3 && e; i++) { e.click(); e = e.parentElement; } return !!l; };
// ホームから hash を直接変えるとホームに戻されるので、まずレポート画面に入る
clickLeaf('トラフィック獲得レポートを表示'); await sleep(4000);
clickLeaf('ランディング ページ'); await sleep(4000);
const go = async (r, dims, from, to) => {
  const p = `_u..nav=maui&_u.date00=${from}&_u.date01=${to}&_r.explorerCard..seldim=${JSON.stringify(dims)}&_r.explorerCard..rowsPerPage=100`;
  location.hash = `#/${prefix}/reports/explorer?params=${encodeURIComponent(p)}&r=${r}` + (r === 'landing-page' ? '&ruid=landing-page,business-objectives,generate-leads&collectionId=business-objectives' : '');
  await sleep(7000);
  const shown = (document.body.innerText.match(/\d+月\d+日～[^\n]+/) || [''])[0];
  const rows = [...document.querySelectorAll('[role="row"], table tr')].map(x => x.innerText.replace(/\s+/g, ' ').trim())
    .map(t => t.match(/^(\d+)\s+(\(not set\)|\S+)\s+(.+? \/ .+?)\s+([\d,]+)\s+\(/)).filter(Boolean)
    .map(m => ({ a: m[2], src: m[3], n: +m[4].replace(/,/g, '') }));
  return { shown, rows };
};
// 参照元のキー：youtube / social → youtube、google / organic → google、m.facebook.com / referral → m_facebook_referral（これまでのDBと同じ形）
const key = (s) => s.replace(/^\((direct)\) \/ \(none\)$/, 'direct').replace(/^\(not set\).*$/, 'not_set').replace(/ \/ (social|organic)$/, '').replace(/\.(com|jp|net|co)\b/g, '').replace(/ \/ referral$/, '_referral').replace(/[ .\/()]+/g, '_').replace(/^_|_$/g, '');
const landing = (L) => {
  const root = L.rows.filter(r => r.a === '/' || r.a === '/index.html');
  const by = {}; root.forEach(r => { const k = key(r.src); by[k] = (by[k] || 0) + r.n; });
  const kot = L.rows.filter(r => r.a === '/kotaro' || r.a === '/kotaro/');
  const kby = {}; kot.forEach(r => { const k = key(r.src); kby[k] = (kby[k] || 0) + r.n; });
  return { shown: L.shown, raw: root.reduce((a, r) => a + r.n, 0), test: by.test || 0, google_organic: by.google || 0, by, kotaro: kot.reduce((a, r) => a + r.n, 0), kotaro_by: kby };
};
const L1 = landing(await go('landing-page', ['landingPageMinusQueryString', 'sessionSourceMedium'], FROM, TO));
const L0 = landing(await go('landing-page', ['landingPageMinusQueryString', 'sessionSourceMedium'], FROM, BASE_TO));
const E = await go('top-events', ['eventName', 'sessionSourceMedium'], FROM, TO);
const nc = {}, ncBy = {}, ncTest = {}; let kotaro_click = 0; const kcBy = {};
E.rows.forEach(r => {
  const m = r.a.match(/^note_click_(.+)$/); const s = key(r.src);
  if (m) { if (s === 'test') ncTest[m[1]] = (ncTest[m[1]] || 0) + r.n; else { nc[m[1]] = (nc[m[1]] || 0) + r.n; ncBy[s] = (ncBy[s] || 0) + r.n; } }
  if (r.a === 'kotaro_click' && s !== 'test') { kotaro_click += r.n; kcBy[s] = (kcBy[s] || 0) + r.n; }
});
Object.keys(ncTest).forEach(k => { if (!(k in nc)) nc[k] = 0; });   // test でしか押されていない記事も 0 で残す
({ plat: 'ga4', read_at: new Date().toISOString(), from: FROM, to: TO, base_to: BASE_TO, landing: L1, base: L0,
   events_shown: E.shown, note_click: nc, note_click_by_source: ncBy, note_click_test: ncTest, kotaro_click, kotaro_click_by: kcBy });
