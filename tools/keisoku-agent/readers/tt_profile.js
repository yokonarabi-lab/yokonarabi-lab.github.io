// TikTok の公開プロフィールでフォロワー・フォロー中・いいね合計を読む（1回）
// ページ: https://www.tiktok.com/@yokonarabi_lab
// 返り値: { plat:'tt', fw, fo, likes_total, photo_ids:[...] }  photo_ids は画像投稿のID（kind の判定に使う）
await new Promise(r => setTimeout(r, 4000));
(() => {
  const n = (s) => { if (!s) return null; s = s.trim(); const m = s.match(/([\d.]+)\s*([KMk万]?)/); if (!m) return null; const k = { K: 1e3, k: 1e3, M: 1e6, '万': 1e4 }[m[2]] || 1; return Math.round(parseFloat(m[1]) * k); };
  const q = (sel) => document.querySelector(sel)?.innerText;
  const photo_ids = [...new Set([...document.querySelectorAll('a[href*="/photo/"]')].map(a => (a.href.match(/photo\/(\d+)/) || [])[1]).filter(Boolean))];
  return { plat: 'tt', read_at: new Date().toISOString(), fw: n(q('[data-e2e="followers-count"]')), fo: n(q('[data-e2e="following-count"]')), likes_total: n(q('[data-e2e="likes-count"]')), photo_ids };
})();
