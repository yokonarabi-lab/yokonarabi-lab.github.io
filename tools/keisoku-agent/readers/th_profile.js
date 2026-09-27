// Threads のプロフィールでフォロワー数を読む（1回）。投稿の数字は th_insights.js
// ページ: https://www.threads.com/@yokonarabi_lab
await new Promise(r => setTimeout(r, 4000));
(() => { const t = document.body.innerText.replace(/,/g, ''); return { plat: 'th', read_at: new Date().toISOString(),
  fw: +((t.match(/フォロワー\s*(\d+)\s*人/) || [])[1] ?? NaN), recent_views: +((t.match(/最近の閲覧数\s*(\d+)\s*回/) || [])[1] ?? NaN) }; })();
