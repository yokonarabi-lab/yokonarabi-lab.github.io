// note（検証室・コタロウ）のフォロワー・フォロー・記事一覧（スキ・コメント・公開時刻）を読む（1回）
// ページ: https://note.com/yokonarabi_lab （note.com のどのページでもよい。公開APIを fetch する）
// インプレッション・ページビューはここに無い（ダッシュボードはClaudeのブラウザで読めない）→ Skyのスクショ
// 返り値: { plat:'note', accounts:{ yokonarabi_lab:{fw, fo, notes, articles:[{key, title, pub, likes, comments}]}, kotarozero:{…} } }
const out = {};
for (const u of ['yokonarabi_lab', 'kotarozero']) {
  const c = (await (await fetch('/api/v2/creators/' + u)).json()).data || {};
  const arts = [];
  for (let p = 1; p <= 5; p++) {
    const r = (await (await fetch(`/api/v2/creators/${u}/contents?kind=note&page=${p}`)).json()).data || {};
    (r.contents || []).forEach(n => arts.push({ key: n.key, title: n.name, url: n.noteUrl, pub: n.publishAt, likes: n.likeCount, comments: n.commentCount }));
    if (r.isLastPage !== false) break;
  }
  out[u] = { fw: c.followerCount, fo: c.followingCount, notes: c.noteCount, likes_total: arts.reduce((a, x) => a + (x.likes || 0), 0),
             comments_total: arts.reduce((a, x) => a + (x.comments || 0), 0), articles: arts };
}
({ plat: 'note', read_at: new Date().toISOString(), accounts: out });
