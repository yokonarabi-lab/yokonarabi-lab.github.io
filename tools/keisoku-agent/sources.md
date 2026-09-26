# sources.md — 媒体ごとの読み方

Claudeアプリ内のブラウザペインで読む。Skyのログインが残っている前提（5媒体・GA4は残る。00Min・noteは切れやすい）。
共通：ペインを **1280×900** にしてから開く（狭いとモバイル版になり、PC版にしか出ない数字が消える）。数字は**DOMをJSで読む**（スクリーンショットは古い画面を返すことがある）。ログイン画面が出たら、その媒体は null にして次へ。パスワードは入れない。
読む順：YouTube → TikTok → X → Instagram → Threads → GA4 → 00Min → note（検証室）→ note（コタロウ）→ noteのスクショ。

投稿の数え方（全媒体共通）：
- **X・Threadsのスレッドは1通目だけを1本と数える。** 表示・再生も1通目の数字だけ。自分の返信は数えない
- 台帳（DB `posts`）に無い投稿が見つかったら新規。IDは `<plat>-<公開日時 YYYYMMDD-HHMM>`（日本時間）。公開時刻はできるだけ秒まで `pub` に入れる
- 台帳にあるのに媒体側で消えていたら `posts_removed` に移し、報告に書く（Skyが削除した可能性が高い。非公開になっているだけなら台帳に残して数える。YouTubeの9/6の1本目がその例＝非公開だが投稿数・視聴に含める。Skyの判断）
- 動画3媒体（YouTube・Instagram・TikTok）の新規投稿は「どの記事の動画か」を `art` に入れる（タイトル・キャプションから分かる範囲。分からなければ null、memo に「記事未確認」）

---

## YouTube（YouTube Studio）

- 本数と視聴回数：`https://studio.youtube.com/` → コンテンツ → **「ショート」タブ**（「動画」タブは空）。タブは JS で `click()` してから一覧を読む。ショート12本（2026-09-24時点）が全部出る
- 登録者数（`accounts.fw`）：Studio のダッシュボード、またはチャンネルページ。`fo` は null（YouTubeにフォロー数の概念が無い）
- 非公開の1本目（9/6、0:31）も本数・視聴に含める
- いいね・コメント：一覧の列にある。無い項目は null
- 新規投稿の公開時刻：動画ページ `https://www.youtube.com/shorts/<id>` を開き、JSで `ytInitialPlayerResponse.microformat.playerMicroformatRenderer.publishDate`（ISO、時刻付き）。取れなければ Studio の「公開日」（日付のみ）で `yt-YYYYMMDD-0000`、memo に「時刻未確認」
- 積み上げ表示（表示・再生の合計）は12本の視聴回数の和

## TikTok（TikTok Studio）

- 投稿別の視聴数：`https://www.tiktok.com/tiktokstudio/content`。**一覧はDOMに8行しか出ない。** 出し方は2つ：①「視聴数」の列見出しを **2回** `click()` して昇順にする（降順だと上位8本のまま）②一覧の内側のスクロール要素（`scrollHeight > clientHeight` の div。document ではない）に `scrollTop` を入れて下まで送ると旧8本も読める。並び替えが効かない日は②
- フォロワー・いいね合計：**公開プロフィール `https://www.tiktok.com/@yokonarabi_lab`** のほうが速くて確実（Studio はタブが切り替わらないことがある）。フォロー中の実数を `fo` に（2026-09-20から。以前は0で入れていた）
- 分析：`https://www.tiktok.com/tiktokstudio/analytics/overview` に動画の視聴・プロフィール表示・トラフィックソース（おすすめ／個人プロフィール／検索／フォロー中）・検索クエリ。記事の材料になるので memo に要点を残す
- 新規投稿の公開時刻：URLの動画ID（19桁）から **`(id >> 32)` が UNIX秒**（JSでは `BigInt(id) >> 32n`。2026-09-26に台帳4本で分単位まで一致を確認）
- 画像投稿（カルーセル）も1本に数える。#06・#07では画像投稿のほうが動画より伸びた（memo に残す）

## X

- 表示回数（投稿別）：**プロフィールのタイムラインは何度スクロールしても5件ほどで止まる。** 確実なのは、台帳のポストURLを1本ずつ開いて `aria-label`（「◯件の表示」）を読む方法。`browser_batch` で navigate＋JS を4〜5本ずつまとめると速い
- 速い方法（2026-09-24に使用）：プロフィールを開いたあと `read_network_requests` で `UserTweets`／`UserOriginalsTimeline`／`UserRepliesTimeline` のGraphQL応答を読むと、読み込まれた分の `views.count` がまとめて取れる。取れなかった分だけ1本ずつ開く
- フォロワー・フォロー：プロフィールのヘッダー。アカウントアナリティクスは X Premium 限定で使えない
- スレッドは1通目だけ。台帳の例外だった `x-20260910-2046` は 2026-09-20 に親（`x-20260910-2045`）へ統合済み
- 新規投稿の公開時刻：ポストIDから `((id >> 22) + 1288834974657)` ミリ秒（JSは BigInt）。ページを開かなくても計算できる
- 2026-09-20から本文に外部URLを載せていない（表示が伸びにくいため）。読むには関係ないが、`link` は空のまま

## Instagram

- 幅1280以上で開くこと（プロフィールのグリッドはモバイル版だと数字が出ない）
- 投稿別の再生数：**グリッドの再生数は2026-09-13からDOMに出ない**（innerText も textContent も空）。各投稿を開いて **「インサイトを見る」** を押す（JSで葉要素とその親を順に `click()`）。ビュー・いいね・コメント・保存・シェアが出る。カルーセルは公開12時間くらいはビューが「--」→ null
- 合計：**各投稿のインサイトを足した値を採用。** プロフェッショナルダッシュボード `https://www.instagram.com/accounts/insights/` の「過去30日間 閲覧」は新しい投稿が半日〜数日反映されない（9/23夜から止まった例あり）。参考値として memo に
- 投稿別の一覧 `https://www.instagram.com/accounts/insights/content/?media_type=all&metric=views&sort_by=highest&timeframe=30&view_type=list` は中身が innerText に出てこない。使わない
- フォロワー・フォロー：プロフィールのヘッダー
- 新規投稿の公開時刻：URLのショートコード（`/reel/XXXX/`）を64進数（`A-Za-z0-9-_`）で数値化し `(n >> 23) + 1314220021721` ミリ秒。**数十秒〜数分ずれる**（アップロード開始時刻のため）。分単位のIDには十分
- 削除された投稿の例：#06のカルーセル（`ig-20260919-2039`）は 2026-09-23 に Sky が削除 → `posts_removed`

## Threads

- 投稿別の閲覧数：各投稿のページ（台帳のURL）で「◯件の閲覧」。プロフィール一覧は無限スクロールが途中で止まり、古い投稿が読めないことがある
- **古い投稿が読めないときは前回の値を据え置き**、`accounts.memo` に「据え置きN本」と書く（Threadsだけの例外。2026-09-20時点で5本を据え置き中：70・47・10・8・52）
- いいね合計：インサイト（`https://www.threads.com/insights`、過去30日）の「インタラクション」から。閲覧・閲覧者も memo に
- フォロワー：プロフィール。`fo` は null（読めれば入れる）
- 1通目だけを数える。#07のスレッド（9/22 20:34）は1本で757
- 新規投稿の公開時刻：ショートコードを Instagram と同じ式で。**Threadsは表示時刻と完全一致する**

## GA4（ハブページ）

★ 全文は共通の決まりと同じ考え方。**ハブ着地は「ランディングページ `/`」でしか数えない**（2026-09-21に `/kotaro/` の分が混ざる間違いがあり、Skyの指示「二度と間違えない」）。

1. **画面の入り方**：ホームから `location.hash` を直接変えるとホームに戻される。ホームの「トラフィック獲得レポートを表示」の葉要素を JS で `click()`（親要素も含めて3段）してレポートに入り、左ナビ「ランディング ページ」の葉を同じく `click()` → `r=landing-page`。そこから `location.hash` の `params=_u..nav%3Dmaui%26_u.date00%3D20260914%26_u.date01%3DYYYYMMDD` を書き換える。イベントは同じ形で `r=top-events`、トラフィック獲得は `r=lifecycle-traffic-acquisition-v2`
2. **着地（`landing_root`）**：期間 9/14〜集計日。**`/` の行＋`/index.html` の行だけ**。`/kotaro/` `/chatgpt/` `/claude/` `(not set)` `（空）` は入れない
3. そこから引く：**`/`×`test / social` の行**（サイト全体のtestではない。2026-09-23 Sky決定）と Sky 自身（`google / organic`、市区町村「世田谷」に集中する分は Sky の確認アクセスとみるが、市区町村で引く判断はしない）。セカンダリディメンション「セッションの参照元/メディア」を足すと見える
4. **参照元別**：ランディングページのレポートにセカンダリ「セッションの参照元/メディア」を足して `/`（＋`/index.html`）の行だけ読む。トラフィック獲得の参照元別の表をそのまま使わない（コタロウの分が混ざる）。`clicks.ga4.sessions` には `/`＋`/index.html` の参照元別だけ（Sky の google/organic を除き、test は `test` キーに）
5. **noteへのクリック**：イベント `note_click_01〜NN`（イベント数。混ざらない）。参照元別は、イベントのレポートにセカンダリ「セッションの参照元/メディア」→ `note_click_NN × 参照元` の行。`test / social` の行は除外して `note_click_test` に別記。**参照元が `(not set)` の分は読者として数え、`not_set` に**（記事では「参照元なし」の行）
6. **コタロウ**：`/kotaro/` の行と `kotaro_click`。`landing_kotaro`・`landing_kotaro_by`・`kotaro_click` に分けて入れ、検証室の数字に足さない
7. **基準期間の読み直し**：GA4の数字は読んだ日で変わる（直近1〜2日分は後から増え、参照元が振り直される）。前回差の基準（9/14〜前回の記事の集計日）を**今日読み直して** `ga4.base_reread` に入れ、着地の前回差はこの値と比べる
8. 操作のコツ：セカンダリディメンションの「＋」は表の見出し行の「ディメンション選択ツールを開く」→ カテゴリ「トラフィック ソース」→「クロスチャネル」→ 葉「セッションの参照元 / メディア」を順に `click()`。行数は10行のままなので `aria-label="次のページ"` を `click()` して2ページ目以降も読む（イベント×参照元は6ページ）。ツアーのポップアップは `aria-label="閉じる"`。ペインが非表示だとクリックが効かないので JS で `click()`
9. **鉛筆（カスタマイズ）→「保存」を絶対に押さない**（レポート設定が共有で変わり、9/22に破損した例あり）

イベント名：`note_click_01〜NN`（記事別）、`note_click_top`（ヘッダー）、`note_click_footer`（下部CTA）、`note_click_foot_link`（フッター）、`kotaro_click`。パラメータ `article_id`・`link_position`（`spotlight`＝最上部の最新カード／`toc`＝一覧／`article`＝紹介文）。記事が増えたら `note_click_NN` も増える。

## 00Min（短縮リンク）

- 一覧：`https://00m.in/user/links`。**ログインは1時間ももたない。** ログイン画面なら `links: null` にして報告（手動起動なら Sky が直前にログインしておく）
- 各スラッグの**累計クリック**を `clicks.links` に。スラッグと媒体の対応は DB `shortlinks`（`kenshotk` は台帳に未登録。TikTok プロフィール→ハブ行き。`tk` に別記し、noteへのクリックには入れない）
- 集計：媒体別の短縮リンク（note行き）＝ `yt: kensho01yt`／`tt: kensho01tt`／`x: kensho01x+kensho02x+kensho03x+kenshox`／`ig: kensho01ig+kenshoig`／`th: kensho01th+kensho02th+kensho03th+kenshoth`／`kt: kenshokt`（コタロウ→検証室、note内）。記事別 `x01..x03`・`th01..th03`、プロフィール `xp`・`thp` も入れる
- 9/14からYouTube・Instagram・Xのプロフィール欄はハブURLに変わったので、それらの短縮リンクは止まっている。動くのは `kenshoth`（Threadsプロフィール→note）、`kenshokt`、`kenshotk` だけ
- ログは1年で消える。月1回は控える（memo）

## note（検証室 `yokonarabi_lab`）

- **ダッシュボード（`/dashboard`）はClaudeのブラウザで読めない**（数字を取る `graphql.note.com` が CORS で弾かれる）。インプレッション・ページビューは Sky のスクショ（下）
- スキ：**公開ページ（クリエイターページ）の値を正**にする（ダッシュボードの値とは時間差でずれる。両方入れる：`lk` 公開ページ・`lk_dash` スクショ）。記事別のスキは `https://note.com/api/v3/notes/lookup?keys=<key>,<key>&fields=key,like_count`（記事URLの `n/nXXXX` がキー）、または `https://note.com/api/v2/creators/yokonarabi_lab/contents?kind=note&page=1`（記事一覧。`likeCount`・`publishAt` も出る）
- フォロワー・フォロー：クリエイターページ `https://note.com/yokonarabi_lab`（ダッシュボードの「フォロワー増加」とは食い違う。実数はクリエイターページ）
- 記事数：クリエイターページの一覧。新しい記事があれば `articles` に足す（`pub` は API の `publishAt`）。「検証室レポート #NN」は `r01` のように ID を付ける
- `https://note.com/api/v1/stats/pv?filter=all&page=1&sort=pv` の `read_count` は旧「全体ビュー」相当で、新画面のページビューと定義が違う。図には使わない

## note（コタロウ `kotarozero`）

- スキ・フォロワー・フォロー・記事数：公開ページ `https://note.com/kotarozero`。記事別のスキは検証室と同じ API
- インプレッション・ページビュー：Sky のスクショ（下）
- 入れ物は `kotaro`（検証室の `records` に混ぜない）。コタロウ→検証室の経路は note 内の `kenshokt` 1本だけで、これは検証室側の `clicks` の内訳に入る

## note のスクショ（Sky が置く）

- 場所は起動時の指示文にある2つのフォルダ（検証室用と、コタロウ用。Macのデスクトップ）。前回の `rec` より新しいファイルが今回の分
- 検証室：「アクセス状況」（全体のインプレッション・ページビュー・スキ・コメント・フォロワー。**期間は過去28日間で固定**）と「記事別」の2枚。コタロウ：同じ形で1〜2枚
- 読み方：`device_stage_files` → `Read`。画面の「◯時◯分集計」を `agg` に、期間を `win` に。記事別は `imp01`…`pv01`… に。合計と記事別の合計は集計時刻の差で1〜2%ずれることがある（memo に書く。合わせるために変えない）
- 無ければ `imp`・`pv`・`imp0N`・`pv0N`・`lk_dash` を null、`src` に「スクショなし」。スキ・フォロワーは公開ページから入れる
- **注意（10/4以降）**：過去28日間の窓が 8/28〜 の全期間と一致するのは 10/4 まで。それ以降は「過去28日間」の値が全期間より小さくなる。扱いは Sky の決定待ち（決まるまでは過去28日間のまま記録し、memo に注記）
