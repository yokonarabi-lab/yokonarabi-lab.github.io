#!/usr/bin/env python3
"""ハブ（index.html）に検証記事を1本追加する。

  python3 add_article.py --number 09 --title "..." --lead "..." --desc "..." \
      --url https://note.com/yokonarabi_lab/n/xxxx [--in index.html] [--out index.html] [--tall auto|yes|no]

やること（2026-09-20 以降の手順そのまま）:
  1. 最上部のカード（.spot）を新しい記事に差し替える
  2. 一覧（「検証記事一覧」の ol.toc）の先頭に行を足す。題が長ければ .toc-tall（2段組み）
  3. 紹介（.articles）の先頭に記事ブロックを足す
  4. 旧最新から NEW と data-latest="true" を外す（レポート行にあっても外す）
  5. note_click_NN をカード・一覧・紹介の3か所に付ける
触らないもの: 管理者モード（HUB_ADMIN / hub_admin）、data-reveal の付け方、既存の記事。
置換は全部 count==1 を確認してから行う。失敗したら何も書かずに終了コード 1。
"""
import argparse, hashlib, json, re, sys, unicodedata

ap = argparse.ArgumentParser()
ap.add_argument('--number', required=True, help='検証番号 2桁（例 09）')
ap.add_argument('--title', required=True)
ap.add_argument('--lead', required=True)
ap.add_argument('--desc', required=True)
ap.add_argument('--url', required=True)
ap.add_argument('--in', dest='inp', default='index.html')
ap.add_argument('--out', dest='out', default='index.html')
ap.add_argument('--tall', default='auto', choices=['auto', 'yes', 'no'])
a = ap.parse_args()

NN = a.number.zfill(2)
assert re.fullmatch(r'\d{2}', NN), 'number は2桁'
assert re.fullmatch(r'https://note\.com/yokonarabi_lab/n/n[0-9a-f]{12}', a.url), 'url の形が違う: ' + a.url
TITLE, LEAD, DESC, URL = a.title.strip(), a.lead.strip(), a.desc.strip(), a.url
for k, v in (('title', TITLE), ('lead', LEAD), ('desc', DESC)):
    assert v and '"' not in v and '<' not in v, f'{k} に " や < を入れない'

src = open(a.inp, encoding='utf-8').read()
h = src
assert URL not in h, '同じURLがもうハブにある'
assert f'note_click_{NN}' not in h, f'note_click_{NN} がもうある'

def rep(old, new, label):
    global h
    c = h.count(old)
    assert c == 1, f'{label}: 置換対象が {c} 件（1件のはず）'
    h = h.replace(old, new)

# 題の見た目の長さ（全角1・半角0.5）。スマホ幅で 9 を超えると1段に入らない（2026-09-26 実測）
def width(s):
    return sum(0.5 if unicodedata.east_asian_width(c) in 'NaH' else 1 for c in s)
tall = {'yes': True, 'no': False, 'auto': width(TITLE) > 9}[a.tall]
if tall:
    assert '.toc-tall .toc-link' in h, '.toc-tall のCSSが無い（2026-09-26 の版より古い）'

# 半角スペース区切りの題は、後半を折り返さない（例: 生成AI おすすめベスト10）
title_html = TITLE
if ' ' in TITLE:
    head, tail = TITLE.rsplit(' ', 1)
    title_html = f'{head} <span class="nowrap">{tail}</span>'

# 1. カード差し替え
i = h.find('<div class="spot">')
j = h.find('</div><h1>', i)
assert i > 0 and j > i, 'カード（.spot）が見つからない'
j += len('</div>')
old_spot = h[i:j]
assert old_spot.count('spot-cta') == 1
new_spot = (
    '<div class="spot"><div class="spot-head"><span class="spot-chip">最新の記事はこちら</span>'
    f'<span class="spot-number">検証 {NN}</span></div>'
    f'<p class="spot-title">{title_html}</p>'
    f'<p class="spot-lead">{LEAD}</p>'
    f'<a data-ev="note_click_{NN}" data-article="kensho{NN}" data-position="spotlight" data-label="最新カード：検証{NN} {TITLE}" '
    f'class="spot-cta" href="{URL}" target="_blank" rel="noopener" aria-label="検証{NN} {TITLE}の記事を読む">'
    '記事を読む <span class="arrow" aria-hidden="true">↗</span></a></div>'
)
h = h[:i] + new_spot + h[j:]

# 4. 旧最新から NEW と data-latest を外す（どこにあっても）
NEW = '<span class="new" aria-label="最新の記事">NEW</span>'
n_new = h.count(NEW)
assert 1 <= n_new <= 2, f'NEW が {n_new} 個（1〜2のはず）'
h = h.replace(NEW, '')
n_latest = h.count(' data-latest="true">')
assert n_latest == 1, f'data-latest="true" が {n_latest} 個'
h = h.replace(' data-latest="true">', ' data-latest="false">')

# 2. 一覧の先頭に行を足す
li_cls = 'toc-row toc-tall' if tall else 'toc-row'
row = (
    f'<li class="{li_cls}"><a data-ev="note_click_{NN}" data-article="kensho{NN}" data-position="toc" data-label="一覧：検証{NN} {TITLE}" '
    f'class="toc-link" href="{URL}" target="_blank" rel="noopener" aria-label="検証{NN} {TITLE}の記事を読む">'
    f'<span class="toc-heading"><span class="toc-number">検証 {NN}</span><span class="toc-title">{TITLE}</span>{NEW}</span>'
    '<span class="toc-read">記事を読む <span aria-hidden="true">↗</span></span></a></li>'
)
anchor = 'id="contents-title">検証記事一覧</h2><ol class="toc">'
rep(anchor, anchor + row, '一覧の先頭')

# 3. 紹介の先頭に記事を足す
art = (
    '<article data-reveal data-reveal-lines=".article-meta,h2,.lead,.desc,.article-link" class="article" '
    f'id="article-{NN}" aria-labelledby="title-{NN}" data-latest="true"><div>'
    f'<div class="article-meta">検証 {NN}{NEW}</div>'
    f'<h2 id="title-{NN}">{TITLE}</h2><p class="lead">{LEAD}</p></div><div>'
    f'<p class="desc">{DESC}</p>'
    f'<a data-ev="note_click_{NN}" data-article="kensho{NN}" data-position="article" data-label="紹介：検証{NN} {TITLE}" '
    f'class="article-link" href="{URL}" target="_blank" rel="noopener">検証記事を読む <span class="arrow" aria-hidden="true">↗</span></a>'
    '</div></article>'
)
anchor = 'id="articles-title">検証記事紹介</h2>'
rep(anchor, anchor + art, '紹介の先頭')

# 検査
assert h.count(' data-latest="true">') == 1
assert h.count(NEW) == 2, 'NEW は一覧と紹介の2か所'
assert h.count(f'note_click_{NN}') == 3
assert h.count('data-ev=') == src.count('data-ev=') + 2, 'data-ev は +2（カードは差し替え）'
for k in ('HUB_ADMIN', 'hub_admin', 'data-reveal'):
    assert h.count(k) >= src.count(k), f'{k} が減った'
articles = h.count('<article ')
assert h.count('data-ev=') == articles * 2 + 4, f'計測リンク {h.count("data-ev=")} ≠ 記事{articles}×2＋4'

open(a.out, 'w', encoding='utf-8').write(h)
b = h.encode('utf-8')
print(json.dumps({
    'ok': True, 'number': NN, 'tall': tall, 'title_width': width(TITLE),
    'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(),
    'articles': articles, 'data_ev': h.count('data-ev='),
    'note_clicks': sorted(set(re.findall(r'note_click_\w+', h))),
}, ensure_ascii=False))
