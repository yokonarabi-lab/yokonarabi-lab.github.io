// Instagram のコンテンツインサイト一覧で全投稿のビュー（再生数）を読む（1回）
// ページ: https://www.instagram.com/accounts/insights/content/?media_type=all&metric=views&sort_by=highest&timeframe=90&view_type=card
//   先に resize_window で 1280×8000。timeframe=90 は「過去90日間に公開した投稿」。9/6開始なので 12/5 までは全部入る
// 一覧の数字は画面にも出るが、どの投稿かが画面からは分からない。並び順を「新しい順」に切り替えると裏で読み直しが走るので、
// その通信（XHR）を横取りして shortcode とビューの組で取る。投稿ページのインサイトとの差は±数（読んだ時刻の差）
// 返り値: { plat:'ig', views:{shortcode: ビュー}, n }   ストーリーズは除く
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(4000);
window.__ig = [];
const oo = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__u = u; return oo.call(this, m, u, ...r); };
const os = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.send = function (b) { this.addEventListener('load', () => { try { if (/graphql/.test(String(this.__u))) window.__ig.push(this.responseText); } catch (e) {} }); return os.apply(this, arguments); };
const clickText = (t) => { const l = [...document.querySelectorAll('*')].find(e => e.children.length == 0 && e.textContent.trim() == t && e.getBoundingClientRect().width > 0); let e = l; for (let i = 0; i < 3 && e; i++) { e.click(); e = e.parentElement; } return !!l; };
const ok1 = clickText('高い順'); await sleep(1200);
const ok2 = clickText('新しい順'); await sleep(6000);
const views = {}; let stories = 0;
for (const t of window.__ig) { try { const m = JSON.parse(t).data?.user?.business_manager?.medias; if (!m) continue;
  m.edges.forEach(e => { const n = e.node; if (n.instagram_media_product_type === 'STORY') { stories++; return; } const r = n.inline_insights_node?.metric_single_value_query?.results; views[n.shortcode] = (r && r[0]) ? r[0].total_value : null; }); } catch (e) {} }
({ plat: 'ig', read_at: new Date().toISOString(), clicked: ok1 && ok2, captured: window.__ig.length, stories, n: Object.keys(views).length, views });
