#!/usr/bin/env node
// ハブ（index.html）の検証。390×844 のスマホ幅で、通常／モーション低減／JS無効 の3条件。
//   node check.js index.html [出力ディレクトリ]
// 通れば exit 0 と JSON。落ちれば exit 1 と JSON（failures に理由）。
// 見ているもの（2026-09-20〜26 の手順そのまま）:
//   記事の並び／NEW は一覧・紹介の各1／data-latest="true" は1／
//   計測リンク＝記事数×2＋4 で全部 note.com／ページ内アンカー0／
//   スクロール後に opacity≠1 の要素ゼロ／pageerror ゼロ／
//   一覧の各行で見出しが「記事を読む」に食い込んでいない（scrollWidth ≤ width）／
//   カードのボタンがファーストビュー（844px）に入っている
// 依存: playwright（npm i playwright）。cloud は同梱 Chromium を executablePath で指定。
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file://' + path.resolve(process.argv[2] || 'index.html');
const OUT = process.argv[3] || 'hub-agent-shots';
fs.mkdirSync(OUT, { recursive: true });
const EXEC = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

async function run(name, opts) {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference', javaScriptEnabled: !opts.nojs,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const ctaBox = await page.evaluate(() => { const r = document.querySelector('.spot-cta').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; });
  await page.screenshot({ path: `${OUT}/${name}-top.png` });
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 500) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(200); }
  await page.waitForTimeout(3000); // rise 1400ms ＋ 行差 140ms×5 が最後の記事で終わるまで待つ
  const info = await page.evaluate(() => {
    const q = s => [...document.querySelectorAll(s)];
    const ev = q('[data-ev]');
    return {
      order: q('.toc-title').map(e => e.textContent),
      articles: q('.article').map(a => a.id + ':' + a.dataset.latest),
      latest: q('.article[data-latest="true"]').map(a => a.id),
      newIn: q('.new').map(e => e.closest('.article')?.id || 'toc:' + e.closest('.toc-row')?.querySelector('.toc-number').textContent),
      ev: ev.length,
      noteLinks: ev.filter(a => /^https:\/\/note\.com\//.test(a.href)).length,
      anchors: q('a[href^="#"]').length,
      articleCount: q('.article').length,
      notOpaque: q('[data-reveal],[data-reveal] *,.article,.toc-row,.spot').filter(el => getComputedStyle(el).opacity !== '1').map(e => e.tagName + '.' + e.className).slice(0, 10),
      tocOverflow: q('.toc-link').map(a => ({ t: a.querySelector('.toc-title').textContent, w: Math.round(a.querySelector('.toc-heading').getBoundingClientRect().width), sw: a.querySelector('.toc-heading').scrollWidth,
        gap: Math.round(a.querySelector('.toc-read').getBoundingClientRect().left - a.querySelector('.toc-heading').getBoundingClientRect().right) })).filter(o => o.sw > o.w + 1 || o.gap < 0),
      spot: document.querySelector('.spot-number')?.textContent + ' / ' + document.querySelector('.spot .spot-title')?.textContent,
      spotEv: document.querySelector('.spot-cta')?.dataset.ev,
      admin: !!window.HUB_ADMIN,
    };
  });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
  await (await page.$('.contents')).screenshot({ path: `${OUT}/${name}-toc.png` });
  await browser.close();
  const failures = [];
  if (errors.length) failures.push('pageerror: ' + errors.join(' | '));
  if (info.ev !== info.articleCount * 2 + 4) failures.push(`計測リンク ${info.ev} ≠ 記事${info.articleCount}×2＋4`);
  if (info.noteLinks !== info.ev) failures.push(`note.com 以外の計測リンクがある (${info.noteLinks}/${info.ev})`);
  if (info.anchors) failures.push(`ページ内アンカー ${info.anchors}`);
  if (info.latest.length !== 1) failures.push(`data-latest=true が ${info.latest.length}`);
  if (info.newIn.length !== 2) failures.push(`NEW が ${info.newIn.length} 個 (${info.newIn})`);
  if (info.notOpaque.length) failures.push('透明のまま: ' + info.notOpaque.join(','));
  if (info.tocOverflow.length) failures.push('一覧で食い込み: ' + JSON.stringify(info.tocOverflow));
  if (ctaBox[1] > 844 || ctaBox[0] < 0) failures.push(`カードのボタンがファーストビュー外 ${ctaBox}`);
  return { name, ctaBox, ...info, failures };
}

(async () => {
  const results = [];
  for (const [name, opts] of [['normal', {}], ['reduced', { reduced: true }], ['nojs', { nojs: true }]]) results.push(await run(name, opts));
  const failures = results.flatMap(r => r.failures.map(f => `${r.name}: ${f}`));
  console.log(JSON.stringify({ ok: failures.length === 0, failures, spot: results[0].spot, spotEv: results[0].spotEv, order: results[0].order, articles: results[0].articles, ev: results[0].ev, ctaBox: results[0].ctaBox, shots: OUT }, null, 1));
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ ok: false, failures: [String(e)] })); process.exit(1); });
