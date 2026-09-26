# schema.md — ダッシュボード「note指標ログ」のDB

ダッシュボードはアーティファクト（URLは起動時の指示文）。DBは ArtifactData で読み書きする（`get`／`list`／`query`／`batch`）。
**新しい行を足すだけ。既存の行は書き換えない・消さない。** 例外は `posts` → `posts_removed` の移動だけ。

## ID と時刻

- `REC` ＝ 集計時点。`YYYYMMDD-HHMM`（日本時間、読み終えた時刻を10分単位に切り上げ）。同じ REC を全部の行に使う
- 各行の共通フィールド：`rec`（ISO、`2026-09-24T16:30:00+09:00`）・`created`（書いた時刻）・`src`（出どころ。「ブラウザ」「Skyのスクショ」「Claude（00Min一覧 16:29・GA4 16:20ごろ）」など）・`memo`（読み方・前回差・注意点。読めなかった理由は必ずここに）
- 未計測は `null`

## records — 検証室noteの記録（1回1行、ID＝REC）

```json
{
  "rec": "2026-09-24T16:30:00+09:00", "created": "2026-09-24T16:40:00+09:00",
  "agg": "2026-09-24T15:20:00+09:00",          // noteダッシュボード（スクショ）の集計時刻
  "win": "過去28日間（8/28〜9/24）",
  "imp": 6256, "pv": 446,                       // スクショ。無ければ null
  "lk": 27, "lk_dash": 24,                      // lk＝公開ページのスキ（正）、lk_dash＝スクショの値
  "fw": 12, "fo": 7, "cm": 0,                   // フォロワー・フォロー・コメント（公開ページ）
  "imp00": 702, "pv00": 49,                     // 記事別。00＝自己紹介、01〜NN＝検証、r01＝レポート（impr01／pvr01）
  "imp01": 1261, "pv01": 178, "imp07": 239, "pv07": 30,
  "src": "Skyのスクショ（アクセス状況 15:20集計・記事別 13:56集計）＋note API（スキ・フォロワー）",
  "memo": "18日目。…"
}
```

## clicks — noteへのクリック（1回1行、ID＝REC）

```json
{
  "rec": "…", "created": "…", "src": "…", "memo": "合計97＝短縮リンク78＋ハブ経由10（着地59のうち）＋コタロウ→検証室9。SNS別：…",
  "links": { "kensho01yt": 8, "kensho01tt": 13, "kensho01x": 6, "kensho02x": 5, "kensho03x": 1, "kenshox": 3,
             "kensho01ig": 14, "kenshoig": 7, "kensho01th": 4, "kensho02th": 1, "kensho03th": 3, "kenshoth": 13,
             "kenshokt": 9, "kenshotk": 3 },   // 00Minの累計。読めなければ links: null
  "yt": 11, "tt": 13, "x": 17, "ig": 21, "th": 26,   // SNS別＝短縮リンク（note行き）＋ハブ経由（GA4の note_click 参照元別）
  "kt": 9,                                    // コタロウ→検証室（note内、kenshokt）
  "tk": 3,                                    // TikTokプロフィール→ハブ（kenshotk）。noteへのクリックには入れない
  "x01": 6, "x02": 5, "x03": 1, "xp": 3,      // Xの記事別・プロフィール（短縮リンク）
  "th01": 4, "th02": 1, "th03": 3, "thp": 13,
  "ga4": {
    "from": "2026-09-14", "to": "2026-09-24T16:20",
    "landing_root_raw": 65,                   // `/`＋`/index.html` の着地（引く前）
    "landing_root": 59,                       // test（`/` の行の分）と Sky 自身を引いた着地 ＝ 図の「着地」
    "landing_clean": 59,
    "sessions": { "youtube": 13, "instagram": 13, "x": 11, "threads": 9, "tiktok": 4, "direct": 7, "yahoo": 1, "data_not_available": 1, "test": 5 },
    "note_click": { "01": 2, "02": 2, "03": 1, "05": 3, "06": 2, "07": 0 },    // test を除いたイベント数
    "note_click_by_source": { "threads": 5, "youtube": 3, "x": 2, "not_set": 0 },
    "note_click_test": { "06": 1, "07": 4 },
    "landing_kotaro": 11, "landing_kotaro_by": { "threads": 7, "x": 2, "m_facebook_referral": 1, "test": 1 },
    "kotaro_click": 4,
    "base_reread": { "period": "2026-09-14〜2026-09-21", "landing_root": 52, "read_at": "2026-09-24" },   // 前回差の基準を今日読み直した値
    "excl": "着地は / 64＋/index.html 1＝65 から / の test 5・Sky google/organic 1 を引いて59 …"
  }
}
```

合計の作り方（図の「合計」）：`短縮リンク（yt+tt+x+ig+th の短縮リンク分）＋ハブ経由（note_click の合計）＋コタロウ→検証室（kt）`。SNS別の和と一致すること。

## kotaro — コタロウのnote（1回1行、ID＝REC）

```json
{ "rec": "…", "created": "…", "src": "…", "memo": "…",
  "imp": 11501, "pv": 560, "lk": 240, "lk_dash": 240, "cm": 3, "fw": 202, "fo": 166, "posts": 6,
  "imp_by": { "1": 3445, "2": 3275 }, "pv_by": { "1": 258 }, "lk_by": { "1": 119 } }   // 記事の番号は公開順
```

## accounts — 媒体ごとのフォロワー（1回5行、ID＝`<plat>-<REC>`）

`plat` は `yt`／`tt`／`x`／`ig`／`th`。`fw`＝フォロワー（YouTubeは登録者）、`fo`＝フォロー中（無ければ null）。`memo` に本数・合計・据え置きなど。

```json
{ "id": "tt-20260924-1630", "plat": "tt", "fw": 66, "fo": 4, "rec": "…", "created": "…", "src": "ブラウザ",
  "memo": "フォロワー66（9/23夜から+11）・いいね合計141・視聴合計14,334。#07画像投稿1,153→1,753" }
```

## posts — 投稿台帳（投稿1本1行、ID＝`<plat>-<YYYYMMDD-HHMM>`）

```json
{ "id": "tt-20260907-1810", "plat": "tt", "kind": "動画 0:45", "title": "ショート動画検証(Claude)",
  "url": "https://www.tiktok.com/@yokonarabi_lab/video/7682718152169458951",
  "pub": "2026-09-07T18:10:00+09:00", "art": "02", "link": "", "memo": "#02の成果物 Claude版", "src": "ブラウザ", "created": "…" }
```

`kind` の例：`ショート 0:46`／`動画 0:45`／`画像投稿`／`リール`／`カルーセル`／`本文＋返信3`／`Instagram共有`。`art` は記事番号（`01`…、不明なら null）。`link` は本文に貼った短縮リンクのスラッグ（無ければ空）。
消えた投稿は同じ内容で `posts_removed` に `set` し、`posts` から `delete`（`removed`・`reason` を足す）。

## snaps — 投稿別の数字（1回N行、ID＝`<post>_<REC>`）

共通6列：`views`／`likes`／`comments`／`reposts`／`saves`／`clicks`。無い項目は null。

```json
{ "id": "ig-20260909-2150_20260924-1630", "post": "ig-20260909-2150", "plat": "ig",
  "views": 118, "likes": 0, "comments": 0, "reposts": null, "saves": null, "clicks": null,
  "rec": "…", "created": "…", "src": "ブラウザ", "memo": "変化なし" }
```

## articles — 記事台帳（記事1本1行、ID＝`00`／`01`…／`r01`）

```json
{ "id": "07", "no": "#07", "title": "生成AI勢力図 | Claude Fable 5.1 vs GPT-6 Astra #07",
  "url": "https://note.com/yokonarabi_lab/n/nf56601f0b407", "pub": "2026-09-22T16:48:40+09:00",
  "sns": null, "note": "公開時刻はnote APIのpublish_at。ハブ追加17:01。GA4は note_click_07" }
```

`00` は自己紹介（番号なし、記事別では一番上）。`r01` は検証室レポート。新しい記事が出たら足す。

## shortlinks — 短縮リンク台帳（ID＝スラッグ）

`plat`（yt/tt/x/ig/th/kt）・`group`（profile/article）・`place`・`dest`・`art`・`issued`・`order`・`tag`・`note`。読むだけ。`kenshotk` は未登録（`tk` として扱う）。

## figures — 図版に使った数字（1回1行、ID＝REC）← このエージェントが追加

`figures/build.js` に渡した `data.json` をそのまま保存する。次回の前回差の基準になる（`meta/baseline` が指す行）。

`data.json` の形（`figures/data.example.json` が実物）：

```json
{
  "rec": "2026-09-24T16:30",                       // 集計時点（JST）。図の「時点」と N日目 に使う
  "sns":    { "media": [ { "name": "YouTube", "posts": 12, "views": 5048, "likes": 2, "followers": 6 }, … ] },   // 順番は YouTube・TikTok・X・Instagram・Threads。合計は自動（書けばそれが優先）
  "clicks": { "routes": [ { "name": "SNSの短縮リンク", "clicks": 78, "note": "9/14まで" },
                          { "name": "ハブページ経由", "clicks": 10, "note": "9/14から", "pre": "着地59のうち" },
                          { "name": "コタロウのnote記事から", "clicks": 9, "note": "note内" } ],
              "media":  [ { "name": "YouTube", "clicks": 11 }, …, { "name": "note（コタロウ）", "clicks": 9 }, { "name": "参照元なし", "clicks": 0 } ] },   // 00Minが読めなければ "clicks": null
  "note":   { "total": { "imp": 6256, "pv": 446, "likes": 27, "followers": 12, "posts": 9 }, "win": "8/28〜9/24", "fn_extra": "（任意の一言）",
              "articles": [ { "name": "自己紹介", "imp": 702, "pv": 49 }, { "name": "#01 ゲームアプリ", "imp": 1261, "pv": 178 }, … ] },   // 自己紹介が一番上、あとは番号順、最後にレポート
  "page":   { "use": { "sns": "…", "clicks": "…", "note": "…", "eyecatch": "…" } }   // 図版ページの各図の下に足す一言（任意）
}
```

- 前回差は `--baseline` に渡した前回の data.json（`figures/<基準ID>` を保存したもの）から、行の `name` で突き合わせて自動計算。前回に無い行は NEW。`d` を書けばそちらが優先
- 色・文字サイズ・列幅は build.js が決める。data.json に色を書かない
- 記事の名前は図に出る文字そのもの（`#07 生成AI勢力図` のように番号＋短い題）。前回と同じ名前にしないと NEW になる

## meta — 設定（`meta/baseline` の1行だけ）

```json
{ "figures": "20260924-1630", "label": "9/24 16:30の図（前回の記事）", "article": "https://note.com/kotarozero/n/…", "set_at": "2026-09-24T20:00:00+09:00" }
```

**エージェントは読むだけ。** Sky が記事を出したときに Sky の側（Cowork の Claude）が更新する。無ければ起動テキストの `基準：`、それも無ければ直前の `figures` の行を基準にし、報告に「基準は◯◯（meta/baseline が無いため）」と書く。

## handoffs — 引き継ぎ（1回1行、ID＝REC）← このエージェントが追加

`{ "rec", "created", "day", "md": "<引き継ぎのMarkdown全文>", "figures": true/false, "missing": ["00Min", "noteスクショ"] }`。プロジェクトdoc `横並び検証室/引き継ぎ_YYYY-MM-DD.md` に書ける場合も、ここに同じ内容を残す（Cowork の Claude が後で読む）。

## 書き込み（1回の batch で）

ArtifactData の `batch` に `writes: [{op:"set", collection:"records", doc_id:"<REC>", data:{…}}, …]` を最大50件ずつ。`snaps` が50を超えるので2〜3回に分ける。書いたあと `get` で1行読み返して確認する。
