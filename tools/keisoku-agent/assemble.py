#!/usr/bin/env python3
"""readers/*.js で読んだ結果から、DBに書く行・図版の data.json・報告・引き継ぎをまとめて作る。

  python3 tools/keisoku-agent/assemble.py --readings R --db DB --out OUT [--shots note_shots.json] [--rec YYYYMMDD-HHMM]

  R   : readers の返り値を1つずつ保存したフォルダ（yt_studio.json, yt_public.json, tt_studio.json, tt_profile.json,
        x_profile.json, ig_profile.json, ig_insights.json, th_insights.json, th_profile.json, ga4.json, note_api.json, min00.json）
        無いファイルはその媒体を「読めなかった」として null にする
  DB  : ArtifactData の list/get を out_dir で保存したフォルダ（posts/ articles/ shortlinks/ figures/<基準>.json meta/baseline.json、
        あれば snaps/（前回の rec の分）kotaro/ も）。1ファイル＝1行、ファイル名＝doc_id
  --shots : noteのスクショから書き起こした数字（README「noteのスクショ」の形）。無ければ imp・pv は null
  --rec   : 集計時点。省略時は readings の read_at の最大を10分単位に切り上げ（日本時間）

  OUT に作るもの：docs/*.json（1行1ファイル）、writes_01.json…（ArtifactData batch にそのまま渡す、1ファイル50件まで）、
  data.json・base.json（figures/build.js 用）、report.txt（Skyへの通知文）、handoff.md（引き継ぎ）、checks.txt（要確認の一覧）
  DBにはまだ何も書かない。書くのは writes_*.json を見てから（既存の行は上書きしない。set するのは新しい doc_id だけ）
"""
import argparse, datetime as dt, glob, json, math, os, re, sys

JST = dt.timezone(dt.timedelta(hours=9))
START = dt.date(2026, 9, 6)                      # N日目の起点（conventions.md）
PLATS = ['yt', 'tt', 'x', 'ig', 'th']
PLAT_NAME = {'yt': 'YouTube', 'tt': 'TikTok', 'x': 'X', 'ig': 'Instagram', 'th': 'Threads'}
SRC2PLAT = {'youtube': 'yt', 'tiktok': 'tt', 'x': 'x', 'instagram': 'ig', 'threads': 'th', 'not_set': 'none'}
# 台帳の Threads の URL が返信（2通目）を指している投稿 → 1通目の shortcode（2026-09-27 に判明）
TH_ALIASES = {'DdGw4nZGsBO': 'DdGw4PbGr2-', 'DdG9nf1Gvt7': 'DdG9nf4mmCb'}
SKY_GOOGLE_KNOWN = 1                              # `/`×google/organic のうち Sky 本人と分かっている分（9/17の1件）
X_THREAD_GAP = 120                                # X：これ以内に続けて出たポストは直前の1通目への返信とみなす（秒）
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

# ---------- 小道具 ----------
def load(path, default=None):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return default

def load_dir(d):
    out = {}
    for p in glob.glob(os.path.join(d, '*.json')):
        v = load(p)
        if isinstance(v, dict) and 'data' in v and 'id' in v and isinstance(v['data'], dict):
            v = v['data']
        out[os.path.basename(p)[:-5]] = v
    return out

def jst(t):
    """ISO文字列・epoch秒・datetime → JST の datetime"""
    if t is None:
        return None
    if isinstance(t, (int, float)):
        return dt.datetime.fromtimestamp(t, JST)
    if isinstance(t, dt.datetime):
        return t.astimezone(JST)
    s = str(t).replace('Z', '+00:00')
    d = dt.datetime.fromisoformat(s)
    if d.tzinfo is None:
        d = d.replace(tzinfo=JST)
    return d.astimezone(JST)

def iso(d):
    return d.replace(microsecond=0).isoformat() if d else None

def minute_id(d):
    return d.strftime('%Y%m%d-%H%M')

def x_time(sid):
    return dt.datetime.fromtimestamp(((int(sid) >> 22) + 1288834974657) / 1000, JST)

def tt_time(vid):
    return dt.datetime.fromtimestamp(int(vid) >> 32, JST)

def sc_time(code):
    n = 0
    for c in code:
        n = n * 64 + B64.index(c)
    return dt.datetime.fromtimestamp(((n >> 23) + 1314220021721) / 1000, JST)

def dd(v):
    if v is None:
        return ''
    if v == 'new':
        return 'NEW'
    return f'+{v:,}' if v > 0 else (f'−{-v:,}' if v < 0 else '0')

def fmt(v):
    return '–' if v is None else f'{v:,}'

def ceil10(d):
    m = math.ceil((d.minute + (1 if d.second or d.microsecond else 0)) / 10) * 10
    return (d.replace(minute=0, second=0, microsecond=0) + dt.timedelta(minutes=m))

# ---------- 引数 ----------
ap = argparse.ArgumentParser()
ap.add_argument('--readings', required=True)
ap.add_argument('--db', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--shots')
ap.add_argument('--rec')
A = ap.parse_args()

R = {os.path.basename(p)[:-5]: load(p) for p in glob.glob(os.path.join(A.readings, '*.json'))}
DB = {c: load_dir(os.path.join(A.db, c)) for c in ['posts', 'articles', 'shortlinks', 'figures', 'meta', 'snaps', 'kotaro', 'records', 'clicks']}
SHOTS = load(A.shots, None) if A.shots else None
os.makedirs(os.path.join(A.out, 'docs'), exist_ok=True)
checks, notes = [], []                 # checks: 要確認（報告に出す）、notes: 引き継ぎのメモ

# 集計時点
if A.rec:
    REC_DT = dt.datetime.strptime(A.rec, '%Y%m%d-%H%M').replace(tzinfo=JST)
else:
    ts = [jst(v['read_at']) for v in R.values() if isinstance(v, dict) and v.get('read_at')]
    REC_DT = ceil10(max(ts)) if ts else ceil10(dt.datetime.now(JST))
REC = minute_id(REC_DT)
RECISO = iso(REC_DT)
CREATED = iso(dt.datetime.now(JST))
DAY = (REC_DT.date() - START).days

# 前回差の基準
meta = DB['meta'].get('baseline') or {}
BASE_ID = meta.get('figures') or (sorted(DB['figures'])[-1] if DB['figures'] else None)
BASE = DB['figures'].get(BASE_ID) if BASE_ID else None
if not meta.get('figures'):
    checks.append(f'meta/baseline が無いので、直前の figures（{BASE_ID}）を基準にした')
BASE_LABEL = meta.get('label') or (BASE_ID or '')
def base_media(plat):
    if not BASE:
        return {}
    return next((m for m in BASE['sns']['media'] if m['name'] == PLAT_NAME[plat]), {})

# 前回の snaps（あれば投稿ごとの差を memo に書く）
PREV_SNAP = {}
for k, v in DB['snaps'].items():
    p = v.get('post') or k.split('_')[0]
    if p not in PREV_SNAP or (v.get('rec') or '') > (PREV_SNAP[p].get('rec') or ''):
        PREV_SNAP[p] = v

LEDGER = DB['posts']                     # 投稿台帳 {post_id: row}
def ledger_by(plat, keyfn):
    out = {}
    for pid, row in LEDGER.items():
        if row.get('plat') == plat and row.get('url'):
            k = keyfn(row['url'])
            if k:
                out[k] = pid
    return out

# 記事の短い名前（図の行名）：基準の図の名前を引き継ぐ。新しい記事は題から作る（--shots の names で上書き可）
def art_key_of_name(name):
    if name == '自己紹介':
        return '00'
    m = re.match(r'#(\d+)', name)
    if m:
        return m.group(1)
    m = re.match(r'レポート#(\d+)', name)
    if m:
        return 'r' + m.group(1)
    return None
FIG_NAME = {}
if BASE:
    for a in BASE['note'].get('articles', []):
        k = art_key_of_name(a['name'])
        if k:
            FIG_NAME[k] = a['name']
if SHOTS and SHOTS.get('names'):
    FIG_NAME.update(SHOTS['names'])
ART_KEYWORDS = {k: re.sub(r'^(#\d+|レポート#\d+)\s*', '', v) for k, v in FIG_NAME.items() if k != '00'}
TITLE_KEYWORDS = {aid: re.split(r'[｜|]|-(?=\d)', (r.get('title') or ''))[0].strip() for aid, r in DB['articles'].items() if aid != '00'}

def guess_art(text):
    text = text or ''
    m = re.search(r'(?:検証室)?レポート\s*#\s*0?(\d+)', text)
    if m:
        return f'r{int(m.group(1)):02d}'
    if re.search(r'7つの検証|\d+日間で\d+つの検証', text):
        return 'r01'
    m = re.search(r'#\s*0?(\d{1,2})(?!\d)', text)
    if m and re.search(r'検証\s*#|#\d+\s*[】]|vs.*#\d+|#0\d', text):
        return f'{int(m.group(1)):02d}'
    flat = text.replace(' ', '')
    for k, w in ART_KEYWORDS.items():
        if w and w.replace(' ', '') in flat:
            return k
    for k, w in TITLE_KEYWORDS.items():          # 記事の題の頭（「｜」「-」の前）でも当てる
        if w and len(w) >= 6 and w.replace(' ', '') in flat:
            return k
    return None

new_posts, snaps, acc_rows = {}, {}, {}
plat_tot = {}

def new_id(plat, d):
    pid = f'{plat}-{minute_id(d)}'
    while pid in LEDGER or pid in new_posts:
        pid += 'b'
    return pid

def add_snap(pid, plat, views, likes=None, comments=None, reposts=None, saves=None, memo_extra=''):
    prev = PREV_SNAP.get(pid)
    if pid in new_posts:
        memo = '新規'
    elif prev is None or prev.get('views') is None or views is None:
        memo = '前回の値なし' if views is not None else '読めなかった'
    else:
        dv = views - prev['views']
        memo = '変化なし' if dv == 0 else f"前回({prev.get('rec','')[:16].replace('T',' ')})から{dd(dv)}"
    snaps[pid] = {'post': pid, 'plat': plat, 'views': views, 'likes': likes, 'comments': comments, 'reposts': reposts,
                  'saves': saves, 'clicks': None, 'rec': RECISO, 'created': CREATED, 'src': 'ブラウザ',
                  'memo': (memo_extra + memo) if memo_extra else memo}

def missing_ledger(plat, found_ids, label):
    miss = [pid for pid, r in LEDGER.items() if r.get('plat') == plat and pid not in found_ids]
    for pid in miss:
        add_snap(pid, plat, None, memo_extra='台帳にあるが今回の一覧に無い。')
    if miss:
        checks.append(f'{label}：台帳にあるのに読めなかった投稿 {len(miss)}本（{", ".join(miss)}）。削除なら posts_removed へ移す（Skyに確認）')
    return miss

# ---------- YouTube ----------
def do_yt():
    S, P = R.get('yt_studio'), R.get('yt_public')
    if not S:
        return None
    vids = (P or {}).get('videos', {})
    by = ledger_by('yt', lambda u: (re.search(r'shorts/([\w-]+)', u) or [None, None])[1])
    found = set()
    for p in S['posts']:
        k = p['key']; pv = vids.get(k, {})
        pid = by.get(k)
        if not pid:
            pub = jst(pv.get('pub')) if pv.get('pub') else None
            if pub is None:
                checks.append(f'YouTube：新しいショート {k} の公開時刻が取れない（yt_public.js の IDS に入れたか確認）')
                pub = REC_DT
            pid = new_id('yt', pub)
            new_posts[pid] = {'plat': 'yt', 'kind': f"ショート {p.get('dur') or ''}".strip(), 'title': p['title'][:80],
                              'url': f'https://www.youtube.com/shorts/{k}', 'pub': iso(pub), 'art': guess_art(p['title']), 'link': '',
                              'memo': '公開時刻はショートの publishDate', 'src': 'ブラウザ', 'created': CREATED}
        found.add(pid)
        lk = pv.get('likes')
        add_snap(pid, 'yt', p['views'], None if lk is None or lk != lk else lk, p.get('comments'))
    missing_ledger('yt', found, 'YouTube')
    if S.get('n') and any(p.get('visibility') == '非公開' for p in S['posts']):
        notes.append('YouTube：非公開のショートも本数・視聴に含めている（9/6の1本目。Skyの判断）')
    return {'fw': (P or {}).get('subs'), 'fo': None}

# ---------- TikTok ----------
def do_tt():
    S, F = R.get('tt_studio'), R.get('tt_profile')
    if not S:
        return None
    if S.get('total_on_page') and S['total_on_page'] != S.get('n'):
        checks.append(f"TikTok：一覧の件数 {S['total_on_page']} に対して読めたのは {S.get('n')} 行")
    photo = set((F or {}).get('photo_ids') or [])
    by = ledger_by('tt', lambda u: (re.search(r'/(?:video|photo)/(\d+)', u) or [None, None])[1])
    # リンクが取れなかった行は日付（分）で台帳と突き合わせる
    by_min = {}
    for pid, r in LEDGER.items():
        if r.get('plat') == 'tt' and r.get('pub'):
            by_min[pid] = jst(r['pub'])
    found = set()
    for p in S['posts']:
        k = p.get('key')
        pid = by.get(k) if k else None
        if not pid:
            m = re.match(r'(\d+)月(\d+)日 午([前後])(\d+):(\d+)', p['date'])
            d = None
            if m:
                h = int(m.group(4)) % 12 + (12 if m.group(3) == '後' else 0)
                d = dt.datetime(REC_DT.year, int(m.group(1)), int(m.group(2)), h, int(m.group(5)), tzinfo=JST)
                cand = [pid2 for pid2, t in by_min.items() if abs((t - d).total_seconds()) <= 120 and pid2 not in found]
                if len(cand) == 1:
                    pid = cand[0]
            if not pid:
                pub = tt_time(k) if k else d
                pid = new_id('tt', pub)
                kind = '画像投稿' if (k in photo or not p.get('dur')) else '動画 ' + re.sub(r'^0(\d)', r'\1', p['dur'])
                url = f"https://www.tiktok.com/@yokonarabi_lab/{'photo' if kind == '画像投稿' else 'video'}/{k}" if k else ''
                new_posts[pid] = {'plat': 'tt', 'kind': kind, 'title': p['title'][:80], 'url': url, 'pub': iso(pub),
                                  'art': guess_art(p['title']), 'link': '', 'memo': '公開時刻は動画IDから算出' if k else '公開時刻は一覧の表示（分まで）。IDは未取得',
                                  'src': 'ブラウザ', 'created': CREATED}
                if not k:
                    checks.append(f"TikTok：新しい投稿（{p['date']}）のIDが取れなかった")
        found.add(pid)
        add_snap(pid, 'tt', p['views'], p['likes'], p['comments'])
    missing_ledger('tt', found, 'TikTok')
    lsum = sum(s['likes'] or 0 for s in snaps.values() if s['plat'] == 'tt')
    if F and F.get('likes_total') is not None and F['likes_total'] != lsum:
        notes.append(f"TikTok：プロフィールのいいね合計 {F['likes_total']} と投稿別の和 {lsum} がずれている（読んだ時刻の差）")
    return {'fw': (F or {}).get('fw'), 'fo': (F or {}).get('fo')}

# ---------- X ----------
def do_x():
    S = R.get('x_profile')
    if not S:
        return None
    tw = sorted(S['tweets'], key=lambda t: int(t['key']))
    by = ledger_by('x', lambda u: (re.search(r'status/(\d+)', u) or [None, None])[1])
    roots, replies_of = [], {}
    for t in tw:
        tt_ = x_time(t['key'])
        if t['key'] in by:
            roots.append(t); replies_of[t['key']] = 0; continue
        prev = roots[-1] if roots else None
        if prev and 0 <= (tt_ - x_time(prev['key'])).total_seconds() <= X_THREAD_GAP:
            replies_of[prev['key']] = replies_of.get(prev['key'], 0) + 1
            continue
        # 直前のポスト（返信も含む）から近いものも返信とみなす
        near = [u for u in tw if int(u['key']) < int(t['key']) and 0 <= (tt_ - x_time(u['key'])).total_seconds() <= X_THREAD_GAP]
        if near:
            root = next((r for r in reversed(roots) if int(r['key']) <= int(near[-1]['key'])), None)
            if root:
                replies_of[root['key']] = replies_of.get(root['key'], 0) + 1
                continue
        roots.append(t); replies_of[t['key']] = 0
    found = set()
    for t in roots:
        pid = by.get(t['key'])
        if not pid:
            d = x_time(t['key']); pid = new_id('x', d)
            n = replies_of.get(t['key'], 0)
            new_posts[pid] = {'plat': 'x', 'kind': '本文' + (f'＋返信{n}' if n else ''), 'title': t.get('text', '')[:80],
                              'url': f"https://x.com/yokonarabi_lab/status/{t['key']}", 'pub': iso(d), 'art': guess_art(t.get('text')),
                              'link': '', 'memo': '時刻はポストIDから算出', 'src': 'ブラウザ', 'created': CREATED}
        found.add(pid)
        add_snap(pid, 'x', t.get('views'), t.get('likes', 0), None, t.get('reposts'))
    missing_ledger('x', found, 'X')
    if S.get('innerHeight', 9999) < 5000:
        checks.append(f"X：ビューポートの高さが {S.get('innerHeight')}。1280×9999 にしてから読むこと")
    return {'fw': S.get('fw'), 'fo': S.get('fo')}

# ---------- Instagram ----------
def do_ig():
    P, V = R.get('ig_profile'), R.get('ig_insights')
    if not P or not P.get('posts'):
        return None
    views = (V or {}).get('views') or {}
    if not V:
        checks.append('Instagram：インサイト一覧（ig_insights.js）が無いのでビューは null')
    by = ledger_by('ig', lambda u: (re.search(r'/(?:reel|p)/([\w-]+)', u) or [None, None])[1])
    found = set()
    for p in P['posts']:
        k = p['key']; pid = by.get(k)
        if not pid:
            d = jst(p['pub']); pid = new_id('ig', d)
            pt = p.get('product_type')
            kind = 'リール' if pt == 'clips' else (f"カルーセル {p.get('carousel_count')}枚" if pt == 'carousel_container' else '画像投稿')
            path = 'reel' if pt == 'clips' else 'p'
            new_posts[pid] = {'plat': 'ig', 'kind': kind, 'title': p.get('caption', '')[:80], 'url': f'https://www.instagram.com/{path}/{k}/',
                              'pub': iso(d), 'art': guess_art(p.get('caption')), 'link': '', 'memo': '公開時刻はプロフィールの taken_at',
                              'src': 'ブラウザ', 'created': CREATED}
        found.add(pid)
        v = views.get(k)
        if V and k not in views:
            checks.append(f'Instagram：{k} がインサイト一覧に無い（timeframe=90 の範囲外か、公開直後）')
        add_snap(pid, 'ig', v, p.get('likes'), p.get('comments'))
    missing_ledger('ig', found, 'Instagram')
    if P.get('total_on_header') and P['total_on_header'] != len(P['posts']):
        checks.append(f"Instagram：ヘッダーの投稿数 {P['total_on_header']} と読めた件数 {len(P['posts'])} が違う")
    return {'fw': P.get('fw'), 'fo': P.get('fo')}

# ---------- Threads ----------
def do_th():
    S, F = R.get('th_insights'), R.get('th_profile')
    if not S:
        return None
    by = ledger_by('th', lambda u: (lambda c: TH_ALIASES.get(c, c))((re.search(r'post/([\w-]+)', u) or [None, None])[1]))
    found = set()
    for code, p in S['posts'].items():
        pid = by.get(code)
        if not pid:
            d = sc_time(code); pid = new_id('th', d)
            n = p.get('replies') or 0
            new_posts[pid] = {'plat': 'th', 'kind': '本文' + (f'＋返信{n}' if n else ''), 'title': p.get('text', '')[:80],
                              'url': f'https://www.threads.com/@yokonarabi_lab/post/{code}', 'pub': iso(d), 'art': guess_art(p.get('text')),
                              'link': '', 'memo': '時刻はshortcodeから算出。動画かどうかは未確認（返信数は他人の返信を含む）',
                              'src': 'ブラウザ', 'created': CREATED}
        found.add(pid)
        add_snap(pid, 'th', p.get('views'), p.get('likes'), None, p.get('reposts'))
    missing_ledger('th', found, 'Threads')
    return {'fw': (F or {}).get('fw'), 'fo': None}

for plat, fn in [('yt', do_yt), ('tt', do_tt), ('x', do_x), ('ig', do_ig), ('th', do_th)]:
    r = fn()
    if r is None:
        checks.append(f'{PLAT_NAME[plat]}：読めなかった（readings が無い）→ 数字は null')
        plat_tot[plat] = None
        continue
    rows = [s for s in snaps.values() if s['plat'] == plat]
    views = [s['views'] for s in rows]
    plat_tot[plat] = {'posts': len(rows), 'views': sum(v for v in views if v is not None) if any(v is not None for v in views) else None,
                      'likes': sum(s['likes'] or 0 for s in rows), 'followers': r['fw'], 'fo': r['fo'],
                      'unread': sum(1 for v in views if v is None)}

# ---------- accounts ----------
for plat in PLATS:
    t = plat_tot.get(plat)
    if not t:
        continue
    b = base_media(plat)
    newn = sum(1 for p in new_posts.values() if p['plat'] == plat)
    memo = (f"投稿{t['posts']}本（{BASE_LABEL}比{dd(t['posts'] - b['posts']) if b else '—'}、新規{newn}）・表示・再生{fmt(t['views'])}"
            f"（{dd(t['views'] - b['views']) if b and t['views'] is not None else '—'}）・いいね{t['likes']}・フォロワー{fmt(t['followers'])}")
    if t['unread']:
        memo += f"。読めなかった投稿{t['unread']}本（null）"
    acc_rows[plat] = {'plat': plat, 'fw': t['followers'], 'fo': t['fo'], 'rec': RECISO, 'created': CREATED, 'src': 'ブラウザ', 'memo': memo}

# ---------- クリック（00Min＋GA4） ----------
M = R.get('min00') or {}
G = R.get('ga4')
links = M.get('links') if M.get('login') else None
if not links:
    checks.append('00Min：ログイン切れ（links: null）→ クリックの図と見出し画像は作らない')
SL = DB['shortlinks']
groups = {p: [s for s, r in SL.items() if r.get('plat') == p] for p in PLATS + ['kt']}
clicks_row, CLICKS = None, None
if G:
    def landing_clean(L):
        sky = min(L['google_organic'], SKY_GOOGLE_KNOWN)
        return L['raw'] - L['test'] - sky, sky
    land, sky = landing_clean(G['landing'])
    base_land, _ = landing_clean(G['base'])
    if G['landing']['google_organic'] > SKY_GOOGLE_KNOWN:
        checks.append(f"GA4：`/` の google/organic が {G['landing']['google_organic']}（Sky本人と分かっているのは{SKY_GOOGLE_KNOWN}）。増えた分は読者として着地に入れた")
    hub_by = {}
    for s, n in (G.get('note_click_by_source') or {}).items():
        p = SRC2PLAT.get(s)
        if not p:
            checks.append(f'GA4：note_click の参照元 {s}（{n}）は5つのSNS以外 → 「参照元なし」の行に入れた')
            p = 'none'
        hub_by[p] = hub_by.get(p, 0) + n
    hub = sum(hub_by.values())
    sessions = dict(G['landing']['by'])
    if sessions.get('google'):
        sessions['google'] -= sky
        if not sessions['google']:
            del sessions['google']
    ga4 = {'from': f"{G['from'][:4]}-{G['from'][4:6]}-{G['from'][6:]}", 'to': iso(jst(G['read_at']))[:16],
           'landing_root_raw': G['landing']['raw'], 'landing_root': land, 'landing_clean': land, 'sessions': sessions,
           'note_click': G.get('note_click') or {}, 'note_click_by_source': {**{'not_set': 0}, **(G.get('note_click_by_source') or {})},
           'note_click_test': G.get('note_click_test') or {}, 'landing_kotaro': G['landing']['kotaro'],
           'landing_kotaro_by': G['landing']['kotaro_by'], 'kotaro_click': G.get('kotaro_click'),
           'base_reread': {'period': f"{G['from'][:4]}-{G['from'][4:6]}-{G['from'][6:]}〜{G['base_to'][:4]}-{G['base_to'][4:6]}-{G['base_to'][6:]}",
                           'landing_root': base_land, 'read_at': REC_DT.date().isoformat()},
           'excl': f"着地は / と /index.html の {G['landing']['raw']} から / の test {G['landing']['test']}・Sky google/organic {sky} を引いて{land}。"
                   f"基準期間の読み直しは {G['base']['raw']}−test {G['base']['test']}−Sky → {base_land}。note_click は test を除いて{hub}"}
else:
    checks.append('GA4：読めなかった → ハブ経由・着地は null')
    ga4, hub, hub_by, land, base_land = None, None, {}, None, None
if links is None and ga4 is not None:
    clicks_row = {'rec': RECISO, 'created': CREATED, 'src': 'Claude（00Minはログイン切れ' + (f"・GA4 {jst(G['read_at']).strftime('%H:%M')}ごろ）" if G else '）'),
                  'links': None, **{p: None for p in PLATS}, 'kt': None, 'tk': None, 'ga4': ga4,
                  'memo': f"00Minが読めず合計は出していない。GA4：ハブ経由{hub}（着地{land}のうち）・基準期間の読み直し{base_land}"}
if links is not None:
    short = {p: sum(links.get(s, 0) for s in groups.get(p, [])) for p in PLATS}
    kt = sum(links.get(s, 0) for s in groups.get('kt', []))
    tk = links.get('kenshotk')
    unknown = [s for s in links if s not in SL and s != 'kenshotk']
    if unknown:
        checks.append(f'00Min：台帳（shortlinks）に無いスラッグ {unknown}。クリックに入れていない')
    short_total = sum(short.values())
    total = short_total + (hub or 0) + kt
    media = {p: short[p] + hub_by.get(p, 0) for p in PLATS}
    clicks_row = {'rec': RECISO, 'created': CREATED, 'src': f"Claude（00Min一覧 {jst(M['read_at']).strftime('%H:%M')}" + (f"・GA4 {jst(G['read_at']).strftime('%H:%M')}ごろ）" if G else '）'),
                  'links': links, **{p: media[p] for p in PLATS}, 'kt': kt, 'tk': tk,
                  'x01': links.get('kensho01x'), 'x02': links.get('kensho02x'), 'x03': links.get('kensho03x'), 'xp': links.get('kenshox'),
                  'th01': links.get('kensho01th'), 'th02': links.get('kensho02th'), 'th03': links.get('kensho03th'), 'thp': links.get('kenshoth'),
                  'ga4': ga4}
    CLICKS = {'total': total, 'short': short_total, 'hub': hub, 'kt': kt, 'media': media, 'none': hub_by.get('none', 0), 'land': land, 'base_land': base_land}
    bt = None
    if BASE and BASE.get('clicks'):
        bt = sum(r['clicks'] for r in BASE['clicks']['routes'])
    clicks_row['memo'] = (f"合計{total}＝短縮リンク{short_total}＋ハブ経由{hub if hub is not None else '–'}（着地{fmt(land)}のうち）＋コタロウ→検証室{kt}。"
                          f"SNS別：" + '・'.join(f"{p.upper()}{media[p]}" for p in PLATS) + f"・note（コタロウ）{kt}・参照元なし{hub_by.get('none', 0)}＝{total}。"
                          + (f"前回の記事（{BASE_LABEL}、合計{bt}）比{dd(total - bt)}。" if bt is not None else '')
                          + (f"ハブ着地は{land}（基準期間を今日読み直すと{base_land}なので{dd(land - base_land)}）" if land is not None else ''))
    if sum(media.values()) + kt + hub_by.get('none', 0) != total:
        checks.append('クリック：SNS別の和が合計と合わない')

# ---------- note ----------
N = (R.get('note_api') or {}).get('accounts') or {}
K = N.get('yokonarabi_lab'); KT = N.get('kotarozero')
ART = DB['articles']
def art_id_for(a):
    for aid, r in ART.items():
        if r.get('url') and a['key'] in r['url']:
            return aid
    t = a['title']
    if '自己紹介' in t:
        return '00'
    m = re.search(r'検証室レポート\s*#\s*(\d+)', t)
    if m:
        return f'r{int(m.group(1)):02d}'
    m = re.search(r'#\s*(\d+)\s*$', t)
    if m:
        return f'{int(m.group(1)):02d}'
    return None
new_articles = {}
art_ids = []
if K:
    for a in K['articles']:
        aid = art_id_for(a)
        if aid is None:
            checks.append(f"note：記事「{a['title']}」の番号が決められない（articles に手で足す）")
            continue
        art_ids.append(aid)
        if aid not in ART:
            new_articles[aid] = {'no': ('自己紹介' if aid == '00' else (f'レポート#{aid[1:]}' if aid.startswith('r') else f'#{aid}')),
                                 'title': a['title'], 'url': a.get('url') or f"https://note.com/yokonarabi_lab/n/{a['key']}",
                                 'pub': iso(jst(a['pub'])), 'sns': None, 'note': '公開時刻はnote APIのpublishAt（assemble.py が追加）'}
            if aid not in FIG_NAME:
                head = re.split(r'[｜|]', a['title'])[0].strip()
                FIG_NAME[aid] = (f"レポート#{aid[1:]}" if aid.startswith('r') else f"#{aid} {head}")
                checks.append(f"note：新しい記事 {aid} の図の行名を「{FIG_NAME[aid]}」にした（長ければ --shots の names で直す）")
else:
    checks.append('note：公開ページ（note_api.js）が読めなかった → スキ・フォロワーは null')

S_K = (SHOTS or {}).get('kensho')
S_T = (SHOTS or {}).get('kotaro')
if not S_K:
    checks.append('noteスクショなし → 検証室の imp・pv は null')
def ord_key(aid):
    return (0 if aid == '00' else (2 if aid.startswith('r') else 1), aid)
all_art = sorted(set(art_ids) | set(ART) | set(new_articles), key=ord_key)
rec_row = {'rec': RECISO, 'created': CREATED}
if S_K:
    rec_row.update({'agg': iso(jst(S_K['agg'])), 'win': f"過去28日間（{S_K['win']}）", 'imp': S_K.get('imp'), 'pv': S_K.get('pv'), 'lk_dash': S_K.get('lk_dash')})
    for aid, v in (S_K.get('by') or {}).items():
        sfx = aid if not aid.startswith('r') else 'r' + aid[1:]
        rec_row[f'imp{sfx}'] = v.get('imp'); rec_row[f'pv{sfx}'] = v.get('pv')
    si = sum((v.get('imp') or 0) for v in S_K.get('by', {}).values()); sp = sum((v.get('pv') or 0) for v in S_K.get('by', {}).values())
    if S_K.get('imp') and abs(si - S_K['imp']) > S_K['imp'] * 0.02:
        checks.append(f"note：記事別impの和 {si} とアクセス状況 {S_K['imp']} が2%以上ずれている")
    if S_K.get('pv') and abs(sp - S_K['pv']) > S_K['pv'] * 0.02:
        checks.append(f"note：記事別pvの和 {sp} とアクセス状況 {S_K['pv']} が2%以上ずれている")
else:
    rec_row.update({'imp': None, 'pv': None, 'lk_dash': None})
if K:
    rec_row.update({'lk': K['likes_total'], 'fw': K['fw'], 'fo': K['fo'], 'cm': K['comments_total']})
bnote = (BASE or {}).get('note', {}).get('total', {})
rec_row['src'] = ('Skyのスクショ（' + (f"{jst(S_K['agg']).strftime('%H:%M')}集計、過去28日間{S_K['win']}" if S_K else 'なし') + '）＋note API（スキ・フォロワー）')
posts_n = len(art_ids) if K else None
rec_row['memo'] = (f"{DAY}日目。インプレッション{fmt(rec_row.get('imp'))}（{BASE_LABEL}比{dd((rec_row.get('imp') or 0) - bnote['imp']) if rec_row.get('imp') is not None and bnote else '—'}）"
                   f"・PV{fmt(rec_row.get('pv'))}（{dd(rec_row['pv'] - bnote['pv']) if rec_row.get('pv') is not None and bnote else '—'}）"
                   f"・スキ{fmt(rec_row.get('lk'))}（公開ページ。ダッシュボードは{fmt(rec_row.get('lk_dash'))}）・フォロワー{fmt(rec_row.get('fw'))}・記事{fmt(posts_n)}本")

kot_row = None
if KT or S_T:
    prevk = sorted(DB['kotaro'].items())[-1][1] if DB['kotaro'] else None
    kot_row = {'rec': RECISO, 'created': CREATED,
               'src': ('Skyのスクショ（' + (f"{jst(S_T['agg']).strftime('%H:%M')}集計" if S_T else 'なし') + '）＋公開ページ（note API）'),
               'imp': (S_T or {}).get('imp'), 'pv': (S_T or {}).get('pv'), 'lk': (KT or {}).get('likes_total'), 'lk_dash': (S_T or {}).get('lk_dash'),
               'cm': (KT or {}).get('comments_total'), 'fw': (KT or {}).get('fw'), 'fo': (KT or {}).get('fo'), 'posts': len((KT or {}).get('articles', [])) or None}
    if S_T and S_T.get('by'):
        kot_row['imp_by'] = {k: v.get('imp') for k, v in S_T['by'].items()}
        kot_row['pv_by'] = {k: v.get('pv') for k, v in S_T['by'].items()}
    if KT:
        arts = sorted(KT['articles'], key=lambda a: a['pub'])
        kot_row['lk_by'] = {str(i + 1): a['likes'] for i, a in enumerate(arts)}
    kot_row['memo'] = (f"インプレッション{fmt(kot_row['imp'])}" + (f"（前回{prevk['imp']:,}比{dd(kot_row['imp'] - prevk['imp'])}）" if prevk and kot_row['imp'] is not None and prevk.get('imp') else '')
                       + f"・PV{fmt(kot_row['pv'])}・スキ{fmt(kot_row['lk'])}（ダッシュボード{fmt(kot_row['lk_dash'])}）・フォロワー{fmt(kot_row['fw'])}・フォロー{fmt(kot_row['fo'])}・記事{fmt(kot_row['posts'])}本")

# ---------- 図版の data.json ----------
D = {'rec': REC_DT.strftime('%Y-%m-%dT%H:%M'), 'start': START.isoformat(),
     'sns': {'media': [{'name': PLAT_NAME[p], 'posts': (plat_tot.get(p) or {}).get('posts'), 'views': (plat_tot.get(p) or {}).get('views'),
                        'likes': (plat_tot.get(p) or {}).get('likes'), 'followers': (plat_tot.get(p) or {}).get('followers')} for p in PLATS]},
     'clicks': None,
     'note': {'total': {'imp': rec_row.get('imp'), 'pv': rec_row.get('pv'), 'likes': rec_row.get('lk'), 'followers': rec_row.get('fw'), 'posts': posts_n},
              'win': (S_K or {}).get('win', ''), 'articles': []}}
if CLICKS and CLICKS['hub'] is not None:
    D['clicks'] = {'routes': [{'name': 'SNSの短縮リンク', 'clicks': CLICKS['short'], 'note': '9/14まで'},
                              {'name': 'ハブページ経由', 'clicks': CLICKS['hub'], 'note': '9/14から', 'pre': f"着地{CLICKS['land']}のうち"},
                              {'name': 'コタロウのnote記事から', 'clicks': CLICKS['kt'], 'note': 'note内'}],
                   'media': [{'name': PLAT_NAME[p], 'clicks': CLICKS['media'][p]} for p in PLATS]
                            + [{'name': 'note（コタロウ）', 'clicks': CLICKS['kt']}, {'name': '参照元なし', 'clicks': CLICKS['none']}]}
elif CLICKS is None or CLICKS.get('hub') is None:
    pass
if S_K and S_K.get('by'):
    for aid in all_art:
        v = S_K['by'].get(aid)
        if v is None:
            if aid in art_ids:
                checks.append(f'note：記事 {aid} がスクショの記事別に無い（公開直後で未反映なら図の行も作らない）')
            continue
        D['note']['articles'].append({'name': FIG_NAME.get(aid, aid), 'imp': v.get('imp'), 'pv': v.get('pv')})
if SHOTS and SHOTS.get('page'):
    D['page'] = SHOTS['page']
if SHOTS and SHOTS.get('fn_extra'):
    D['note']['fn_extra'] = SHOTS['fn_extra']

# ---------- 書き込みの組み立て ----------
docs = []
def put(col, did, data):
    fn = os.path.join(A.out, 'docs', f'{col}__{did}.json')
    with open(fn, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    docs.append({'op': 'set', 'collection': col, 'doc_id': did, 'file_path': os.path.abspath(fn)})
for pid, row in sorted(new_posts.items()):
    put('posts', pid, row)
for p, row in acc_rows.items():
    put('accounts', f'{p}-{REC}', row)
rec_row['memo'] += ''
put('records', REC, rec_row)
if clicks_row:
    put('clicks', REC, clicks_row)
if kot_row:
    put('kotaro', REC, kot_row)
for aid, row in new_articles.items():
    put('articles', aid, row)
put('figures', REC, D)
main_docs = list(docs)
docs = []
for pid, row in sorted(snaps.items()):
    put('snaps', f'{pid}_{REC}', row)
snap_docs = docs

# ---------- 報告・引き継ぎ ----------
tot_views = sum((plat_tot[p] or {}).get('views') or 0 for p in PLATS if plat_tot.get(p))
tot_posts = sum((plat_tot[p] or {}).get('posts') or 0 for p in PLATS if plat_tot.get(p))
tot_fw = sum((plat_tot[p] or {}).get('followers') or 0 for p in PLATS if plat_tot.get(p))
tot_lk = sum((plat_tot[p] or {}).get('likes') or 0 for p in PLATS if plat_tot.get(p))
bsum = lambda k: sum(m[k] for m in BASE['sns']['media']) if BASE else None
bc = sum(r['clicks'] for r in BASE['clicks']['routes']) if BASE and BASE.get('clicks') else None
movers = sorted([s for s in snaps.values() if s['views'] is not None and PREV_SNAP.get(s['post']) and PREV_SNAP[s['post']].get('views') is not None],
                key=lambda s: s['views'] - PREV_SNAP[s['post']]['views'], reverse=True)[:3]
unread = [c for c in checks if '読めなかった' in c or 'null' in c]
report = ['---', f"集計 {REC_DT.strftime('%Y/%m/%d %H:%M')}（{DAY}日目）",
          f"SNS 表示・再生 {tot_views:,}（{dd(tot_views - bsum('views')) if BASE else '—'}）／投稿 {tot_posts}（{dd(tot_posts - bsum('posts')) if BASE else '—'}）／フォロワー {tot_fw}（{dd(tot_fw - bsum('followers')) if BASE else '—'}）／いいね {tot_lk}（{dd(tot_lk - bsum('likes')) if BASE else '—'}）"]
if CLICKS:
    report.append(f"noteへのクリック {CLICKS['total']}（{dd(CLICKS['total'] - bc) if bc is not None else '—'}）＝短縮リンク{CLICKS['short']}＋ハブ経由{fmt(CLICKS['hub'])}（着地{fmt(CLICKS['land'])}のうち）＋コタロウ→検証室{CLICKS['kt']}")
else:
    report.append('noteへのクリック：00Minが読めず作っていない')
report.append(f"検証室note imp {fmt(rec_row.get('imp'))}（{dd(rec_row['imp'] - bnote['imp']) if rec_row.get('imp') is not None and bnote else '—'}）／pv {fmt(rec_row.get('pv'))}（{dd(rec_row['pv'] - bnote['pv']) if rec_row.get('pv') is not None and bnote else '—'}）／スキ {fmt(rec_row.get('lk'))}（{dd(rec_row['lk'] - bnote['likes']) if rec_row.get('lk') is not None and bnote else '—'}）／フォロワー {fmt(rec_row.get('fw'))}（{dd(rec_row['fw'] - bnote['followers']) if rec_row.get('fw') is not None and bnote else '—'}）／記事 {fmt(posts_n)}")
if kot_row:
    report.append(f"コタロウ imp {fmt(kot_row['imp'])}／pv {fmt(kot_row['pv'])}／スキ {fmt(kot_row['lk'])}／フォロワー {fmt(kot_row['fw'])}")
if movers:
    report.append('動いたもの：' + '・'.join(f"{s['post']} {s['views']:,}（{dd(s['views'] - PREV_SNAP[s['post']]['views'])}）" for s in movers))
missing_plats = [PLAT_NAME[p] for p in PLATS if not plat_tot.get(p)]
if missing_plats:
    report[2] += f"　※{'・'.join(missing_plats)}は読めず、合計と前回差に入っていない"
report.append('読めなかったもの：' + ('／'.join(unread) if unread else 'なし'))
report.append(f"DB：REC {REC}（records・clicks・kotaro・accounts {len(acc_rows)}・snaps {len(snaps)}・posts 新規{len(new_posts)}" + (f"・articles {'・'.join(new_articles)}" if new_articles else '') + '）')
report.append(f"図版：（build.js の結果を書く）前回差の基準 {BASE_LABEL}")
report.append('記事を出したら「基準を今回の図に」と言って')
report.append('---')

hand = [f"# 引き継ぎ {REC_DT.date().isoformat()}（{DAY}日目・本番集計）", '',
        f"**{REC_DT.strftime('%Y/%m/%d %H:%M')} 時点**で6媒体＋00Min＋GA4＋note（検証室・コタロウ）をそろえた。前回差は **{BASE_LABEL}** との差。", '',
        f"- DBの行ID：`records/{REC}`、`clicks/{REC}`、`kotaro/{REC}`、accounts `*-{REC}`（{len(acc_rows)}）、snaps `*_{REC}`（{len(snaps)}本）、`figures/{REC}`、`handoffs/{REC}`",
        f"- 台帳の変更：posts に新規{len(new_posts)}本" + (f"／articles に {', '.join(new_articles)} を追加" if new_articles else ''), '',
        '## 数字', '', *report[1:-1], '',
        '## 今回の投稿（前回の集計以降。数字は今回時点）', '']
for pid, row in sorted(new_posts.items(), key=lambda kv: kv[1]['pub'] or ''):
    s = snaps.get(pid, {})
    hand.append(f"- {jst(row['pub']).strftime('%m/%d %H:%M')} {PLAT_NAME[row['plat']]}：{row['kind']}「{row['title'][:30]}」（art {row['art'] or '未確認'}）→ {fmt(s.get('views'))}")
hand += ['', '## メモ', ''] + [f'- {c}' for c in checks + notes] + ['- 次回への申し送り：記事を出したら「基準を今回の図に」と言って']
hand_md = '\n'.join(hand) + '\n'
put_h = {'rec': RECISO, 'created': CREATED, 'day': DAY, 'md': hand_md, 'figures': D['clicks'] is not None, 'missing': unread}
docs = []
put('handoffs', REC, put_h)
main_docs += docs

batches = [main_docs[i:i + 50] for i in range(0, len(main_docs), 50)] + [snap_docs[i:i + 50] for i in range(0, len(snap_docs), 50)]
for i, b in enumerate(batches, 1):
    with open(os.path.join(A.out, f'writes_{i:02d}.json'), 'w', encoding='utf-8') as f:
        json.dump(b, f, ensure_ascii=False)
with open(os.path.join(A.out, 'data.json'), 'w', encoding='utf-8') as f:
    json.dump(D, f, ensure_ascii=False, indent=1)
if BASE:
    with open(os.path.join(A.out, 'base.json'), 'w', encoding='utf-8') as f:
        json.dump(BASE, f, ensure_ascii=False, indent=1)
with open(os.path.join(A.out, 'report.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(report) + '\n')
with open(os.path.join(A.out, 'handoff.md'), 'w', encoding='utf-8') as f:
    f.write(hand_md)
with open(os.path.join(A.out, 'checks.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(checks + notes) + '\n')
print(f'REC {REC}（{DAY}日目） 基準 {BASE_ID}')
print(f'SNS 表示・再生 {tot_views:,} 投稿 {tot_posts} いいね {tot_lk} フォロワー {tot_fw}' + (f" ／ クリック {CLICKS['total']}" if CLICKS else ''))
print(f'書き込み {len(main_docs) + len(snap_docs)} 件 → writes_01〜{len(batches):02d}.json（新規投稿 {len(new_posts)}、snaps {len(snaps)}）')
print('要確認：' + ('なし' if not checks else ''))
for c in checks:
    print('  - ' + c)
