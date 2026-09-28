# sources.md — 媒体ごとの読み方

**2026-09-27から、読むのは `readers/` のスクリプトだけ。** 1ページにつき「開く → スクリプトを1回実行 → 結果をファイルに保存」。
探しながら読むと1時間かかる（9/27の実測）。ここに書いてあるページとスクリプト以外で読もうとしない。スクリプトが動かなくなったときだけ、下の「うまくいかないとき」を見る。

共通：
- Claudeアプリ内のブラウザペインで開く。Skyのログインが残っている（00Min・noteのダッシュボードは切れやすい）。ログイン画面が出たらパスワードは入れず、その媒体は null
- **ビューポートの高さが大事。** X・Instagram・Threads は縦が短いと一覧が途中で止まる（画面に描かれた分しか読み込まれない）。表の「画面」の列のとおり `resize_window` してから開く。終わったら `preset: "desktop"` に戻す
- **Instagramのプロフィール（#7）とThreadsのインサイト（#9）は、続きが「本物のスクロール」でしか読み込まれない**（2026-09-28確認。JSの `scrollTo`・`scrollTop`・`WheelEvent` では来ない）。`computer` の `screenshot` を1回撮ってから、`computer` の `scroll` で一覧の上をスクロールする（`browser_batch` でまとめてよい）。読んだ本数（`n`）が台帳の本数に届いているかを必ず見る
- スクリプトは `javascript_tool` にファイルの中身をそのまま渡す（先頭の `const` を書き換えるものだけ書き換える）。返ってきたJSONを `R/<ファイル名>.json` に保存する（例 `R/x_profile.json`）
- 数字を読むだけ。投稿・削除・設定・保存ボタンを押さない。Instagramの非公開API（`/api/v1/...`）を直接たたかない（9/27に429＝回数制限が返った）

## 読む順番と1回ずつの手順

| # | 媒体 | 開くページ | 画面 | スクリプト | 取れるもの |
|---|---|---|---|---|---|
| 1 | 00Min | `https://00m.in/user/links` | そのまま | `min00.js` | スラッグ別の累計クリック。ログイン切れなら `login:false`（最初に読む。1時間もたない） |
| 2 | YouTube | `https://studio.youtube.com/channel/UC/videos/short` | そのまま | `yt_studio.js` | 全ショートのID・尺・視聴回数・コメント。`UC` は自分のチャンネルに自動で飛ぶ |
| 3 | YouTube | `https://www.youtube.com/` | そのまま | `yt_public.js` | いいね・公開時刻（秒まで）・登録者数。**先頭の `IDS` と `CHANNEL` を #2 の結果に書き換える** |
| 4 | TikTok | `https://www.tiktok.com/tiktokstudio/content` | そのまま | `tt_studio.js` | 全投稿のID・日時・尺・視聴・いいね・コメント（内側のスクロールを送りながら集める。`n` と `total_on_page` が同じなら全件） |
| 5 | TikTok | `https://www.tiktok.com/@yokonarabi_lab` | そのまま | `tt_profile.js` | フォロワー・フォロー中・いいね合計・画像投稿のID（fetchでは確認ページが返るので開いて読む） |
| 6 | X | `https://x.com/yokonarabi_lab` | **1280×9999** | `x_profile.js` | 全ポスト（自分の返信を含む）の表示回数・いいね、フォロワー・フォロー。9/6の1本目まで1回で出る |
| 7 | Instagram | `https://www.instagram.com/yokonarabi_lab/` | **1280×1000** | `ig_profile.js` | 全投稿の shortcode・公開時刻（taken_at）・種類・カルーセルの枚数・いいね・コメント、フォロワー・フォロー（画面の裏のデータを読む）。**最初は12件。** 実行の前に screenshot → scroll（上に3・下に10）→ 4秒待つ。返り値の `n` が `total_on_header` と同じなら全件 |
| 8 | Instagram | `https://www.instagram.com/accounts/insights/content/?media_type=all&metric=views&sort_by=highest&timeframe=90&view_type=card` | **1280×8000** | `ig_insights.js` | 全投稿のビュー（再生数）。並び順を切り替えて裏の通信を読む。`timeframe=90`＝過去90日に公開した投稿（12/5までは全部入る） |
| 9 | Threads | `https://www.threads.com/insights` | **1280×900** | `th_insights.js` | 全投稿（1通目だけ）の再生数・いいね・返信・再投稿。アイコンの形でどの数字か見分ける。**最初は10件。** 実行の前に screenshot → 左の一覧の上で scroll 下に10 → 6秒待つ → 上に3 → 下に10 → 6秒、で10件ずつ増える。`n` が台帳の Threads の本数に届くまでくり返す |
| 10 | Threads | `https://www.threads.com/@yokonarabi_lab` | そのまま | `th_profile.js` | フォロワー |
| 11 | GA4 | `https://analytics.google.com/analytics/web/` | そのまま（desktop） | `ga4.js` | 着地（`/`＋`/index.html`）と参照元別・基準期間の読み直し・`note_click` の記事別と参照元別・コタロウ。**先頭の `TO`（集計日）と `BASE_TO`（基準の集計日）を書き換える**。画面遷移もスクリプトの中でやる |
| 12 | note | `https://note.com/yokonarabi_lab` | そのまま | `note_api.js` | 検証室・コタロウのフォロワー・フォロー・記事一覧（スキ・コメント・公開時刻） |

ブラウザの呼び出しは合計およそ30回（開く12回＋実行12回＋画面サイズ＋#7・#9のスクロール）。これで全部。

## 数え方の決まり（スクリプトと assemble.py が守っているもの）

- **X・Threadsのスレッドは1通目だけを1本と数える**（表示・再生も1通目の数字）。Threadsのインサイト一覧は最初から1通目だけ。Xは `assemble.py` が「同じアカウントが120秒以内に続けて出したポストは直前の1通目への返信」とみなしてまとめる
- 台帳（DB `posts`）に無い投稿は新規。IDは `<plat>-<公開日時 YYYYMMDD-HHMM>`（日本時間）。公開時刻：YouTube＝publishDate、TikTok＝動画IDの上位32bit、X＝ポストIDから計算、Instagram＝taken_at、Threads＝shortcodeから計算
- 台帳にあるのに一覧に無い投稿は、`assemble.py` が null の snaps を作って checks に出す。**削除かどうかはSkyに確認してから** `posts_removed` に移す（非公開なだけなら台帳に残して数える。YouTubeの9/6の1本目は非公開だが数える＝Skyの判断）
- 台帳の Threads `th-20260910-2047`／`th-20260910-2238` のURLは返信（2通目）を指している。`assemble.py` の `TH_ALIASES` で1通目に読み替えている
- 動画3媒体の新規投稿の `art`（どの記事の動画か）は `assemble.py` が題・キャプションから推測する。推測できないものは null で、引き継ぎに「art 未確認」と出る
- YouTubeのいいねは9/27から全ショートを読んでいる（それまではStudioの一覧に列が無く1本分だけだった）。Threadsのいいねも9/27から（それまでは0で入っていた）
- Instagramの保存数・シェア数は一覧に無いので null（9/27から）。要るときだけ各投稿のインサイト `https://www.instagram.com/insights/media/<メディアID>/`（shortcodeを64進数で数値化した値）を開く

## GA4（ハブページ）— 数え方の★

`ga4.js` がやっていること（`GA4_集計向けメモ.md` と同じ。変えない）：

1. **ハブ着地は「ランディングページ `/`＋`/index.html`」でしか数えない**（2026-09-21に `/kotaro/` が混ざる間違いがあった。Skyの指示「二度と間違えない」）
2. そこから **`/`×`test / social` の行**と Sky 本人の `google / organic`（9/17の1件。`assemble.py` の `SKY_GOOGLE_KNOWN`）を引く。google/organic がそれより増えたら、増えた分は読者として着地に入れて checks に出す
3. 参照元別（`sessions`）も `/` と `/index.html` の行だけ。キーは `youtube`・`instagram`・`direct`・`yahoo`・`m_facebook_referral` の形（これまでのDBと同じ）
4. `note_click_NN` はイベント数。`test / social` を除いて記事別・参照元別に。**`(not set)` は読者として `not_set`**（図の「参照元なし」）
5. 参照元が **`(not set)`** の行は「◯◯ / ◯◯」の形をしていないので、`ga4.js` は別に拾う（2026-09-28に直した。それまで note_click_08×(not set) を読み落としていた）
6. **基準期間（9/14〜`BASE_TO`）を今日読み直した着地**を `base_reread` に入れ、着地の前回差はこれと比べる（GA4は後から数字が増え、参照元が振り直されるため）
7. コタロウ（`/kotaro/` の着地と `kotaro_click`）は別に入れる。検証室の数字に足さない
8. レポートの鉛筆→「保存」は押さない（URLの hash で表示だけ変えている）

## note のスクショ（Sky が置く）

- noteのダッシュボード（インプレッション・ページビュー）はClaudeのブラウザで読めない（`graphql.note.com` がCORSで弾かれる）。Skyのスクショで読む
- 置き場所は起動時の指示文にある2つのフォルダ、またはチャットに直接貼る。検証室は「アクセス状況」と「記事別」の2枚、コタロウも同じ形で2枚。**期間は過去28日間**
- 読んだ数字を `note_shots.json` に書く（形は README）。記事別は記事ID（`00`＝自己紹介、`01`〜、`r01`＝レポート）、コタロウは公開順の番号（`1`〜）で
- 無ければ `--shots` を付けずに `assemble.py` を回す（imp・pv が null になる）
- **注意（10/4以降）**：過去28日間の窓が全期間と一致するのは 10/4 まで。それ以降の扱いは Sky の決定待ち（決まるまでは過去28日間のまま記録し、memo に注記）

---

## うまくいかないとき（手で読む方法）

スクリプトが空や null を返したときだけ。直ったら `readers/` のスクリプトを直すPRを Cowork から出す。

- **YouTube**：Studio の「ショート」タブ（「動画」タブは空）。いいねは Studio のダッシュボード「最新のショート動画のパフォーマンス」にも出る
- **TikTok**：一覧が8行しかDOMに出ない。内側のスクロール要素（`scrollHeight > clientHeight` の div）の `scrollTop` を150pxずつ送る。「視聴数」の見出しの並び替えは効かない日がある
- **X**：縦が短いとタイムラインが5件で止まる。`resize_window` の上限は 9999。それでも足りなければ台帳のURLを1本ずつ開いて `aria-label`（「◯件の表示」）を読む（`browser_batch` で navigate＋JS を5本ずつ）。検索（`from:`）はこのアカウントでは結果が出ない。GraphQL を自分で呼ぶと404（トランザクションIDが要る）
- **Instagram**：プロフィールのグリッドの再生数はDOMに出ない。投稿別のインサイトは `https://www.instagram.com/insights/media/<メディアID>/` を直接開けば読める（ボタンを押さなくてよい）。プロフェッショナルダッシュボードの「過去30日間 閲覧」は新しい投稿の反映が半日〜数日遅れるので使わない
- **Instagram・Threadsの一覧が途中で止まる**（プロフィール12件・インサイト10件）：JSでスクロールしても続きは来ない。`computer` の `screenshot` を撮ってから `scroll`（下に10）→ 数秒待つ → 上に3 → 下に10。下の端でくるくる（読み込み中）が出たら、待ってから上下に送り直すと次の10件が来る
- **Threads**：投稿ページの先頭の「表示N回」がその投稿の再生数（返信のページだと返信の数字になる）。いいねは投稿ページの「アクティビティを見る」→「「いいね！」N」。インサイトの投稿別ページ（`/insights/post/…`）は中身が描かれないことがある
- **GA4**：ホームから hash を直接変えるとホームに戻される。ホームの「トラフィック獲得レポートを表示」→ 左ナビ「ランディング ページ」の葉を JS で `click()` してから hash を変える。セカンダリディメンションは hash の `_r.explorerCard..seldim=["landingPageMinusQueryString","sessionSourceMedium"]`、行数は `_r.explorerCard..rowsPerPage=100`
- **00Min**：ログインは1時間もたない。切れていたら `links: null`。クリックの図と見出し画像は作らない（`build.js` が自動でそうする）
- **note**：`https://note.com/api/v2/creators/<id>/contents?kind=note&page=1`（記事一覧・スキ・公開時刻）、`/api/v2/creators/<id>`（フォロワー）。`/api/v1/stats/pv` の `read_count` は旧「全体ビュー」相当で新画面のページビューと定義が違うので使わない
