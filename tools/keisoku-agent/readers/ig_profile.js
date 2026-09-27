// Instagram のプロフィールで全投稿の いいね・コメント・公開時刻・種類・枚数、フォロワーを読む（1回）
// ページ: https://www.instagram.com/yokonarabi_lab/ （先に resize_window で 1280×8000。狭いとモバイル版になる）
// 画面の裏（Reactのprops）に投稿データがまるごと入っているので、そこを読む。再生数（ビュー）はここに無い → ig_insights.js
// 返り値: { plat:'ig', fw, fo, posts:[{key(shortcode), pub, product_type, carousel_count, likes, comments, caption}] }
await new Promise(r => setTimeout(r, 5000));
(() => {
  const a = document.querySelector('a[href*="/p/"],a[href*="/reel/"]');
  let media = null;
  if (a) {
    let f = a[Object.keys(a).find(k => k.startsWith('__reactFiber'))];
    for (let i = 0; i < 40 && f && !media; i++) { const p = f.memoizedProps || {}; if (Array.isArray(p.media) && p.media[0] && 'like_count' in p.media[0]) media = p.media; f = f.return; }
  }
  const head = (document.querySelector('header')?.innerText || '').replace(/,/g, '');
  const posts = (media || []).map(m => ({
    key: m.code, pub: new Date(m.taken_at * 1000).toISOString(), product_type: m.product_type,
    carousel_count: m.carousel_media_count ?? null, likes: m.like_count ?? null, comments: m.comment_count ?? null,
    caption: ((m.caption && m.caption.text) || '').replace(/\n/g, ' ').slice(0, 60),
  }));
  return { plat: 'ig', read_at: new Date().toISOString(), found: !!media, total_on_header: +((head.match(/投稿\s*(\d+)\s*件/) || [])[1] ?? NaN),
           fw: +((head.match(/フォロワー\s*(\d+)/) || [])[1] ?? NaN), fo: +((head.match(/フォロー中\s*(\d+)/) || [])[1] ?? NaN), n: posts.length, posts };
})();
