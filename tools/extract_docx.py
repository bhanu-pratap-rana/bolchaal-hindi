import docx,re,json,sys
from docx.oxml.ns import qn
d=docx.Document(sys.argv[1])
body=d.element.body
def ptext(p):
    out=[]
    for x in p.iter():
        tg=x.tag.split('}')[1]
        if tg=='t': out.append(x.text or '')
        elif tg in('br','cr'): out.append('\n')
        elif tg=='tab': out.append(' ')
    return ''.join(out)
def lines_of(cell):
    res=[]
    for p in cell.iter(qn('w:p')):
        for ln in ptext(p).split('\n'):
            ln=ln.strip()
            if ln: res.append(ln)
    return res
days=[];cur=None;seen_toc=False
for el in body.iterchildren():
    tag=el.tag.split('}')[1]
    if tag=='p':
        for t in [s.strip() for s in ptext(el).split('\n') if s.strip()]:
            m=re.match(r'^दिवस\s*[-–]\s*(\d+)\s*[:：]?\s*(.*)$',t)
            if m and seen_toc:
                cur={'day':int(m.group(1)),'title':m.group(2).strip(),'hi':[],'en':[],'post':[]}; days.append(cur); continue
            if cur is not None:
                if not cur['title']: cur['title']=t
                else: cur['post'].append(t)
    elif tag=='tbl':
        if not seen_toc: seen_toc=True; continue
        rows=el.findall(qn('w:tr')); cells=rows[1].findall(qn('w:tc'))
        cur['hi']=lines_of(cells[0]); cur['en']=lines_of(cells[1])
import os; os.makedirs(sys.argv[2],exist_ok=True)
tot=0
for x in days:
    json.dump(x,open(f"{sys.argv[2]}/d{x['day']:02d}.json","w"),ensure_ascii=False,indent=1)
    n=sum(1 for p in x['hi'] if re.match(r'^[^:：]{1,40}\s*[:：]',p)); ne=sum(1 for p in x['en'] if re.match(r'^[^:]{1,40}:',p)); tot+=n
    print(x['day'],x['title'][:40],'hi',len(x['hi']),'en',len(x['en']),'lines hi/en',n,ne)
print('approx dialogue lines',tot)
