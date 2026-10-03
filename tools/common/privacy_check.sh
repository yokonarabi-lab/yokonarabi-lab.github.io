#!/usr/bin/env bash
# 個人情報の混入チェック。
# コミットの作者情報と、リポジトリの全ファイルを調べる。1件でも見つかれば失敗（終了コード1）。
#
# 使い方:
#   bash tools/common/privacy_check.sh              … 全ブランチの全履歴＋今のファイル
#   bash tools/common/privacy_check.sh origin/main  … origin/main から先のコミット＋今のファイル
#
# 調べる文字列そのもの（名前・ハンドル）は、公開リポジトリなのでここには書かない。
# 代わりに「形」で見つける：許可していないメールアドレス、PCのフォルダの場所、chatgpt.site のURL。
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2

# 作者・コミッターに使ってよいメールアドレス（これ以外は失敗）
ALLOWED_AUTHOR='(@users\.noreply\.github\.com|^noreply@github\.com|^noreply@anthropic\.com|^yokonarabi\.lab@gmail\.com)$'
# ファイルの中に書いてあってよいメールアドレス
ALLOWED_IN_FILES='yokonarabi\.lab@gmail\.com|noreply@anthropic\.com|noreply@github\.com|users\.noreply\.github\.com'
# このファイル自身は検査から外す（パターンの説明が入っているため）
SELF='tools/common/privacy_check.sh'

fail=0
say() { printf '%s\n' "$*"; }

# 1) コミットの作者・コミッター
if [ $# -ge 1 ]; then range="$1..HEAD"; else range="--all"; fi
bad_authors=$(git log $range --format='%h %ae%n%h %ce' 2>/dev/null | sort -u | awk -v ok="$ALLOWED_AUTHOR" '$2 !~ ok {print $1}' | sort -u)
if [ -n "$bad_authors" ]; then
  fail=1
  say "NG 作者情報：許可していないメールアドレスのコミットがある（アドレスは表示しない）"
  for h in $bad_authors; do say "   - $h"; done
fi

# 2) PCのフォルダの場所（バイナリも含めて全ファイル）
hits=$(git grep -alE '/Users/[A-Za-z0-9._-]+/|[Cc]:\\Users\\[A-Za-z0-9._-]+|/home/[a-z][a-z0-9._-]+/(Documents|Desktop|Downloads)' -- . ":(exclude)$SELF" 2>/dev/null)
if [ -n "$hits" ]; then fail=1; say "NG フォルダの場所（/Users/… など）が入っているファイル"; printf '   - %s\n' $hits; fi

# 3) chatgpt.site のURL（アカウント名が入る）
hits=$(git grep -alE '[A-Za-z0-9-]+\.chatgpt\.site' -- . ":(exclude)$SELF" 2>/dev/null)
if [ -n "$hits" ]; then fail=1; say "NG chatgpt.site のURLが入っているファイル"; printf '   - %s\n' $hits; fi

# 4) 個人用メールアドレス（許可したもの以外）
hits=$(git grep -IohE '[A-Za-z0-9._%+-]+@(gmail|googlemail|yahoo|ymail|icloud|me|outlook|hotmail|live|docomo|ezweb|softbank|au)\.[A-Za-z.]+' -- . ":(exclude)$SELF" 2>/dev/null | grep -Ev "$ALLOWED_IN_FILES" | sort -u | wc -l | tr -d ' ')
if [ "$hits" != "0" ]; then
  fail=1; say "NG 許可していないメールアドレスが ${hits} 種類、ファイルの中にある（アドレスは表示しない）"
  git grep -IlE '[A-Za-z0-9._%+-]+@(gmail|googlemail|yahoo|ymail|icloud|me|outlook|hotmail|live|docomo|ezweb|softbank|au)\.[A-Za-z.]+' -- . ":(exclude)$SELF" | sed 's/^/   - /'
fi

if [ $fail -eq 0 ]; then say "OK 個人情報の混入は見つからなかった"; fi
exit $fail
