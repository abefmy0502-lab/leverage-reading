import json,sys,urllib.parse
def svg(bg,fg,t1,t2,a):
    s=f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect width="200" height="300" fill="{bg}"/><rect x="12" y="12" width="176" height="276" fill="none" stroke="{fg}" stroke-opacity="0.35"/><text x="20" y="70" font-size="24" font-weight="700" fill="{fg}" font-family="serif">{t1}</text><text x="20" y="100" font-size="24" font-weight="700" fill="{fg}" font-family="serif">{t2}</text><text x="20" y="270" font-size="13" fill="{fg}" font-family="sans-serif">{a}</text></svg>'
    return 'data:image/svg+xml;charset=utf-8,'+urllib.parse.quote(s)
issue=svg('#1f5f5b','#eef6f3','イシューから','はじめよ','安宅和人')
ess=svg('#3d3a6b','#f1effa','エッセンシャル','思考','グレッグ・マキューン')
q1='答えを出す前に「本当に答えるべき問い（イシュー）」かを確かめる。忙しさの大半は、解かなくていい問いに取り組んでいることから来る。'
q2='「全部やる」はできない。やらないことを決めることが、いちばん大事な仕事。'
q3='チームの勝利が最優先。'
q4='読んだあとに自分用のメモを作り、何度も見返すのが本番。本を読むのは準備にすぎない。目的を決めてから読むと、必要なところが勝手に目に入ってくる。読む前に「この本で何を解決したいか」を一行書く。そして読み終えたら、一つだけ行動を決める。'
prefix=sys.argv[1]
cases=[
 dict(name=f'{prefix}-story-paper', line=q1, page=25, title='イシューからはじめよ', author='安宅和人', style='paper', format='story', coverSvg=issue),
 dict(name=f'{prefix}-story-night', line=q2, page=18, title='エッセンシャル思考', author='グレッグ・マキューン', style='night', format='story', coverSvg=ess),
 dict(name=f'{prefix}-story-cover', line=q3, page=95, title='1兆ドルコーチ', author='エリック・シュミット', style='cover', format='story'),
 dict(name=f'{prefix}-post-cover', line=q1, page=25, title='イシューからはじめよ', author='安宅和人', style='cover', format='post', coverSvg=issue),
 dict(name=f'{prefix}-post-paper-long', line=q4, page=None, title='レバレッジ・リーディング', author='本田直之', style='paper', format='post'),
 dict(name=f'{prefix}-post-night-short', line=q2, page=18, title='エッセンシャル思考 最少の時間で成果を最大にする', author='グレッグ・マキューン', style='night', format='post', coverSvg=ess),
]
print(json.dumps(cases, ensure_ascii=False))
