# keisoku-agent — 6媒体の数字を集めて記録する

生成AI横並び検証室の「SNS実験」の集計を自動化したもの。5つのSNS（YouTube・TikTok・X・Instagram・Threads）、GA4（ハブページ）、00Min（短縮リンク）、note（検証室・コタロウ）の数字を読み、ダッシュボード「note指標ログ」のDBに新しい行を足し、図版4枚を書き出して図版アーティファクトを差し替え、Skyのスマホに報告する。
**リポジトリは読むだけ。数字はDB、図はアーティファクト、報告は通知。** 共通の決まりは [`../common/conventions.md`](../common/conventions.md)。

このフォルダ：

| ファイル | 中身 |
|---|---|
| `README.md` | この手順書（1回の流れ・やらないこと） |
| [`sources.md`](sources.md) | 媒体ごとに「どのページを、どの画面サイズで開いて、どのスクリプトを流すか」の表。数え方の決まり。動かないときの手での読み方 |
| [`readers/`](readers/) | 1ページ1回で数字を全部読むスクリプト（`javascript_tool` にそのまま渡す）。12本 |
| [`assemble.py`](assemble.py) | readers の結果＋DBの前回分から、DBに書く行・図版の data.json・報告・引き継ぎをまとめて作る |
| [`schema.md`](schema.md) | DBのコレクションと行の形、IDの規則、書き込みの例 |
| [`report.md`](report.md) | 報告（通知）の型と、引き継ぎの型 |
| [`figures/build.js`](figures/build.js) | `data.json` から図版4枚＋図版ページ（index.html）を書き出す |
| [`figures/data.example.json`](figures/data.example.json) | data.json の例（2026-09-24 16:30 の数字） |

## 前提

- **Macが起きていて、Claudeアプリが開いていること。** 5媒体・GA4はClaudeアプリ内のブラウザペイン（Skyのログインが残っている）で読む。ブラウザに届かなければ何も書かずに「Macに届かなかった」と報告して終了
- ダッシュボードのURL、図版アーティファクトのURL、noteスクショのフォルダの場所は**起動時の指示文にある**（このリポジトリには書かない）
- 起動時のテキストに指示が付くことがある：`基準：YYYYMMDD-HHMM`（前回差の基準の行を指定）／`noteスクショなし`（フォルダを見に行かない）／`図版なし`（DBの記録だけ）
- 00Min と note のログインは切れやすい。切れていたらその部分を null にして報告する（手動起動なら、Skyは起動の直前にログインしておく）

## 1回の流れ

**方針（2026-09-27〜）：探しながら読まない。** 読むのは `sources.md` の表のページと `readers/` のスクリプトだけ、組み立ては `assemble.py` だけ。
作業フォルダは `W=/tmp/keisoku`（`R=$W/readings`、`DB=$W/db`、`OUT=$W/out`）。

0. **読む**：`tools/common/conventions.md` → この README → `sources.md`（表の部分）。`schema.md`・`report.md` は必要なときだけ
1. **前回を読む（DB）**：ArtifactData を `out_dir` 付きで呼び、`$DB/<collection>/<doc_id>.json` に保存する（並べて同時に呼んでよい）
   - `list`：`posts`・`articles`・`shortlinks`・`kotaro`（それぞれ `query.limit: 1000`）
   - `get`：`meta/baseline`、その `figures` が指す `figures/<基準ID>`（起動テキストに `基準：` があればそちら。`記事：` なら公開時刻の直前の figures にして `meta/baseline` も更新）
   - `query`：`snaps` の前回分（`where: [["rec","==","<前回のrecのISO>"]]`、前回の rec は `kotaro` の最新行で分かる）
2. **読む（ブラウザ）**：`sources.md` の表の順に、#1〜#12 を「開く（と画面サイズ）→ スクリプトを実行 → 返り値を `$R/<スクリプト名>.json` に保存」。00Min を最初に読む（ログインが1時間もたない）。Instagram（#7）とThreads（#9）は実行の前に `computer` のスクロールで一覧の続きを読み込ませる（表のとおり）。返り値の本数が台帳より少なければ読み直す。終わったら `resize_window` を `desktop` に戻す
3. **noteのスクショ**：フォルダ（起動時の指示文）の、前回の `rec` より新しいファイルを `device_stage_files` → Read（チャットに貼られていればそれ）。数字を `$W/note_shots.json` に書く：
   ```json
   { "kensho": { "agg": "2026-09-27T11:52", "win": "8/31〜9/27", "imp": 9524, "pv": 603, "lk_dash": 74,
                 "by": { "00": {"imp": 1170, "pv": 95}, "01": {"imp": 1366, "pv": 182}, "r01": {"imp": 565, "pv": 42} } },
     "kotaro": { "agg": "2026-09-27T11:52", "imp": 13646, "pv": 642, "lk_dash": 292,
                 "by": { "1": {"imp": 3810, "pv": 282}, "7": {"imp": 427, "pv": 29} } },
     "names": { "08": "#08 おすすめベスト10" } }
   ```
   `by` は記事ID（`00`＝自己紹介、`01`〜、`r01`＝レポート）／コタロウは公開順の番号。`names` は新しい記事の図の行名（省略すると題から作る。長いときだけ書く）。スクショが無ければこのファイルを作らない
4. **組み立て**：`python3 tools/keisoku-agent/assemble.py --readings $R --db $DB --shots $W/note_shots.json --out $OUT`
   - REC は読んだ時刻の最大を10分単位に切り上げ（`--rec` で指定もできる）。N日目・前回差・クリックの合計・着地（`/` だけ、test と Sky を引く）・新しい投稿のID・スレッドのまとめ（1通目だけ）は全部ここでやる
   - 画面に出る「要確認」（`$OUT/checks.txt`）を読む。台帳にあるのに読めなかった投稿、新しい記事の行名、スクショと記事別の和のずれなど。直せるもの（`--shots` の書き漏れ等）は直して回し直す。直せないものは報告に出す
   - 新しい投稿の `art`（どの記事か）が「未確認」のものは、分かれば `$OUT/docs/posts__<ID>.json` の `art` を書き換えてよい（分からなければ null のまま）
5. **DBに書く**：`$OUT/writes_01.json`、`writes_02.json`… を1つずつ ArtifactData の `batch` の `writes` にそのまま渡す（1つ50件まで。中身はすべて新しい doc_id の set）。最後に `clicks/<REC>` を `get` して1行確かめる
6. **図版**：`CHROME=/opt/pw-browsers/chromium node tools/keisoku-agent/figures/build.js $OUT/data.json --baseline $OUT/base.json --out $W/figs` → 4枚を Read で開いて目で確認（数字・前回差・NEW・はみ出し）。図版アーティファクトを差し替える：まず Artifact で URL を読み（PNG も `paths` で読む。読まずに publish すると拒否される）、`index.html` を本体、4枚を `files` に付けて同じ URL に publish。**新しいアーティファクトを作らない**
7. **報告**：`$OUT/report.txt` の「図版：」の行を実際の結果に直して最後の出力にする（`report.md` の型）。`$OUT/handoff.md` に気づいたことを足して、プロジェクトdoc が書けるなら `横並び検証室/引き継ぎ_YYYY-MM-DD.md` にも書く（`handoffs/<REC>` には 5 で入っている）

起動テキストに `図版なし` があれば 6 を飛ばす。ブラウザに届かなかったら 1 以降をやらない。

## やらないこと

- リポジトリに commit・push・PR をしない。`build.js` とテンプレを変えない（図の設計はSkyが確定したもの）
- 既存のDBの行を書き換えない・消さない。訂正は新しい行の memo と報告に書く（例外：消えていた投稿を `posts` → `posts_removed` に移すこと。移した旨を報告する）
- 読めなかった数字を 0 にしない、前回の値で埋めない、推定しない。null と memo
- パスワードを入れない。ログイン画面が出たら、その媒体は null にして報告する
- ブラウザで数字を読む以外の操作をしない（投稿・削除・設定・GA4の「保存」を押さない。GA4の鉛筆→保存はレポート設定を共有で壊す）
- 「N日目」「前回差の基準」「REC」の定義を変えない。`meta/baseline` を動かさない（Skyが記事を出したときだけ、Skyの側で更新する）
- 図版アーティファクト・ダッシュボードの HTML やデザインを変えない。図版は同じ URL に差し替えるだけ
- 質問で止まらない。迷ったら null で残して、そう読んだと報告に書く

## 依存

- Node + `playwright`（未導入なら `npm i playwright`）。Chromium は cloud に同梱されているので `CHROME=/opt/pw-browsers/chromium` を付けて build.js を動かす（付けないと playwright の版違いで起動しないことがある）。フォントは cloud に入っている（Noto Sans CJK JP・TeX Gyre Heros。`fc-list | grep -i "noto sans cjk"` で確認。無ければ `apt-get install -y fonts-noto-cjk fonts-texgyre`）
- Python 3（`assemble.py`。標準ライブラリだけ）
- ブラウザペイン（Macが起きていて Claude アプリが開いていること）。サイト許可は「今後も許可」で取ってある：YouTube Studio・X・Threads・Instagram・TikTok・00Min・GA4・note
- ArtifactData（DBの読み書き）、Artifact（図版の差し替え）、Read（スクショとPNGを目で見る）、Projects（引き継ぎを書く。無ければ `handoffs` だけ）

## 時間の目安

ブラウザで読むのは12ページで約30回の呼び出し（15〜20分）。組み立て・DB書き込み・図版で10分。全体で25〜30分。
（2026-09-27の手作業では、探しながら読んで約1時間かかった。XとThreadsで1本ずつ開いたのが大半）
