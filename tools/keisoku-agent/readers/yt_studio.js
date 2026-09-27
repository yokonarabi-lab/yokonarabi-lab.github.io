// YouTube Studio のショート一覧を読む（1回）
// ページ: https://studio.youtube.com/channel/UC/videos/short （UC = 自分のチャンネルに自動で飛ぶ）
// 返り値: { plat:'yt', channel, n, posts:[{key, dur, title, views, comments, visibility, date}] }  いいね・公開時刻・登録者は yt_public.js
await new Promise(r => setTimeout(r, 4000));
(() => {
  const posts = [...document.querySelectorAll('ytcp-video-row')].map(r => {
    const key = ((r.querySelector('a[href*="/video/"]') || {}).href || '').match(/video\/([^/]+)/)?.[1] || null;
    const cell = (c) => (r.querySelector('.tablecell-' + c)?.innerText || '').replace(/\s+/g, ' ').trim();
    const num = (s) => { const m = s.replace(/,/g, '').match(/\d+/); return m ? +m[0] : null; };
    const dur = (cell('video').match(/^(\d+:\d\d)/) || [])[1] || null;
    return { key, dur, title: (r.querySelector('#video-title')?.innerText || '').trim(), views: num(cell('views')),
             comments: num(cell('comments')), visibility: cell('visibility'), date: cell('date') };
  }).filter(p => p.key);
  const channel = (location.pathname.match(/channel\/(UC[\w-]+)/) || [])[1] || null;
  return { plat: 'yt', read_at: new Date().toISOString(), channel, n: posts.length, posts };
})();
