// Threads のインサイト一覧で全投稿（1通目だけ）の再生数・いいね・返信・再投稿を読む（1回）
// ページ: https://www.threads.com/insights （先に resize_window で 1280×900）
// 一覧は最初10件だけ。続きは「本物のスクロール」でしか来ない（JSの scrollTop や WheelEvent では来ない。2026-09-28確認）
//   → 実行の前に computer の screenshot → 左の一覧の上で scroll 下に10 → 6秒待つ → 上に3 → 下に10 → 6秒、を
//     n が投稿数（台帳の Threads の本数）に届くまでくり返す。1回で10件ずつ増える（sources.md #9）
// 一覧は1通目だけが並ぶ（自分の返信は出ない）。数字は0だと表示されないので、アイコンの形でどの数字かを見分ける
// 返り値: { plat:'th', posts:{shortcode:{views, likes, replies, reposts, shares, text}}, n }  n が台帳より少なければ読み直す
await new Promise(r => setTimeout(r, 5000));
(() => {
  const ICON = { 'M16.5 2c': 'likes', 'M12 3a9 ': 'replies', 'M4.516 6': 'reposts', 'M7.247 1': 'shares' };
  const posts = {};
  document.querySelectorAll('a[href*="/insights/post/"]').forEach(a => {
    const code = (a.getAttribute('href').match(/post\/([^?/]+)/) || [])[1]; if (!code) return;
    const r = { likes: 0, replies: 0, reposts: 0, shares: 0 };
    a.querySelectorAll('svg').forEach(s => {
      const k = ICON[(s.querySelector('path')?.getAttribute('d') || '').slice(0, 8)]; if (!k) return;
      let n = s, t = ''; for (let i = 0; i < 2 && n; i++) { n = n.parentElement; t = (n?.innerText || '').trim(); if (t) break; }
      if (/^\d[\d,]*$/.test(t)) r[k] = +t.replace(/,/g, '');
    });
    const m = (a.innerText || '').match(/([\d,]+)\s*\n?\s*再生数/); r.views = m ? +m[1].replace(/,/g, '') : null;
    r.text = (a.innerText || '').split('\n').filter(x => x.trim() && !/^[\d,]+$/.test(x.trim()) && x.trim() !== '再生数').join(' ').slice(0, 60);
    posts[code] = r;
  });
  return { plat: 'th', read_at: new Date().toISOString(), n: Object.keys(posts).length, posts };
})();
