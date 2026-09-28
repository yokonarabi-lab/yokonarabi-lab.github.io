// Instagram のプロフィールで全投稿の いいね・コメント・公開時刻・種類・枚数、フォロワーを読む（1回）
// ページ: https://www.instagram.com/yokonarabi_lab/ （先に resize_window で 1280×1000。狭いとモバイル版になる）
// 画面の裏（Reactのprops）に投稿データがまるごと入っているので、そこを読む。再生数（ビュー）はここに無い → ig_insights.js
// 最初は12件しか読み込まれない。続きは「本物のスクロール」でしか来ない（JSの scrollTo では来ない。2026-09-28確認）
//   → 実行の前に computer の screenshot → scroll（上に3・下に10）→ 4秒待つ、を n が投稿数に届くまでくり返す（sources.md #7）
// 返り値: { plat:'ig', fw, fo, total_on_header, n, posts:[{key(shortcode), pub, product_type, carousel_count, likes, comments, caption}] }
//   n と total_on_header が同じなら全件。少なければスクロールをもう一度やってから再実行する
await new Promise(r => setTimeout(r, 3000));
(() => {
  // 一番長い media 配列を持つ props を探す（リンクによっては最初の12件分しか持っていない）
  let media = null;
  document.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]').forEach(a => {
    let f = a[Object.keys(a).find(k => k.startsWith('__reactFiber'))];
    for (let i = 0; i < 40 && f; i++) { const p = f.memoizedProps || {}; if (Array.isArray(p.media) && p.media[0] && 'like_count' in p.media[0]) { if (!media || p.media.length > media.length) media = p.media; break; } f = f.return; }
  });
  const head = (document.querySelector('header')?.innerText || '').replace(/,/g, '');
  const posts = (media || []).map(m => ({
    key: m.code, pub: new Date(m.taken_at * 1000).toISOString(), product_type: m.product_type,
    carousel_count: m.carousel_media_count ?? null, likes: m.like_count ?? null, comments: m.comment_count ?? null,
    caption: ((m.caption && m.caption.text) || '').replace(/\n/g, ' ').slice(0, 60),
  }));
  return { plat: 'ig', read_at: new Date().toISOString(), found: !!media, total_on_header: +((head.match(/投稿\s*(\d+)\s*件/) || [])[1] ?? NaN),
           fw: +((head.match(/フォロワー\s*(\d+)/) || [])[1] ?? NaN), fo: +((head.match(/フォロー中\s*(\d+)/) || [])[1] ?? NaN), n: posts.length, posts };
})();
