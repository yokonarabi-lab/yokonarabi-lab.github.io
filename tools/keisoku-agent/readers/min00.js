// 00Min の短縮リンク一覧で、各スラッグの累計クリックを読む（1回）
// ページ: https://00m.in/user/links （ログインは1時間もたない。ログイン画面なら login:false を返す → links は null）
await new Promise(r => setTimeout(r, 2000));
(() => {
  const t = document.body.innerText;
  if (/\/user\/login/.test(location.pathname) || /ログインしてアクセスください/.test(t)) return { plat: '00min', login: false, links: null };
  const links = {}; const re = /00m\.in\/(\w+)[^\n]*\n\s*([\d,]+)\s*クリック/g; let m;
  while ((m = re.exec(t))) links[m[1]] = +m[2].replace(/,/g, '');
  return { plat: '00min', read_at: new Date().toISOString(), login: true, total_on_page: +((t.match(/短縮URL一覧\s*（(\d+)件）/) || [])[1] ?? NaN), n: Object.keys(links).length, links };
})();
