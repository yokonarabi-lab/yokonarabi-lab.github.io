// TikTok Studio のコンテンツ一覧を全件読む（1回）
// ページ: https://www.tiktok.com/tiktokstudio/content （幅は 1280×900 でよい）
// 一覧は8行ずつしかDOMに出ないので、内側のスクロール要素を少しずつ送りながら集める。
// 返り値: { plat:'tt', total_on_page, n, posts:[{key, date, dur, views, likes, comments, title}] }  n と total_on_page が一致すれば全件
// フォロワー等は tt_profile.js（fetch だとTikTokの確認ページが返るので、プロフィールを開いて読む）
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(5000);
const rows = {};
const collect = () => {
  // 1行 = 日付の行（例「9月24日 午後6:51」）＋公開範囲＋視聴・いいね・コメント
  const lines = document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean);
  for (let i = 1; i < lines.length - 4; i++) {
    if (/^\d+月\d+日 午[前後]\d+:\d+$/.test(lines[i]) && /^(誰でも|フォロワー|友達|自分のみ|非公開)/.test(lines[i + 1])) {
      const n = s => +String(s).replace(/,/g, '');
      const dur = /^\d\d:\d\d$/.test(lines[i - 2]) ? lines[i - 2] : null;   // 動画は尺が出る。画像投稿は出ない
      rows[lines[i]] = { date: lines[i], dur, title: lines[i - 1].slice(0, 60), views: n(lines[i + 2]), likes: n(lines[i + 3]), comments: n(lines[i + 4]) };
    }
  }
  // 行とIDの対応（リンクがある行だけ。無い行は日付で台帳と突き合わせる）
  document.querySelectorAll('a[href*="/video/"],a[href*="/photo/"]').forEach(a => {
    const id = (a.href.match(/(video|photo)\/(\d+)/) || [])[2]; if (!id) return;
    let el = a; for (let k = 0; k < 12 && el; k++) { const d = (el.innerText || '').match(/\d+月\d+日 午[前後]\d+:\d+/); if (d) { if (rows[d[0]]) rows[d[0]].key = id; break; } el = el.parentElement; }
  });
};
collect();
const sc = [...document.querySelectorAll('div')].filter(d => d.scrollHeight > d.clientHeight + 20);
for (const s of sc) { for (let p = 0; p <= s.scrollHeight; p += 150) { s.scrollTop = p; s.dispatchEvent(new Event('scroll')); await sleep(400); collect(); } }
const total = (document.body.innerText.match(/(\d+)件の投稿/) || [])[1];
({ plat: 'tt', read_at: new Date().toISOString(), total_on_page: total ? +total : null, n: Object.keys(rows).length, posts: Object.values(rows) });
