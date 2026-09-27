// YouTube の各ショートの「いいね」と公開時刻、チャンネル登録者数を読む（1回）
// ページ: https://www.youtube.com/ （どのページでもよい。同じサイト内なので fetch で読める）
// 使い方: 下の IDS と CHANNEL を yt_studio.js の結果（posts[].key と channel）に書き換えてから実行
const IDS = ['VIDEO_ID_1', 'VIDEO_ID_2'];
const CHANNEL = 'UC...';
const out = {};
for (const id of IDS) {
  try {
    const h = await (await fetch('/shorts/' + id, { credentials: 'include' })).text();
    out[id] = {
      pub: (h.match(/"publishDate":"([^"]+)"/) || [])[1] || null,        // 例 2026-09-26T05:12:41-07:00
      likes: +((h.match(/"likeCount":"?(\d+)/) || [])[1] ?? NaN),
      views_public: +((h.match(/"viewCount":"(\d+)"/) || [])[1] ?? NaN),  // 公開ページの値（Studioより遅れる。参考）
    };
  } catch (e) { out[id] = { error: String(e) }; }
}
let subs = null;
try {
  const h = await (await fetch('/channel/' + CHANNEL, { credentials: 'include' })).text();
  const m = h.match(/チャンネル登録者数\s*([\d,.]+)\s*人/) || h.match(/"subscriberCountText":\{"simpleText":"[^"\d]*([\d,.]+)/);
  subs = m ? +m[1].replace(/,/g, '') : null;
} catch (e) {}
({ plat: 'yt', read_at: new Date().toISOString(), subs, videos: out });
