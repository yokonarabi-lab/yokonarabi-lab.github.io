#!/usr/bin/env bash
# ブランチを push して PR を作る。GitHub API が使えなければ compare URL を出す（Skyが1タップで PR 化）。
#   bash open_pr.sh <branch> <title> <body-file>
# 前提: カレントがリポジトリのクローン、対象ブランチにコミット済み。main には触らない。
set -euo pipefail
BRANCH="$1"; TITLE="$2"; BODY_FILE="$3"
REPO="yokonarabi-lab/yokonarabi-lab.github.io"

git push -u origin "$BRANCH" 2>&1 | tail -3

COMPARE="https://github.com/$REPO/compare/main...$BRANCH?expand=1"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  python3 - "$BRANCH" "$TITLE" "$BODY_FILE" <<'EOF' && exit 0
import json, os, sys, urllib.request
branch, title, body_file = sys.argv[1:4]
body = open(body_file, encoding='utf-8').read()
req = urllib.request.Request(
    'https://api.github.com/repos/yokonarabi-lab/yokonarabi-lab.github.io/pulls',
    data=json.dumps({'title': title, 'head': branch, 'base': 'main', 'body': body}).encode(),
    headers={'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'], 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'},
    method='POST')
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
        print(json.dumps({'pr': d['html_url'], 'number': d['number']}))
except Exception as e:
    print(json.dumps({'pr': None, 'error': str(e)[:200]}))
    sys.exit(1)
EOF
fi
echo "{\"pr\": null, \"compare\": \"$COMPARE\"}"
