// X のプロフィールで全ポストの表示回数・いいね・フォロワーを読む（1回）
// ページ: https://x.com/yokonarabi_lab （先に resize_window で 1280×9999 にしておく。縦が短いとタイムラインが5件ほどで止まる）
// 返り値: { plat:'x', fw, fo, tweets:[{key, time, views, likes, reposts, replies_n, text}] }
//   自分のスレッドの返信も tweets に混ざる。1通目だけを数える判定は assemble.py がする（同じ人が120秒以内に続けて出したものを返信とみなす）
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(6000);
const res = {};
const num = (lab, re) => { const m = lab.match(re); return m ? +m[1].replace(/,/g, '') : 0; };
const grab = () => document.querySelectorAll('article').forEach(a => {
  const time = a.querySelector('time'); const link = time?.closest('a')?.href || '';
  const key = (link.match(/status\/(\d+)/) || [])[1]; if (!key) return;
  if (!/\/yokonarabi_lab\/status\//i.test(link)) return;                         // 他人のポスト（リポスト等）は除く
  const lab = [...a.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).find(l => /件の表示|ポストアナリティクス/.test(l)) || '';
  res[key] = { key, time: time.getAttribute('datetime'), views: /件の表示/.test(lab) ? num(lab, /([\d,]+)\s*件の表示/) : null,
               likes: num(lab, /([\d,]+)\s*件のいいね/), reposts: num(lab, /([\d,]+)\s*件のリポスト/), replies_n: num(lab, /([\d,]+)\s*件の返信/),
               text: (a.querySelector('[data-testid="tweetText"]')?.innerText || '').replace(/\n/g, ' ').slice(0, 50) };
});
grab();
for (let i = 0; i < 6; i++) { window.scrollTo(0, document.body.scrollHeight); await sleep(2500); grab(); }
const hdr = (sel) => { const a = [...document.querySelectorAll('a')].find(x => (x.getAttribute('href') || '').endsWith(sel)); const m = (a?.innerText || '').replace(/,/g, '').match(/([\d.]+)\s*(万)?/); return m ? Math.round(parseFloat(m[1]) * (m[2] ? 1e4 : 1)) : null; };
({ plat: 'x', read_at: new Date().toISOString(), innerHeight, fw: hdr('/verified_followers') ?? hdr('/followers'), fo: hdr('/following'), n: Object.keys(res).length, tweets: Object.values(res) });
