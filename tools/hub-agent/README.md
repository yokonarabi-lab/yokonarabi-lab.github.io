# hub-agent — 検証記事をハブに自動で載せる

生成AI横並び検証室のハブ `https://yokonarabi-lab.github.io/` に、noteの新しい検証記事を載せる作業を自動化したもの。
毎時のスケジュール実行（Claude）がこの手順で動く。**main には直接書かない。PR を作り、Sky がマージする。**

## 1回の流れ

1. ルーティン実行ならリポジトリはクローン済み（カレント）。手動なら `git clone --depth 1 https://github.com/yokonarabi-lab/yokonarabi-lab.github.io.git`（cloud から github.com には届く。github.io は届かない）
2. noteのRSS `https://note.com/yokonarabi_lab/rss` を WebFetch で読む（curl は届かない）。プロンプトは「`<item>` の数を数え、全 item の title / link / pubDate を出現順に全部」と明示する。**10件未満しか返ってこなければ読み落とし**なので、`?v=2` のようにクエリを変えて読み直す（2026-09-26 に1回目は2件しか返らなかった）。クリエイターページはJS描画なので WebFetch では読めない
3. 対象の決め方（**2026-10-07〜。note の題に `#NN` は付かない**。検証08以降は `題｜Claude … vs GPT-… ｜生成AI横並び検証室` の形。起動時のプロンプトに「題が `#NN` で終わる記事」とあっても、こちらを優先する）
   - 起動時に記事URLが渡されていれば、それが対象
   - 渡されていなければ、RSS の item のうち **題に `vs` を含み**（モデル同士の比較＝検証記事）、**URL の `n/nXXXX` が `index.html` に無いもの**が対象。無ければ終了（何もしない）
   - 題が「検証室レポート」を含むならレポート記事。**自動では載せず**、Sky に「レポートが出た。カードとレポート一覧の差し替えは手動」と知らせて終了（枠が違う。引き継ぎの「検証室レポート」参照）
   - 「自己紹介」など `vs` を含まない記事は載せない
   - 対象が2本以上なら公開の古い順に1本ずつ（PRは1本ずつ）
   - **番号は題から取らない。** `add_article.py --number auto` がハブの一覧の最大番号＋1を振る（検証11の次は12）。PR を作る前に、結果の `number` が記事本文の内容（「第N回」など）と食い違わないか見る
4. 記事本文を WebFetch で読み、**リード（1文・具体的な約束）と説明（80〜110字）**を書く。ルール：
   - リードは「読めば何が分かるか」を一文で。抽象的な問いではなく具体的な約束（例：「結局、どの媒体で何曜日の何時に配信するのがベストか。」）
   - 説明は「何を・どう比べたか」＋「かかった時間と、○○も比べました。」の型。過去の文言は `index.html` の `.desc` を見る
   - 数字・固有名詞は記事本文にあるものだけ。作らない
   - `"` と `<` を使わない
   - ハブの見出し（題）は note の題の最初の `｜`（または ` | `）より前の部分（例：`AI副業ランキング（受注編）｜Claude Fable 5.1 vs GPT-6 Astra ｜生成AI横並び検証室` → `AI副業ランキング（受注編）`）。前後の空白は削る
5. `python3 tools/hub-agent/add_article.py --number auto --title "…" --lead "…" --desc "…" --url https://note.com/yokonarabi_lab/n/nXXXX`
   - 出力の `number` が NN。以降のブランチ名・コミット文に使う
   - 題が長い（全角換算 9 文字超）と自動で一覧の行を2段組み（`.toc-tall`）にする
   - 題の末尾が全角かっこ（例：`（受注編）`）なら、かっこ部分を折り返さない（カード・一覧・紹介の3か所。検証09〜11 と同じ書き方）
6. `npm i playwright`（未導入なら）→ `node tools/hub-agent/check.js index.html /tmp/shots` が `ok: true` になること。落ちたら直す。**`toc` の食い込みなら `--tall yes` で 5 をやり直す**
7. ブランチ `claude/hub-NN` を切ってコミット（`index.html` だけ）。コミット文：`検証NN「題」をハブに追加`
8. `bash tools/hub-agent/open_pr.sh claude/hub-NN "検証NN「題」をハブに追加" body.md`
   - body.md には：記事URL／カードの文言（見出し・リード）／説明／`note_click_NN`／check.js の結果（`ok`, `ev`, `ctaBox`）／スクショは添付できないので「390×844で確認済み」とだけ
   - API で PR ができなければ compare URL が出るので、それを知らせる（Sky が「Create pull request」を押す）
9. Sky に通知：PR の URL、カードの文言、「マージすると1分ほどで本番」。**通知に載せる文言は Sky がその場で判断できる分量で**（見出し・リード・説明の3行）
10. Sky がマージしたあとの反映確認は、次の毎時実行で `origin/main` に `note_click_NN` があれば「反映済み」として扱う（Pages のキャッシュ確認は不要。9/20〜26 の経験上 main と一致すれば出ている）

## やらないこと

- `main` に push しない。`git push --force` しない。履歴を書き換えない
- `/chatgpt/` `/claude/` `/kotaro/` `pamphlet/` に触らない
- `index_1.html` は消さない（別途 Sky が消す）
- 既存記事の文言を変えない
- 管理者モード（`HUB_ADMIN` / `hub_admin`）、`data-reveal` の付け方、CSS を変えない（`add_article.py` が assert で守る）
- 同じ記事で PR を2本作らない：clone 時に `git ls-remote --heads origin 'claude/hub-*'` を見て、`claude/hub-NN` が既にあれば「PR待ち」として何もしない

## 文言の参考（既存）

| 検証 | 見出し | リード |
|---|---|---|
| 11 | AI副業ランキング（受注編） | 依頼を受けて納品する副業なら、どれか。受注の15候補を2つのAIが順位づけしました。 |
| 10 | AI副業ランキング（販売・物販編） | 月5万円を目指すなら、どの副業か。販売・物販の15候補を2つのAIが順位づけしました。 |
| 08 | 生成AI おすすめベスト10 | 結局、どのAIに課金すべきか。主要20サービスの最上位プランを2つのAIが順位づけしました。 |
| 07 | 生成AI勢力図 | 会議に出す資料の裏取り、AIに任せて自信を持って出せるか。 |
| 06 | SNS攻略法 | 結局、どの媒体で何曜日の何時に配信するのがベストか。 |

## 依存

- Python 3（標準ライブラリのみ）
- Node + `playwright`（Chromium は cloud に同梱 `/opt/pw-browsers/chromium`。無ければ `npx playwright install chromium`）
- push には、ルーティン（claude.ai/code/routines）またはセッションでこのリポジトリが選ばれていること（2026-09-26 に判明。選ばれていないと git proxy が 403）。ルーティンは既定で `claude/` で始まるブランチにしか push できないので、ブランチ名は `claude/hub-NN`
