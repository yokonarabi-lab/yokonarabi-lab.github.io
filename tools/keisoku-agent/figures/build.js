// note用の図版 4枚＋図版ページ（index.html）を data.json から書き出す
//   node build.js data.json [--baseline base.json] [--out DIR]
//
//   sns.png       5つのSNS集計データ（幅1080・縦）
//   clicks.png    SNSからnoteへのクリック数（幅1080・縦）  ← data.clicks が null なら作らない
//   note.png      noteの集計データ（幅1080・縦、記事別）
//   eyecatch.png  見出し画像（1280×670）                     ← data.clicks が null なら作らない
//   index.html    図版アーティファクト「SNS実験の図版」のページ（同じURLに差し替える）
//
// 前回差（d）：--baseline に前回の記事の data.json（DBの figures/<基準ID>）を渡すと、行の name で突き合わせて自動計算する。
//   前回に無い行は 'new'（図では NEW）。data.json に d が書いてあればそちらが優先。baseline が無ければ前回差の列は出ない。
// デザインは 2026-09-21 に Sky が確定したもの。ここを変えない（色・文字サイズ・列幅・行の帯）。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/* ---------- 引数 ---------- */
const argv = process.argv.slice(2);
const arg = (k, def) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : def; };
const DATA_PATH = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--baseline' && argv[argv.indexOf(a) - 1] !== '--out') || 'data.json';
const BASE_PATH = arg('--baseline', null);
const OUT = arg('--out', process.env.OUT || path.join(process.cwd(), 'out'));

const D = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const B = BASE_PATH ? JSON.parse(fs.readFileSync(BASE_PATH, 'utf8')) : null;

/* ---------- 定数（変えない） ---------- */
const START = D.start || '2026-09-06';
const SNS_COLOR = { YouTube: '#22c07b', TikTok: '#f0378f', X: '#1c6ef2', Instagram: '#f2a01e', Threads: '#f05a23' };
const CLICK_EXTRA_COLOR = { 'note（コタロウ）': '#8b8b87', '参照元なし': '#c9c8c3' };
const ROUTE_COLORS = ['#0f2436', '#199e70', '#8b8b87'];
const NOTE_GRAY = '#5c5c58';
const NOTE_GREENS = ['#0a4a34', '#0d5f43', '#147d58', '#199e70', '#4cbf93', '#8fd9bc', '#c6ecdb'];
const T = {
  pageBg: '#f2f1ef', cardBg: '#ffffff', text: '#111110', muted: '#8b8b87', delta: '#6b6a66', zero: '#c2c1bd',
  divider: '#e8e7e4', headerBg: '#0f2436', headerSub: '#93a7b7',
  edge1: '#111110', edge2: '#199e70', track: '#eceae6',
};
const FONT = '"TeX Gyre Heros","Noto Sans CJK JP",sans-serif';

/* ---------- 時点・日数 ---------- */
const recDate = new Date(D.rec.length <= 16 ? D.rec + ':00+09:00' : D.rec);
const jst = new Date(recDate.getTime() + 9 * 3600 * 1000);
const p2 = (v) => String(v).padStart(2, '0');
const REC_YMD = `${jst.getUTCFullYear()}-${p2(jst.getUTCMonth() + 1)}-${p2(jst.getUTCDate())}`;
const REC_LABEL = `${jst.getUTCFullYear()}/${p2(jst.getUTCMonth() + 1)}/${p2(jst.getUTCDate())} ${p2(jst.getUTCHours())}:${p2(jst.getUTCMinutes())}`;
const REC_STAMP = `${REC_LABEL} 時点`;
const DAY = Math.round((new Date(REC_YMD) - new Date(START)) / 86400000);

let BASE_LABEL = null, BASE_SHORT = null;   // 例: '9/21 17:40', '9/21'
if (B && B.rec) {
  const b = new Date(B.rec.length <= 16 ? B.rec + ':00+09:00' : B.rec);
  const bj = new Date(b.getTime() + 9 * 3600 * 1000);
  BASE_SHORT = `${bj.getUTCMonth() + 1}/${bj.getUTCDate()}`;
  BASE_LABEL = `${BASE_SHORT} ${p2(bj.getUTCHours())}:${p2(bj.getUTCMinutes())}`;
}
if (D.baseline && D.baseline.label) { BASE_LABEL = D.baseline.label; BASE_SHORT = D.baseline.short || BASE_LABEL.split(' ')[0]; }

/* ---------- 前回差の計算 ---------- */
const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
const diff = (cur, prev) => (num(cur) == null || num(prev) == null) ? null : cur - prev;
const byName = (rows) => Object.fromEntries((rows || []).map(r => [r.name, r]));
// rows: 今回の行、base: 前回の行、keys: 差を出すキー。行に d があれば優先
function deltaRows(rows, base, keys) {
  if (!B) return rows;
  const bm = byName(base);
  return rows.map(r => {
    if (r.d) return r;
    const b = bm[r.name];
    const d = {};
    keys.forEach(k => { d[k] = b ? diff(r[k], b[k]) : 'new'; });
    return Object.assign({}, r, { d });
  });
}
function deltaObj(cur, base, keys) {
  if (!B) return cur;
  if (cur.d) return cur;
  const d = {};
  keys.forEach(k => { d[k] = base ? diff(cur[k], base[k]) : null; });
  return Object.assign({}, cur, { d });
}

/* ---------- データを図の形に ---------- */
// 1. SNS
const snsMedia = (D.sns.media || []).map(m => Object.assign({ color: SNS_COLOR[m.name] || '#8b8b87' }, m));
// 合計は書いてあればそれ、無ければ5媒体の和（前回の data.json も同じ規則で読む）
function snsTotals(sns) {
  const t = (sns && sns.total) || {}, media = (sns && sns.media) || [];
  const sum = (k) => media.reduce((a, m) => a + (num(m[k]) || 0), 0);
  return {
    views: num(t.views) != null ? t.views : sum('views'),
    likes: num(t.likes) != null ? t.likes : sum('likes'),
    followers: num(t.followers) != null ? t.followers : sum('followers'),
    posts: num(t.posts) != null ? t.posts : sum('posts'),
    d: t.d,
  };
}
const snsTotal = snsTotals(D.sns);
const SNS = {
  total: deltaObj(snsTotal, B && snsTotals(B.sns), ['views', 'followers', 'likes', 'posts']),
  media: deltaRows(snsMedia, B && B.sns && B.sns.media, ['posts', 'views', 'likes', 'followers']),
  fn: D.sns.fn || ('YouTubeのフォロワーは登録者数。' + (BASE_SHORT ? `前回差は${BASE_SHORT}の図との差。` : '')),
};

// 2. クリック（00Minが読めなかった日は data.clicks = null → 図を作らない）
let CLICKS = null;
if (D.clicks) {
  const routes = (D.clicks.routes || []).map((r, i) => Object.assign({ color: ROUTE_COLORS[i] || '#8b8b87' }, r));
  const media = (D.clicks.media || []).map(m => Object.assign({ color: SNS_COLOR[m.name] || CLICK_EXTRA_COLOR[m.name] || '#8b8b87' }, m));
  const total = num(D.clicks.total) != null ? D.clicks.total : routes.reduce((a, r) => a + (r.clicks || 0), 0);
  const bT = B && B.clicks ? (num(B.clicks.total) != null ? B.clicks.total : (B.clicks.routes || []).reduce((a, r) => a + (r.clicks || 0), 0)) : null;
  CLICKS = {
    total,
    d: D.clicks.d != null ? D.clicks.d : (B ? diff(total, bT) : null),
    routes: deltaRows(routes, B && B.clicks && B.clicks.routes, ['clicks']).map(r => r.d && typeof r.d === 'object' ? Object.assign({}, r, { d: r.d.clicks }) : r),
    media: deltaRows(media, B && B.clicks && B.clicks.media, ['clicks']).map(m => m.d && typeof m.d === 'object' ? Object.assign({}, m, { d: m.d.clicks }) : m),
    fn: D.clicks.fn || ('同じ人が複数回押した分も含む。' + (BASE_SHORT ? `前回差は${BASE_SHORT}の図との差。` : '')),
  };
}

// 3. note（記事別の色：自己紹介はグレー、それ以外は濃い緑→薄い緑を本数で割り付け）
function lerpHex(a, b, t) {
  const A = a.match(/\w\w/g).map(h => parseInt(h, 16)), Bc = b.match(/\w\w/g).map(h => parseInt(h, 16));
  return '#' + A.map((v, i) => Math.round(v + (Bc[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function greens(n) {
  if (n <= 1) return [NOTE_GREENS[3]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * (NOTE_GREENS.length - 1);
    const k = Math.min(Math.floor(t), NOTE_GREENS.length - 2);
    out.push(lerpHex(NOTE_GREENS[k], NOTE_GREENS[k + 1], t - k));
  }
  return out;
}
const noteRowsIn = D.note.articles || D.note.media || [];
const greenRows = noteRowsIn.filter(r => r.name !== '自己紹介' && !r.gray);
const gcol = greens(greenRows.length);
let gi = 0;
const noteRows = noteRowsIn.map(r => Object.assign({ color: (r.name === '自己紹介' || r.gray) ? NOTE_GRAY : gcol[gi++] }, r));
// noteの合計：imp・pv はスクショの合計値（無ければ記事別の和）、スキ・フォロワー・記事数は書いてあるもの
function noteTotals(note) {
  const t = (note && note.total) || {}, rows = (note && (note.articles || note.media)) || [];
  const sum = (k) => rows.reduce((a, m) => a + (num(m[k]) || 0), 0);
  return Object.assign({}, t, {
    imp: num(t.imp) != null ? t.imp : sum('imp'),
    pv: num(t.pv) != null ? t.pv : sum('pv'),
  });
}
const noteTotalIn = noteTotals(D.note);
const NOTE = {
  total: deltaObj(noteTotalIn, B && noteTotals(B.note), ['imp', 'pv', 'likes', 'followers', 'posts']),
  media: deltaRows(noteRows, B && B.note && (B.note.articles || B.note.media), ['imp', 'pv']),
  fn: D.note.fn || (
    'インプレッションはnoteの中で記事が一覧に表示された回数。ページビューは実際に開かれた回数。' +
    (D.note.win ? `集計期間は過去28日間（${D.note.win}）。` : '') +
    (D.note.fn_extra ? D.note.fn_extra : '') +
    'スキとフォロワーはクリエイターページの値。' +
    (BASE_SHORT ? `前回差は${BASE_SHORT}の図との差。` : '')),
};

// 4. 見出し画像
const n = (v) => (v == null ? '–' : Number(v).toLocaleString('en-US'));
const EYE = {
  seriesName: (D.eyecatch && D.eyecatch.seriesName) || 'SNS実験',
  day: DAY,
  a: { label: '5つのSNS', unit: '表示・再生', value: n(SNS.total.views) },
  b: { label: 'note', unit: 'クリック', value: CLICKS ? n(CLICKS.total) : '–' },
};

/* ---------- 描画の部品（変えない） ---------- */
const dd = (v) => v == null ? '' : v === 'new' ? 'NEW' : (v > 0 ? '+' + n(v) : v < 0 ? '−' + n(-v) : '0');
const dcls = (v) => v === 'new' ? 'd nw' : (v === 0 ? 'd z' : 'd');

const BASE = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:${T.pageBg};color:${T.text};font-family:${FONT};
  -webkit-font-smoothing:antialiased;font-feature-settings:"palt" 0}
.strip{height:14px;display:flex}.strip i{flex:1}
.hd{background:${T.headerBg};padding:34px 44px 38px}
.hd .sub{font-size:44px;color:${T.headerSub};font-weight:500}
.hd .ttl{font-size:74px;font-weight:700;color:#fff;margin-top:8px;line-height:1.12;letter-spacing:.01em}
.wrap{padding:28px 28px 34px;display:flex;flex-direction:column;gap:26px}
.card{background:${T.cardBg};border-radius:28px;overflow:hidden}
.card .edge{height:8px}
.card .in{padding:34px 32px 34px}
.chd{display:flex;align-items:baseline;gap:22px;margin-bottom:20px}
.chd b{font-size:64px;font-weight:700;white-space:nowrap;letter-spacing:.02em}
.chd span{font-size:40px;color:${T.muted};font-weight:400;white-space:nowrap}
.hr{height:2px;background:${T.divider}}
.big{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:26px 0 0}
.big .lb{font-size:48px;font-weight:400;white-space:nowrap}
.big .vv{font-size:118px;font-weight:700;line-height:.9;letter-spacing:-.02em;margin-left:auto}
.bar{display:flex;height:26px;border-radius:13px;overflow:hidden;margin:34px 0 28px}
.bar span{display:block}
.duo{display:grid;grid-template-columns:1fr 1fr;padding-top:28px}
.duo>div{display:flex;align-items:baseline;justify-content:space-between;gap:22px;white-space:nowrap;padding:0 36px 0 8px}
.duo>div+div{border-left:2px solid ${T.divider};padding:0 8px 0 36px}
.duo .k{font-size:44px;font-weight:400}
.duo .v{font-size:76px;font-weight:700;line-height:1}
.fn{font-size:30px;color:${T.muted};font-weight:400;margin-top:22px;line-height:1.45;white-space:nowrap}
.fn.wrap{white-space:normal}
/* 前回差 */
.dstack{display:flex;flex-direction:column;align-items:flex-end;line-height:1;font-size:40px;color:${T.delta};font-weight:400;letter-spacing:0;white-space:nowrap;font-variant-numeric:tabular-nums}
.dstack i{font-style:normal;font-size:24px;margin-bottom:6px;letter-spacing:.02em;color:${T.muted}}
.vd{display:inline-flex;align-items:baseline;justify-content:flex-end}
.th{display:grid;margin-bottom:12px}
.th>div{display:flex;justify-content:flex-end;font-size:28px;color:${T.muted};white-space:nowrap;line-height:1.2}
.vd .d{display:inline-block;text-align:right;font-size:30px;font-weight:400;color:${T.delta};letter-spacing:0;font-variant-numeric:tabular-nums}
.d.z{color:${T.zero}}
.d.nw{font-size:24px;letter-spacing:.06em;color:${T.muted}}
.kv{display:flex;align-items:baseline;gap:14px}
.kv .d{font-size:34px;font-weight:400;color:${T.delta};min-width:60px;text-align:right;font-variant-numeric:tabular-nums}
`;

function page(width, inner, extraCss) {
  return `<!doctype html><meta charset="utf-8"><style>${BASE}
body{width:${width}px}${extraCss || ''}</style>${inner}`;
}
const thead = (cols, labels) => `<div class="th" style="grid-template-columns:${cols.map(c => c + 'px').join(' ')}">${
  labels.map(l => `<div style="padding-right:${l.pr || 0}px">${l.t || ''}</div>`).join('')}</div>`;
const bigD = (v) => v == null ? '' : `<div class="dstack"><i>前回差</i>${dd(v)}</div>`;
const vd = (v, d, w) => `<span class="vd"><span class="v">${n(v)}</span><span class="${dcls(d)}" style="width:${w}px">${dd(d)}</span></span>`;

/* ---------- 1. 5つのSNS集計データ ---------- */
function figSns() {
  const sum = SNS.media.reduce((a, m) => a + (m.views || 0), 0);
  const bar = SNS.media.map(m =>
    `<span style="width:${((m.views || 0) / sum * 100).toFixed(2)}%;background:${m.color}"></span>`).join('');
  const hasD = SNS.media.some(m => m.d);
  const Dv = (m, k, w) => hasD ? vd(m[k], m.d ? m.d[k] : null, w) : n(m[k]);
  const rows = SNS.media.map((m, i) => `
    <tr class="${i % 2 ? 'bt' : 'zb'}">
      <td class="nm"><i style="background:${m.color}"></i>${m.name}</td>
      <td>${Dv(m, 'posts', 50)}</td><td>${Dv(m, 'views', 104)}</td><td>${Dv(m, 'likes', 50)}</td><td>${Dv(m, 'followers', 50)}</td>
    </tr>`).join('');
  const td = SNS.total.d || {};

  const css = `
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{font-size:30px;color:${T.muted};font-weight:400;text-align:right;padding:0 0 14px 16px;white-space:nowrap}
th:first-child{text-align:left;padding-left:0}
tr.zb td{background:#f7f6f3}
td:first-child{border-radius:14px 0 0 14px}td:last-child{border-radius:0 14px 14px 0;padding-right:16px}
td{font-size:48px;font-weight:400;text-align:right;padding:22px 0 22px 16px;white-space:nowrap;
  letter-spacing:-.01em;font-variant-numeric:tabular-nums}
td.nm{font-size:36px;font-weight:700;text-align:left;letter-spacing:0;padding-left:0}
td.nm i{display:inline-block;width:18px;height:18px;border-radius:50%;margin-right:12px;vertical-align:middle}
tr.bt td{border-top:0}
td.nm{padding-left:16px}
.vd .d{margin-left:8px}`;

  return page(1080, `
<div class="strip"><i style="background:#d95926"></i><i style="background:#199e70"></i></div>
<div class="hd"><div class="sub">生成AI横並び検証室</div><div class="ttl">5つのSNS集計データ</div></div>
<div class="wrap">
  <div class="card"><div class="edge" style="background:${T.edge1}"></div><div class="in">
    <div class="chd"><b>合計</b><span>${REC_STAMP}</span></div>
    <div class="hr"></div>
    <div class="big"><div class="lb">表示・再生</div><div class="vv">${n(SNS.total.views)}</div>${bigD(td.views)}</div>
    <div class="bar">${bar}</div>
    <div class="hr"></div>
    <div class="duo">
      <div><span class="k">いいね</span><span class="kv"><span class="v">${n(SNS.total.likes)}</span><span class="${dcls(td.likes)}">${dd(td.likes)}</span></span></div>
      <div><span class="k">フォロワー</span><span class="kv"><span class="v">${n(SNS.total.followers)}</span><span class="${dcls(td.followers)}">${dd(td.followers)}</span></span></div>
    </div>
  </div></div>
  <div class="card"><div class="edge" style="background:${T.edge2}"></div><div class="in">
    <div class="chd"><b>SNSごとの内訳</b></div>
    ${thead([210,136,290,150,174], [{}, {t:'投稿',pr:58}, {t:'表示・再生',pr:112}, {t:'いいね',pr:58}, {t:'フォロワー',pr:30}])}
    <table>
      <colgroup><col style="width:210px"><col style="width:136px"><col style="width:290px"><col style="width:150px"><col style="width:174px"></colgroup>
      ${rows}
    </table>
    <div class="fn">${SNS.fn}</div>
  </div></div>
</div>`, css);
}

/* ---------- 2. SNSからnoteへのクリック数 ---------- */
function figClicks() {
  const hasD = CLICKS.d != null || CLICKS.routes.some(r => r.d != null) || CLICKS.media.some(m => m.d != null);
  const dl = (v) => hasD ? `<div class="${v === 0 ? 'dlt z' : 'dlt'}">${dd(v)}</div>` : '';

  const rsum = CLICKS.routes.reduce((a, r) => a + (r.clicks || 0), 0);
  const rbar = CLICKS.routes.map(r =>
    `<span style="width:${((r.clicks || 0) / rsum * 100).toFixed(2)}%;background:${r.color}"></span>`).join('');
  const routes = CLICKS.routes.map((r, i) => `
    <div class="rt${i ? ' bt' : ''}">
      <div class="nm"><i style="background:${r.color}"></i>${r.name}${r.note ? `<em>${r.note}</em>` : ''}</div>
      <div class="val">${r.pre ? `<small>${r.pre}</small>` : ''}${n(r.clicks)}</div>
      ${dl(r.d)}
    </div>`).join('');

  const max = Math.max.apply(null, CLICKS.media.map(m => m.clicks || 0)) || 1;
  const msum = CLICKS.media.reduce((a, m) => a + (m.clicks || 0), 0);
  const rows = CLICKS.media.map((m) => `
    <div class="row bt">
      <div class="nm"><i style="background:${m.color}"></i>${m.name}</div>
      <div class="track"><b style="width:${((m.clicks || 0) / max * 100).toFixed(1)}%;background:${m.color}"></b></div>
      <div class="val">${n(m.clicks)}</div>
      ${dl(m.d)}
    </div>`).join('');

  const css = `
.hd .ttl{font-size:62px}
.rt{display:flex;align-items:center;gap:24px;padding:22px 0}
.rt .nm{flex:1}
.rt.bt,.row.bt{border-top:2px solid ${T.divider}}
.rt .nm em{font-style:normal;font-weight:400;font-size:32px;color:${T.muted};margin-left:18px}
.row{display:grid;grid-template-columns:390px 1fr 110px${hasD ? ' 80px' : ''};align-items:center;gap:24px;padding:22px 0}
.row.hd2{padding:0 0 20px;border-top:0}
.row.hd2 b{font-size:64px;font-weight:700;letter-spacing:.02em;white-space:nowrap}
.row.hd2 .val{font-size:52px}
.nm{font-size:40px;font-weight:700;white-space:nowrap}
.nm i{display:inline-block;width:18px;height:18px;border-radius:50%;margin-right:14px;vertical-align:middle}
.track{height:26px;border-radius:13px;background:${T.track};overflow:hidden}
.track b{display:block;height:100%;border-radius:13px}
.val{font-size:52px;font-weight:400;text-align:right;letter-spacing:-.01em;
  font-variant-numeric:tabular-nums;white-space:nowrap}
.rt .val{font-size:60px}
.rt .val small{font-size:32px;color:${T.muted};margin-right:26px;font-weight:400}
.dlt{font-size:34px;color:${T.delta};text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;width:80px;flex:none}
.dlt.z{color:${T.zero}}
.row.hd2 .dlt{display:flex;flex-direction:column;align-items:flex-end;line-height:1;font-size:40px}
.row.hd2 .dlt i{font-style:normal;font-size:24px;margin-bottom:6px;color:${T.muted}}`;

  const hd2Delta = hasD ? `<div class="dlt"><i>前回差</i>${dd(CLICKS.d)}</div>` : '';

  return page(1080, `
<div class="strip"><i style="background:#d95926"></i><i style="background:#199e70"></i></div>
<div class="hd"><div class="sub">生成AI横並び検証室</div><div class="ttl">SNSからnoteへのクリック数</div></div>
<div class="wrap">
  <div class="card"><div class="edge" style="background:${T.edge1}"></div><div class="in">
    <div class="chd"><b>合計</b><span>${REC_STAMP}</span></div>
    <div class="hr"></div>
    <div class="big"><div class="lb">クリック</div><div class="vv">${n(CLICKS.total)}</div>${hasD ? bigD(CLICKS.d) : ''}</div>
    <div class="bar">${rbar}</div>
    <div class="hr"></div>
    ${routes}
  </div></div>
  <div class="card"><div class="edge" style="background:${T.edge2}"></div><div class="in">
    <div class="row hd2"><b>SNS別</b><div></div><div class="val">${n(msum)}</div>${hd2Delta}</div>
    ${rows}
    <div class="fn">${CLICKS.fn}</div>
  </div></div>
</div>`, css);
}

/* ---------- 3. noteの集計データ ---------- */
function figNote() {
  const sum = NOTE.media.reduce((a, m) => a + (m.imp || 0), 0);
  const bar = NOTE.media.map(m =>
    `<span style="width:${((m.imp || 0) / sum * 100).toFixed(2)}%;background:${m.color}"></span>`).join('');
  const hasD = NOTE.media.some(m => m.d);
  const Dv = (m, k, w) => hasD ? vd(m[k], m.d ? m.d[k] : null, w) : n(m[k]);
  const rows = NOTE.media.map((m, i) => `
    <tr class="${i % 2 ? 'bt' : 'zb'}">
      <td class="nm"><i style="background:${m.color}"></i>${m.name}</td>
      <td>${Dv(m, 'imp', 112)}</td><td>${Dv(m, 'pv', 80)}</td>
    </tr>`).join('');
  const td = NOTE.total.d || {};
  const q = (k, v, d) => `<div><span class="k">${k}</span><span class="kv"><span class="v">${n(v)}</span><span class="${dcls(d)}">${dd(d)}</span></span></div>`;

  const css = `
.quad{display:grid;grid-template-columns:1fr 1fr;padding-top:14px}
.quad>div{display:flex;align-items:baseline;justify-content:space-between;gap:22px;
  white-space:nowrap;padding:20px 0 20px 8px}
.quad>div:nth-child(2n){border-left:2px solid ${T.divider};padding-left:36px}
.quad>div:nth-child(2n+1){padding-right:36px}
.quad>div:nth-child(n+3){border-top:2px solid ${T.divider}}
.quad .k{font-size:44px;font-weight:400}
.quad .v{font-size:76px;font-weight:700;line-height:1}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{font-size:32px;color:${T.muted};font-weight:400;text-align:right;padding:0 0 16px;white-space:nowrap}
th:first-child{text-align:left}
td{font-size:52px;font-weight:400;text-align:right;padding:18px 0;white-space:nowrap;
  letter-spacing:-.01em;font-variant-numeric:tabular-nums}
td.nm{font-size:40px;font-weight:700;text-align:left;letter-spacing:0;padding-left:16px}
td.nm i{display:inline-block;width:18px;height:18px;border-radius:50%;margin-right:14px;vertical-align:middle}
tr.bt td{border-top:0}
tr.zb td{background:#f7f6f3}
td:first-child{border-radius:14px 0 0 14px}td:last-child{border-radius:0 14px 14px 0;padding-right:16px}
th:last-child{padding-right:16px}
.vd .d{margin-left:8px}`;

  return page(1080, `
<div class="strip"><i style="background:#d95926"></i><i style="background:#199e70"></i></div>
<div class="hd"><div class="sub">生成AI横並び検証室</div><div class="ttl">noteの集計データ</div></div>
<div class="wrap">
  <div class="card"><div class="edge" style="background:${T.edge1}"></div><div class="in">
    <div class="chd"><b>合計</b><span>${REC_STAMP}</span></div>
    <div class="hr"></div>
    <div class="big"><div class="lb">インプレッション</div><div class="vv">${n(NOTE.total.imp)}</div>${bigD(td.imp)}</div>
    <div class="bar">${bar}</div>
    <div class="hr"></div>
    <div class="quad">
      ${q('ページビュー', NOTE.total.pv, td.pv)}
      ${q('記事', NOTE.total.posts, td.posts)}
      ${q('スキ', NOTE.total.likes, td.likes)}
      ${q('フォロワー', NOTE.total.followers, td.followers)}
    </div>
  </div></div>
  <div class="card"><div class="edge" style="background:${T.edge2}"></div><div class="in">
    <div class="chd"><b>記事ごとの内訳</b></div>
    ${thead([390,320,250], [{}, {t:'インプレッション',pr:94}, {t:'ページビュー',pr:104}])}
    <table>
      <colgroup><col style="width:390px"><col style="width:320px"><col style="width:250px"></colgroup>
      ${rows}
    </table>
    <div class="fn wrap">${NOTE.fn}</div>
  </div></div>
</div>`, css);
}

/* ---------- 4. 見出し画像 1280×670 ---------- */
function figEyecatch() {
  const sky = `
<svg class="sky" viewBox="0 0 1280 670" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="2.5" cy="2.5" r="2.5" fill="#8fc4e8"/>
    </pattern>
    <radialGradient id="glow" cx="50%" cy="38%" r="72%">
      <stop offset="0%" stop-color="#1b3d5a"/>
      <stop offset="100%" stop-color="#0a1826"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="670" fill="url(#glow)"/>
  <g stroke="#8fc4e8" fill="none" stroke-width="3">
    <circle cx="104" cy="576" r="210" opacity=".30"/>
    <circle cx="104" cy="576" r="126" opacity=".22"/>
    <circle cx="1196" cy="94" r="248" opacity=".28"/>
    <circle cx="1196" cy="94" r="152" opacity=".20"/>
    <circle cx="640" cy="700" r="300" opacity=".14"/>
    <path d="M 292 646 L 380 482 L 468 646 Z" opacity=".26"/>
    <path d="M 902 30 L 972 152 L 832 152 Z" opacity=".22"/>
    <path d="M 1040 610 L 1150 610 L 1150 500 Z" opacity=".20"/>
    <path d="M 60 128 L 148 128 L 148 40 Z" opacity=".16"/>
  </g>
  <g stroke="#8fc4e8" stroke-width="2" opacity=".16">
    <path d="M 0 198 L 1280 140"/>
    <path d="M 0 532 L 1280 592"/>
  </g>
  <rect x="196" y="52" width="208" height="130" fill="url(#dots)" opacity=".34"/>
  <rect x="988" y="470" width="234" height="156" fill="url(#dots)" opacity=".28"/>
  <rect x="16" y="286" width="130" height="104" fill="url(#dots)" opacity=".20"/>
  <rect x="1150" y="270" width="114" height="104" fill="url(#dots)" opacity=".18"/>
</svg>`;

  const css = `
body{width:1280px;height:670px;background:#0a1826;color:#fff;position:relative;overflow:hidden}
.sky{position:absolute;inset:0;width:1280px;height:670px}
.strip{position:absolute;top:0;left:0;right:0;height:10px;display:flex;z-index:2}
.core{position:relative;z-index:2;height:670px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;padding:0 52px;text-align:center}
.series{font-size:76px;font-weight:700;letter-spacing:.06em;line-height:1;
  display:flex;align-items:baseline;gap:4px}
.series .gap{width:38px}
.series .unit{font-size:62px;letter-spacing:.04em}
.head{display:flex;flex-direction:column;width:fit-content;margin-bottom:44px}
.rule{width:100%;height:10px;display:flex;margin-top:22px;border-radius:5px;overflow:hidden}
.rule i{flex:1}
.pair{display:flex;align-items:center;justify-content:center;gap:100px;width:100%}
.cell{display:flex;flex-direction:column;align-items:center}
.cell .k{font-size:62px;font-weight:700;letter-spacing:.02em;white-space:nowrap;line-height:1.1}
.cell .u{font-size:32px;font-weight:400;color:#9fb9cc;letter-spacing:.06em;margin-top:12px}
.cell .v{font-size:200px;font-weight:700;line-height:.92;letter-spacing:-.02em;margin-top:8px}
.cell.hi .v{color:#ffc247}
.arrow{font-size:88px;color:#9fb9cc;line-height:1;font-weight:400;padding-top:44px}`;

  return page(1280, `${sky}
<div class="strip"><i style="background:#d95926"></i><i style="background:#199e70"></i></div>
<div class="core">
  <div class="head">
    <div class="series"><span>${EYE.seriesName}</span><span class="gap"></span><span>${EYE.day}</span><span class="unit">日目</span></div>
    <div class="rule"><i style="background:#d95926"></i><i style="background:#199e70"></i></div>
  </div>
  <div class="pair">
    <div class="cell"><span class="k">${EYE.a.label}</span><span class="u">${EYE.a.unit}</span><span class="v">${EYE.a.value}</span></div>
    <div class="arrow">→</div>
    <div class="cell hi"><span class="k">${EYE.b.label}</span><span class="u">${EYE.b.unit}</span><span class="v">${EYE.b.value}</span></div>
  </div>
</div>`, css);
}

/* ---------- 図版ページ index.html（アーティファクト「SNS実験の図版」） ---------- */
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const pd = (v) => v == null ? '' : v === 'new' ? '（NEW）' : `（前回差${dd(v)}）`;
const pdShort = (v) => v == null ? '' : v === 'new' ? '（NEW）' : `（${dd(v)}）`;
function buildIndex(sizes) {
  const ymd = REC_YMD;
  const use = (D.page && D.page.use) || {};
  const baseNote = BASE_LABEL ? `・前回差は${BASE_LABEL}の図（前回の記事）との差` : '';
  const td = SNS.total.d || {}, nd = NOTE.total.d || {};
  const secs = [];
  if (CLICKS) secs.push({
    file: 'eyecatch.png', name: `見出し画像_${ymd}.png`, h2: '見出し画像', spec: '1280 × 670', w: 2560, h: 1340,
    alt: `見出し画像。夜空の幾何学模様の背景に、${EYE.seriesName} ${DAY}日目。5つのSNSの表示・再生${EYE.a.value}から、noteへのクリック${EYE.b.value}へ。`,
    use: 'note投稿画面の「見出し画像を追加」から。SNSにシェアされたときの表紙にもなる。' + (use.eyecatch ? ' ' + use.eyecatch : ''),
  });
  secs.push({
    file: 'sns.png', name: `5つのSNS集計データ_${ymd}.png`, h2: '5つのSNS集計データ', spec: `1080 × ${sizes.sns}`, w: 2160, h: sizes.sns * 2,
    alt: `5つのSNS集計データ。合計の表示・再生${n(SNS.total.views)}${pd(td.views)}、いいね${n(SNS.total.likes)}${pdShort(td.likes)}、フォロワー${n(SNS.total.followers)}${pdShort(td.followers)}。SNSごとの内訳：` +
      SNS.media.map(m => `${m.name} ${n(m.views)}${pdShort(m.d && m.d.views)}`).join('、') + (B ? '。各数字の右に前回差。' : '。'),
    use: '本文の冒頭に。説明より先に数字を置く。' + (BASE_SHORT ? `前回差は${BASE_SHORT}の図（前回の記事）との差。` : '') + (use.sns ? ' ' + use.sns : ''),
  });
  if (CLICKS) secs.push({
    file: 'clicks.png', name: `SNSからnoteへのクリック数_${ymd}.png`, h2: 'SNSからnoteへのクリック数', spec: `1080 × ${sizes.clicks}`, w: 2160, h: sizes.clicks * 2,
    alt: `SNSからnoteへのクリック数。合計${n(CLICKS.total)}${pd(CLICKS.d)}。内訳は` + CLICKS.routes.map(r => `${r.name}${n(r.clicks)}${pdShort(r.d)}${r.pre ? '、' + r.pre : ''}`).join('、') +
      '。SNS別：' + CLICKS.media.map(m => `${m.name} ${n(m.clicks)}${pdShort(m.d)}`).join('、') + '。',
    use: '「どのSNSから来たか」の節に。人数ではなくクリック数。' + (use.clicks ? ' ' + use.clicks : ''),
  });
  secs.push({
    file: 'note.png', name: `noteの集計データ_${ymd}.png`, h2: 'noteの集計データ', spec: `1080 × ${sizes.note}`, w: 2160, h: sizes.note * 2,
    alt: `noteの集計データ。インプレッション${n(NOTE.total.imp)}${pd(nd.imp)}、ページビュー${n(NOTE.total.pv)}${pdShort(nd.pv)}、記事${n(NOTE.total.posts)}本${pdShort(nd.posts)}、スキ${n(NOTE.total.likes)}${pdShort(nd.likes)}、フォロワー${n(NOTE.total.followers)}${pdShort(nd.followers)}。記事ごとの内訳（` +
      NOTE.media.map(m => m.name).join('、') + `）` + (B ? '、各数字の右に前回差。' : '。') + NOTE.media.filter(m => m.d && m.d.imp === 'new').map(m => `${m.name}は前回の図に無いのでNEW。`).join(''),
    use: '「note側では何が起きていたか」の節に。' + (use.note ? ' ' + use.note : ''),
  });

  const sections = secs.map(s => `
    <section class="fig" data-file="${s.file}" data-name="${esc(s.name)}">
      <div class="fig-head"><h2>${esc(s.h2)}</h2><span class="spec">${esc(s.spec)}</span></div>
      <img src="${s.file}" alt="${esc(s.alt)}" width="${s.w}" height="${s.h}">
      <p class="use">${esc(s.use)}</p>
      <div class="row"><button type="button" hidden>PNGを保存</button><span class="msg">画像を長押し（PCは右クリック）で保存できるよ。</span></div>
    </section>`).join('\n');

  const missing = CLICKS ? '' : `<p class="stamp">今回は00Minが読めなかったため、「SNSからnoteへのクリック数」と見出し画像は作っていない。</p>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>SNS実験の図版</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<style>
:root{
  --ground:#f2f1ef; --surface:#ffffff; --ink:#111110; --muted:#7e7d78; --line:#e2e1dc;
  --orange:#d95926; --green:#199e70; --btn-fg:#ffffff; --btn-bg:#0f2436; --btn-bg-hover:#1c3b55; --frame:#dedcd6;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#111110; --surface:#1a1a19; --ink:#f4f3f0; --muted:#8f8e88; --line:#2e2e2b;
    --btn-fg:#111110; --btn-bg:#e8e6e0; --btn-bg-hover:#ffffff; --frame:#33332f;
  }
}
:root[data-theme="dark"]{
  --ground:#111110; --surface:#1a1a19; --ink:#f4f3f0; --muted:#8f8e88; --line:#2e2e2b;
  --btn-fg:#111110; --btn-bg:#e8e6e0; --btn-bg-hover:#ffffff; --frame:#33332f;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif;font-feature-settings:"palt" 1;line-height:1.7}
.page{max-width:680px;margin:0 auto;padding:0 20px;padding-block:0 72px}
.topbar{display:flex;height:6px;margin:0 -20px 40px}
.topbar i{flex:1}
.eyebrow{font-family:"Archivo","Zen Kaku Gothic New",sans-serif;font-size:.8125rem;font-weight:500;letter-spacing:.14em;color:var(--muted);margin:0 0 6px}
h1{font-size:clamp(1.6rem,5vw,2.15rem);font-weight:700;letter-spacing:.01em;margin:0;text-wrap:balance;line-height:1.25}
.stamp{font-family:"Archivo","Zen Kaku Gothic New",sans-serif;font-variant-numeric:tabular-nums;font-size:.9375rem;color:var(--muted);margin:10px 0 0}
.stamp b{color:var(--ink);font-weight:600}
.figs{display:flex;flex-direction:column;gap:44px;margin-top:40px}
.fig{display:flex;flex-direction:column;gap:14px}
.fig-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.fig-head h2{font-size:1.0625rem;font-weight:700;margin:0;letter-spacing:.01em}
.fig-head .spec{font-family:"Archivo","Zen Kaku Gothic New",sans-serif;font-variant-numeric:tabular-nums;font-size:.8125rem;color:var(--muted)}
.fig img{display:block;width:100%;max-width:100%;height:auto;border:1px solid var(--frame);border-radius:12px}
.fig .use{font-size:.875rem;color:var(--muted);margin:0}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px}
button{font:inherit;font-weight:700;font-size:.875rem;color:var(--btn-fg);background:var(--btn-bg);border:0;border-radius:10px;padding:10px 20px;cursor:pointer;transition:background .15s ease}
button:hover{background:var(--btn-bg-hover)}
button:disabled{opacity:.5;cursor:default}
button:focus-visible{outline:2px solid var(--orange);outline-offset:3px}
.msg{font-size:.8125rem;color:var(--muted)}
.notes{margin-top:48px;padding:22px 24px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.notes h2{font-size:.8125rem;font-weight:600;letter-spacing:.12em;color:var(--muted);margin:0 0 12px;font-family:"Archivo","Zen Kaku Gothic New",sans-serif}
.notes dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:8px 20px;font-size:.9375rem}
.notes dt{color:var(--muted);white-space:nowrap}
.notes dd{margin:0}
.notes code{font-family:"Archivo",ui-monospace,monospace;font-size:.875em;background:var(--ground);padding:2px 7px;border-radius:5px}
@media (max-width:430px){.notes dl{grid-template-columns:1fr;gap:2px}.notes dd{margin-bottom:10px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div class="page">
  <div class="topbar"><i style="background:#d95926"></i><i style="background:#199e70"></i></div>
  <p class="eyebrow">生成AI横並び検証室</p>
  <h1>SNS実験の図版</h1>
  <p class="stamp">集計時点 <b>${REC_LABEL}</b>（${DAY}日目）${esc(baseNote)}</p>
  ${missing}
  <div class="figs">
${sections}
  </div>
  <div class="notes">
    <h2>MEMO</h2>
    <dl>
      <dt>更新</dt><dd>集計エージェント（または Claude に「図版出して」）が、その時点の数字で作り直してこのページを差し替える。URLは変わらない。</dd>
      <dt>前回差</dt><dd>「前回の記事の図」との差。数字の右に小さく置く。0は「0」、減った分は「−」。前回の図に無かった行は「NEW」。0は薄いグレーで、動いた数字だけが目に入るようにしてある。</dd>
      <dt>数え方</dt><dd>クリック数は短縮リンク（00Min）とハブページ（GA4）のnoteへのクリックの合計。同じ人が複数回押した分も含むので、人数ではない。noteのインプレッションとページビューはnoteのダッシュボード（過去28日間）の値。</dd>
      <dt>日数</dt><dd>「N日目」は投稿を始めた9/6からの経過日数。9/6が0日目。</dd>
      <dt>元スクリプト</dt><dd><code>tools/keisoku-agent/figures/build.js</code>（ハブのリポジトリ）</dd>
    </dl>
  </div>
</div>
<script>
(function () {
  var figs = [].slice.call(document.querySelectorAll('.fig'));
  function fromImage(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error('encode')); }, 'image/png'); });
  }
  function getBlob(fig) {
    return fetch(fig.dataset.file).then(function (r) { if (!r.ok) throw new Error('http'); return r.blob(); })
      .catch(function () { return fromImage(fig.querySelector('img')); });
  }
  if (!(window.claude && window.claude.use)) return;
  window.claude.use('downloads').then(function (downloads) {
    if (!downloads) return;
    figs.forEach(function (fig) {
      var btn = fig.querySelector('button'); var msg = fig.querySelector('.msg');
      msg.textContent = ''; btn.hidden = false;
      btn.addEventListener('click', function () {
        btn.disabled = true; msg.textContent = '準備中…';
        getBlob(fig).then(function (blob) { return downloads.save({ filename: fig.dataset.name, data: blob }); })
          .then(function () { msg.textContent = '保存したよ。'; })
          .catch(function (err) {
            var code = err && err.code;
            if (code === 'declined') msg.textContent = '';
            else if (code === 'rate_limited') msg.textContent = '少し待ってからもう一度押してね。';
            else { msg.textContent = '保存できなかった。画像を長押し（PCは右クリック）で保存してね。'; btn.hidden = true; }
          }).then(function () { btn.disabled = false; });
      });
    });
  });
})();
</script>
</body>
</html>
`;
}

/* ---------- 書き出し ---------- */
fs.mkdirSync(OUT, { recursive: true });
const JOBS = [
  { name: 'sns',      html: figSns,      width: 1080, full: true  },
  CLICKS && { name: 'clicks',   html: figClicks,   width: 1080, full: true  },
  { name: 'note',     html: figNote,     width: 1080, full: true  },
  CLICKS && { name: 'eyecatch', html: figEyecatch, width: 1280, full: false, height: 670 },
].filter(Boolean);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const sizes = {};
  for (const j of JOBS) {
    const p = await b.newPage({ viewport: { width: j.width, height: j.height || 1000 }, deviceScaleFactor: 2 });
    await p.setContent(j.html(), { waitUntil: 'load' });
    await p.waitForTimeout(250);
    const out = `${OUT}/${j.name}.png`;
    await p.screenshot({ path: out, fullPage: j.full });
    const h = await p.evaluate(() => document.body.scrollHeight);
    sizes[j.name] = j.full ? h : j.height;
    console.log(`${j.name}: ${j.width} x ${sizes[j.name]} -> ${out}`);
    await p.close();
  }
  await b.close();
  fs.writeFileSync(`${OUT}/index.html`, buildIndex(sizes));
  console.log(`index.html -> ${OUT}/index.html`);
  // 図に使った数字（前回差込み）も残す。DBの figures/<REC> にはこのファイルではなく data.json を入れる
  fs.writeFileSync(`${OUT}/resolved.json`, JSON.stringify({ rec: D.rec, day: DAY, baseline: BASE_LABEL, sns: SNS, clicks: CLICKS, note: NOTE }, null, 2));
  if (!CLICKS) console.log('clicks.png と eyecatch.png は作っていない（data.clicks が null）');
})();
