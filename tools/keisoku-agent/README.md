# keisoku-agent — 6媒体の数字を集めて記録する

生成AI横並び検証室の「SNS実験」の集計を自動化したもの。5つのSNS（YouTube・TikTok・X・Instagram・Threads）、GA4（ハブページ）、00Min（短縮リンク）、note（検証室・コタロウ）の数字を読み、ダッシュボード「note指標ログ」のDBに新しい行を足し、図版4枚を書き出して図版アーティファクトを差し替え、Skyのスマホに報告する。
**リポジトリは読むだけ。数字はDB、図はアーティファクト、報告は通知。** 共通の決まりは [`../common/conventions.md`](../common/conventions.md)。

このフォルダ：

| ファイル | 中身 |
|---|---|
| `README.md` | この手順書（1回の流れ・やらないこと） |
| [`sources.md`](sources.md) | 媒体ごとの読み方。画面のクセと回避策 |
| [`schema.md`](schema.md) | DBのコレクションと行の形、IDの規則、書き込みの例 |
| [`report.md`](report.md) | 報告（通知）の型と、引き継ぎの型 |
| [`figures/build.js`](figures/build.js) | `data.json` から図版4枚＋図版ページ（index.html）を書き出す |
| [`figures/data.example.json`](figures/data.example.json) | data.json の例（2026-09-24 16:30 の数字） |

## 前提

- **Macが起きていて、Claudeアプリが開いていること。** 5媒体・GA4はClaudeアプリ内のブラウザペイン（Skyのログインが残っている）で読む。ブラウザに届かなければ何も書かずに「Macに届かなかった」と報告して終了
- ダッシュボードのURL、図版アーティファクトのURL、noteスクショのフォルダの場所は**起動時の指示文にある**（このリポジトリには書かない）
- 起動時のテキストに指示が付くことがある：`記事：<noteのURL>`（前回に公開した記事。この記事の公開時刻の直前の集計を前回差の基準にし、`meta/baseline` を更新する）／`基準：YYYYMMDD-HHMM`（基準の行を直接指定。`記事：` より優先）／`noteスクショなし`（フォルダを見に行かない）／`図版なし`（DBの記録だけ）
- 00Min と note のログインは切れやすい。切れていたらその部分を null にして報告する（手動起動なら、Skyは起動の直前にログインしておく）

## 1回の流れ

0. **読む**：`tools/common/conventions.md` → この README → `sources.md` → `schema.md`。ブラウザペインを 1280×900 にする
1. **前回を読む（DB）**：`records`・`clicks`・`kotaro`・`accounts`・`snaps` の最新の行（`rec` が最大のもの）、`posts`（投稿台帳、全部）、`articles`（記事台帳）。**前回差の基準**は次の順で決める：①起動テキストの `基準：`／②起動テキストの `記事：<URL>` → その記事の公開時刻（`https://note.com/api/v3/notes/<key>` の `publish_at`、または `https://note.com/api/v2/creators/kotarozero/contents?kind=note&page=1` の `publishAt`）を読み、`figures` のうち **公開時刻より前で最新の行**を基準にして `meta/baseline` を `{ figures, label, article, set_at }` で更新する（このときだけ meta を書く）／③`meta/baseline`／④直前の `figures` の行（③④のときは報告に「基準は◯◯（理由）」と書く）。基準の行 `figures/<基準ID>` を `base.json` に保存する
2. **5媒体を読む**（`sources.md` の順：YouTube → TikTok → X → Instagram → Threads）。投稿ごとの数字、フォロワー、新しい投稿。新しい投稿は `posts` に足す（IDは公開時刻から）。消えていた投稿は `posts_removed` に移す。**X・Threadsのスレッドは1通目だけを1本と数える**（返信は数えない）
3. **GA4**（`sources.md`）：ハブ着地は**ランディングページ `/`＋`/index.html` の行だけ**（test・Sky自身を引く）、参照元別、`note_click_NN`（参照元別も）、`/kotaro/` と `kotaro_click`、そして**基準期間（9/14〜基準の集計日）の読み直し**
4. **00Min**：一覧（`sources.md`）。ログイン画面なら `links: null`。**読めなければクリックの図と見出し画像は作らない**（合計が出ないため。SNSの図とnoteの図だけ作る）
5. **note**：検証室のスキ（公開ページ）・フォロワー・フォロー・記事一覧、コタロウのスキ・フォロワー・フォロー。**インプレッションとページビューはSkyのスクショ**（フォルダの、前回の `rec` より新しいファイル。検証室は「アクセス状況」と「記事別」の2枚、コタロウは1〜2枚）。無ければ imp・pv は null、memo に「スクショなし」
6. **確認**：SNS別のクリック合計＝クリック合計、記事別の合計≒imp・pv（ダッシュボードの集計時刻の差で1〜2%はずれる）、投稿数＝台帳の本数、前回差の符号。合わなければ読み直す。それでも合わなければ memo に書いて報告に出す（数字を合わせるために変えない）
7. **REC を決める**：読み終えた時刻を10分単位に切り上げ（例 16:29 → `20260924-1630`）。日本時間
8. **DBに書く**（`schema.md`。1回の batch で）：`records/<REC>`・`clicks/<REC>`・`kotaro/<REC>`・`accounts/<plat>-<REC>`×5・`snaps/<post>_<REC>`×N・新しい `posts`・`figures/<REC>`（今回の data.json そのもの）・`handoffs/<REC>`（引き継ぎ、`report.md` の型）。**既存の行は書き換えない**
9. **図版**：`data.json` を作り（`figures/data.example.json` の形。数字はDBに書いたものと同じ）、
   `node tools/keisoku-agent/figures/build.js data.json --baseline base.json --out /tmp/figs` → `sns.png` `clicks.png` `note.png` `eyecatch.png` `index.html`。4枚を Read で開いて目で確認（数字・前回差・NEW・はみ出し）。図版アーティファクトを差し替える：まず Artifact で URL を読み（読まずに publish すると拒否される）、`index.html` を本体、4枚を `files` に付けて同じ URL に publish。**新しいアーティファクトを作らない**
10. **報告**（`report.md` の型）。プロジェクトdoc が書けるなら `横並び検証室/引き継ぎ_YYYY-MM-DD.md` にも同じ内容を書く（書けなくても `handoffs/<REC>` にある）

起動テキストに `図版なし` があれば 9 を飛ばす。ブラウザに届かなかったら 1 以降をやらない。

## やらないこと

- リポジトリに commit・push・PR をしない。`build.js` とテンプレを変えない（図の設計はSkyが確定したもの）
- 既存のDBの行を書き換えない・消さない。訂正は新しい行の memo と報告に書く（例外：消えていた投稿を `posts` → `posts_removed` に移すこと。移した旨を報告する）
- 読めなかった数字を 0 にしない、前回の値で埋めない、推定しない。null と memo
- パスワードを入れない。ログイン画面が出たら、その媒体は null にして報告する
- ブラウザで数字を読む以外の操作をしない（投稿・削除・設定・GA4の「保存」を押さない。GA4の鉛筆→保存はレポート設定を共有で壊す）
- 「N日目」「前回差の基準」「REC」の定義を変えない。`meta/baseline` を書くのは、起動テキストに `記事：` があったときだけ（それ以外は読むだけ）
- 図版アーティファクト・ダッシュボードの HTML やデザインを変えない。図版は同じ URL に差し替えるだけ
- 質問で止まらない。迷ったら null で残して、そう読んだと報告に書く

## 依存

- Node + `playwright`（未導入なら `npm i playwright`。Chromium は cloud に同梱 `/opt/pw-browsers/chromium`）。フォントは cloud に入っている（Noto Sans CJK JP・TeX Gyre Heros。`fc-list | grep -i "noto sans cjk"` で確認。無ければ `apt-get install -y fonts-noto-cjk fonts-texgyre`）
- ブラウザペイン（Macが起きていて Claude アプリが開いていること）。サイト許可は「今後も許可」で取ってある：YouTube Studio・X・Threads・Instagram・TikTok・00Min・GA4・note
- ArtifactData（DBの読み書き）、Artifact（図版の差し替え）、Read（スクショとPNGを目で見る）、Projects（引き継ぎを書く。無ければ `handoffs` だけ）

## 時間の目安

5媒体 30〜40分（Xは投稿を1本ずつ開くので本数に比例）、GA4 10分、00Min・note 10分、図版 5分。全体で約1時間。
