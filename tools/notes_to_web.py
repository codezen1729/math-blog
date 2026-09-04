"""Mechanical compatibility for the newly supplied lecture and lemma collections.

No mathematical claims or proof text are generated here. This runs only for
profiles carrying notes-format.json; legacy posts use their unchanged converter.
"""
import re

def argument(text, start, opener='{', closer='}'):
    assert text[start]==opener
    depth=1; end=start+1
    while end<len(text) and depth:
        if text[end]==opener and text[end-1]!='\\': depth+=1
        if text[end]==closer and text[end-1]!='\\': depth-=1
        end+=1
    if depth: raise ValueError('Unbalanced notes command')
    return text[start+1:end-1],end

def expand(text,name,convert,argc=1):
    pattern=re.compile(r'\\'+name+r'\s*(?=\{)')
    while m:=pattern.search(text):
        cursor=m.end(); args=[]
        for _ in range(argc):
            while cursor<len(text) and text[cursor].isspace(): cursor+=1
            value,cursor=argument(text,cursor); args.append(value)
        text=text[:m.start()]+convert(*args)+text[cursor:]
    return text

def roman(n):
    out=''
    for value,letters in [(1000,'m'),(900,'cm'),(500,'d'),(400,'cd'),(100,'c'),(90,'xc'),(50,'l'),(40,'xl'),(10,'x'),(9,'ix'),(5,'v'),(4,'iv'),(1,'i')]:
        while n>=value: out+=letters; n-=value
    return out

def preserve_lists(text):
    token=re.compile(r'\\(begin|end)\{(enumerate|itemize|description)\}|\\item\b|\\setcounter\{(enumi{1,4})\}\{(\d+)\}')
    stack=[]; out=[]; last=0
    for m in token.finditer(text):
        if m.start()<last: continue
        out.append(text[last:m.start()]); cursor=m.end(); replacement=m[0]
        if m[1]=='begin':
            options=''
            if cursor<len(text) and text[cursor]=='[': options,cursor=argument(text,cursor,'[',']')
            if m[2]=='enumerate':
                start=re.search(r'\bstart=(\d+)',options)
                label=re.search(r'\blabel=(.*?)(?:,(?:itemsep|leftmargin|start)=|$)',options)
                default=['\\arabic*.','(\\alph*)','\\roman*.','\\Alph*.'][min(3,sum(x['kind']=='enumerate' for x in stack))]
                stack.append(dict(kind='enumerate',n=int(start[1])-1 if start else 0,label=label[1] if label else default))
                replacement=r'\begin{description}'
            else:
                stack.append(dict(kind=m[2])); replacement=r'\begin{'+m[2]+'}'
        elif m[1]=='end':
            item=stack.pop(); assert item['kind']==m[2]
            replacement=r'\end{description}' if m[2]=='enumerate' else m[0]
        elif m[3]:
            levels=[x for x in stack if x['kind']=='enumerate']; index=len(m[3])-5
            assert 0<=index<len(levels),(m[0],levels)
            levels[index]['n']=int(m[4]); replacement=''
        elif stack and stack[-1]['kind']=='enumerate':
            level=stack[-1]; custom=None
            if cursor<len(text) and text[cursor]=='[': custom,cursor=argument(text,cursor,'[',']')
            if custom is None:
                level['n']+=1; n=level['n']; label=level['label']
                values={'arabic':str(n),'roman':roman(n),'Roman':roman(n).upper(),'alph':chr(96+n),'Alph':chr(64+n)}
                for command,value in values.items(): label=label.replace('\\'+command+'*',value)
            else: label=custom
            replacement=r'\item[{'+label+'}]'
        out.append(replacement); last=cursor
    out.append(text[last:]); assert not stack
    return ''.join(out)

def prepare(text):
    # Keep new collection behavior isolated from the previously published posts.
    text=re.sub(r'(?m)^\s*%.*$','',text)
    text=expand(text,'texorpdfstring',lambda display,plain:display,2)
    text=expand(text,'mbox',lambda value:value)
    text=expand(text,'unclear',lambda value:r'\textit{[unclear: '+value+']}')
    text=text.replace(r'\sourcegap',r'\textit{[unfinished in the source]}')
    text=expand(text,'SourceChapter',lambda key,title:r'\section*{'+title+'}',2)
    text=expand(text,'Lecture',lambda number,title:r'\section*{'+title+'}',2)
    text=preserve_lists(text)
    names={
        'theorem':'theorem', 'thm':'theorem',
        'lemma':'theorem', 'lem':'theorem',
        'proposition':'theorem', 'prop':'theorem',
        'corollary':'theorem', 'cor':'theorem',
        'conjecture':'theorem', 'prob':'theorem', 'task':'theorem',
        'numberedquestion':'theorem', 'numberedremark':'theorem',
        'definition':'definition', 'defn':'definition',
        'example':'example', 'namedtool':'namedtoolcounter',
        'cl':'cl', 'thmx':'thmx',
    }
    labels={
        'theorem':'Theorem', 'thm':'Theorem', 'thmx':'Theorem',
        'lemma':'Lemma', 'lem':'Lemma',
        'proposition':'Proposition', 'prop':'Proposition',
        'corollary':'Corollary', 'cor':'Corollary',
        'conjecture':'Conjecture', 'prob':'Problem', 'task':'Task',
        'numberedquestion':'Question', 'question':'Question', 'question*':'Question',
        'numberedremark':'Remark', 'remark':'Remark',
        'definition':'Definition', 'defn':'Definition', 'example':'Example',
        'namedtool':'Tool', 'cl':'Claim', 'claim':'Claim',
        'exercise':'Exercise', 'observation':'Observation',
    }
    unnumbered=['claim','remark','exercise','question','question*','observation','proof']
    environments=sorted([*names,*unnumbered],key=len,reverse=True)
    counter_names=sorted(set(names.values()),key=len,reverse=True)
    environment_pattern='|'.join(re.escape(name) for name in environments)
    counter_pattern='|'.join(re.escape(name) for name in counter_names)
    token=re.compile(r'\\setcounter\{('+counter_pattern+r')\}\{(\d+)\}|\\(begin|end)\{('+environment_pattern+r')\}')
    counters={key:0 for key in names.values()}; out=[]; last=0
    for m in token.finditer(text):
        if m.start()<last: continue
        out.append(text[last:m.start()]); cursor=m.end()
        if m[1]: counters[m[1]]=int(m[2]); replacement=''
        elif m[3]=='end': replacement='\n'
        else:
            title=''; env=m[4]
            if cursor<len(text) and text[cursor]=='[': title,cursor=argument(text,cursor,'[',']')
            elif env=='namedtool': title,cursor=argument(text,cursor)
            if env=='proof': replacement=r'\textit{'+(title if title else 'Proof')+'.}'
            else:
                label=labels[env]
                if env in names:
                    counter=names[env]; counters[counter]+=1
                    value=counters[counter]
                    label+=' '+(chr(64+value) if counter=='thmx' and 1 <= value <= 26 else str(value))
                if title: label+=' — '+title
                replacement=r'\subsection*{'+label+'}'
        out.append(replacement); last=cursor
    out.append(text[last:]); text=''.join(out)
    # Same tower cells and four equals signs; only the unsupported column syntax changes.
    text=re.sub(r'\\renewcommand\{\\arraystretch\}\{([^{}]*)\}',r'\\def\\arraystretch{\1}',text)
    def tower(m):
        body=m[1]
        body=re.sub(r'(?m)^(\s*(?:B|T\(B\)|T\^2\(B\)|T\^3\(B\))\s*)&',r'\1&=&',body)
        return r'\begin{array}{rcccccccc}'+body+r'\end{array}'
    text=re.sub(r'\\begin\{array\}\{r@\{\\,=\\,\}ccccccc\}(.*?)\\end\{array\}',tower,text,flags=re.S)
    text=text.replace(r'\lhook\joinrel\longrightarrow',r'\hookrightarrow')
    # Answer blanks have semantic width, unlike ordinary page spacing.
    text=re.sub(r'\\underline\{\\hspace\{([^{}]*)\}\}',r'\\underline{\\kern \1}',text)
    # A source uses vcenter only to vertically align a boxed math fraction.
    text=re.sub(r'\\vcenter\{\\hbox\{\$(.*?)\$\}\}',r'\1',text,flags=re.S)
    return text
