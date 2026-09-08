import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import katex from 'katex';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist-pages');
const shell = readFileSync(join(out, 'index.html'), 'utf8');
if (shell.includes('name="blog-route"')) throw new Error('Static pages are already present. Run the Vite build before regenerating them.');
const posts = JSON.parse(readFileSync(join(root, 'lib/generated-posts.json'), 'utf8'));
const figureDescriptions = JSON.parse(readFileSync(join(root, 'lib/figure-descriptions.json'), 'utf8'));
const canonicalRoot = (process.env.SITE_URL?.trim() || 'https://codezen1729.github.io/math-blog/').replace(/\/+$/, '') + '/';

const series = [
  {slug:'k-theory',title:'K-theory',phase:3},
  {slug:'dynamics',title:'Complex Dynamics',phase:4},
  {slug:'surfaces-and-curves',title:'Surfaces and Curves',phase:2},
  {slug:'standard-tools',title:'Standard Tools in Complex Analysis',phase:1},
  {slug:'commutative-algebra',title:'Commutative Algebra',phase:5},
  {slug:'ergodic-theory',title:'Ergodic Theory',phase:6},
  {slug:'lemma-book',title:'Lemma Book (Olympiad Days)',phase:7},
  {slug:'miscellaneous',title:'Miscellaneous',phase:8},
];
const essays = posts.filter(post => post.track !== 'Research');
const bySlug = new Map(essays.map(post => [post.slug, post]));
const groupFor = post => series.find(item => item.phase === post.phase);
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const text = value => String(value).replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();
const decode = value => String(value).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(Number.parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number.parseInt(n,10)));
const macros = {'\\C':'\\mathbb{C}','\\R':'\\mathbb{R}','\\Q':'\\mathbb{Q}','\\Z':'\\mathbb{Z}','\\N':'\\mathbb{N}','\\D':'\\mathbb{D}','\\T':'\\mathbb{T}','\\qed':'\\square'};

function renderMath(source, sourceMacros={}) {
  return source.replace(/<span class="math (inline|display)">([\s\S]*?)<\/span>/g,(full,mode,encoded)=>{
    const displayMode=mode==='display'; const decoded=decode(encoded.trim());
    const pairs=displayMode?[['\\[','\\]'],['$$','$$']]:[['\\(','\\)'],['$','$']];
    const pair=pairs.find(([a,b])=>decoded.startsWith(a)&&decoded.endsWith(b));
    const formula=pair?decoded.slice(pair[0].length,-pair[1].length):decoded;
    try { return `<span class="math ${mode}">${katex.renderToString(formula,{displayMode,throwOnError:false,strict:false,macros:{...macros,...sourceMacros}})}</span>`; }
    catch { return full; }
  });
}

function cleanArticle(post) {
  let html=renderMath(post.html,post.mathMacros);
  html=html.replace(/href="#\/post\/([^?"#]+)(?:\?ref=([^"#]+))?"/g,(_m,slug,ref)=>`href="post/${slug}/${ref?`#${encodeURIComponent(decodeURIComponent(ref))}`:''}"`);
  html=html.replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi,'');
  let n=0;
  html=html.replace(/<img\b([^>]*)>/gi,(full,attrs)=>{
    const src=decode(attrs.match(/src="([^"]+)"/)?.[1]||''); if(!src)return full;
    n++; const description=figureDescriptions[src]||`Mathematical diagram ${n} accompanying ${post.title}.`;
    const clean=attrs.replace(/\salt="[^"]*"/i,'');
    return `<a class="figure-zoom" href="${esc(src)}" target="_blank" rel="noreferrer" aria-label="Enlarge: ${esc(description)}"><img${clean} alt="${esc(description)}"></a>`;
  });
  return html;
}

const recommendations = [
  ['Sketches of Topology','https://sketchesoftopology.wordpress.com/'],['Geometry and the imagination','https://lamington.wordpress.com/'],['The n-Category Café','https://golem.ph.utexas.edu/category/'],["What's new",'https://terrytao.wordpress.com/'],["Gowers's Weblog",'https://gowers.wordpress.com/'],['Azimuth','https://johncarlosbaez.wordpress.com/'],['And Other Withered Stumps Of Time','https://witheredstumps.wordpress.com/'],['Sebastian Raschka','https://sebastianraschka.com/'],['Andrej Karpathy blog','https://karpathy.github.io/'],["Lil'Log",'https://lilianweng.github.io/'],['Proofs and Prompts','https://proofsandprompts.com/'],['Combinatorics and more','https://gilkalai.wordpress.com/'],['Low Dimensional Topology','https://ldtopology.wordpress.com/'],['Math Scholar','https://mathscholar.org/'],['mathematical musings','https://matthewkahle.wordpress.com/page/2/'],
];

function header() { return `<header class="blog-masthead"><div class="blog-masthead-title"><a href="blog/">The Iteration Café<span>a math blog by S. Viswanathan</span></a></div><nav class="blog-navigation" aria-label="Primary navigation"><a href="blog/">All posts</a><a href="lab/">Laboratory</a><a class="blog-personal-link" href="https://sites.google.com/view/viswanathan1729/navigate">Personal webpage <span aria-hidden="true">↗</span></a></nav></header>`; }
function footer(){ return `<footer class="blog-footer"><p>The Iteration Café · S. Viswanathan</p><nav aria-label="Footer"><a href="rss.xml">RSS</a><a href="https://sites.google.com/view/viswanathan1729/navigate">Personal webpage ↗</a></nav></footer>`; }
function frame(body){return `<div class="site-background standalone-blog"><a class="skip-link" href="#main-content">Skip to the article</a><div class="weblog-page">${header()}${body}${footer()}</div></div>`;}

function sidebar(active){
  const entries=active?essays.filter(post=>post.phase===active.phase):[];
  return `<aside class="journal-sidebar"><section><h2>Search</h2><button class="journal-search-button">Search the blog</button></section><section><h2>Topics</h2><ul class="journal-topics"><li><a href="blog/">All posts <span>${essays.length}</span></a></li>${series.map(item=>`<li><a href="series/${item.slug}/">${esc(item.title)}<span>${essays.filter(post=>post.phase===item.phase).length}</span></a></li>`).join('')}</ul></section>${active?`<details class="journal-disclosure journal-series" open><summary><h2>In this series</h2></summary><ol class="journal-contents">${entries.map(post=>`<li><a href="post/${post.slug}/">${esc(post.title)}</a></li>`).join('')}</ol></details>`:''}<details class="journal-disclosure" open><summary><h2>Blog Recommendations</h2></summary><ul class="journal-topics journal-blogroll">${recommendations.map(([title,url])=>`<li><a href="${url}" target="_blank" rel="noopener noreferrer">${esc(title)}</a></li>`).join('')}</ul></details></aside>`;
}

function blogPage(active,page=1){
  const selected=active?essays.filter(post=>post.phase===active.phase):essays; const pageCount=Math.ceil(selected.length/6); const shown=selected.slice((page-1)*6,page*6);
  return frame(`<main id="main-content" class="journal-page"><div class="journal-content">${active?'<a class="journal-back" href="blog/">← Blog</a>':''}<header class="journal-heading ${active?'':'journal-index-heading'}"><h1>${esc(active?.title||'All posts')}</h1></header><div class="journal-columns">${sidebar(active)}<div class="journal-feed">${shown.map(post=>{const group=groupFor(post);const part=essays.filter(item=>item.phase===post.phase).findIndex(item=>item.slug===post.slug)+1;return `<article class="journal-entry"><header><h2><a href="post/${post.slug}/">${esc(post.title)}</a></h2><p class="journal-meta">S. Viswanathan · <a href="series/${group.slug}/">${esc(group.title)}</a> · Part ${part}</p></header><div class="journal-excerpt">${renderMath(post.excerptHtml,post.mathMacros)}</div><a class="journal-read-more" href="post/${post.slug}/">Continue reading →</a></article>`;}).join('')}${pageCount>1?`<nav class="journal-pagination" aria-label="Blog pages">${page>1?`<a href="${active?`series/${active.slug}`:'blog'}/page/${page-1}/">← Previous page</a>`:'<span></span>'}<span>${page} / ${pageCount}</span>${page<pageCount?`<a href="${active?`series/${active.slug}`:'blog'}/page/${page+1}/">Next page →</a>`:'<span></span>'}</nav>`:''}</div></div></div></main>`);
}

function tocFor(html){return [...html.matchAll(/<h([2-4])\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi)].map(match=>({level:Number(match[1]),id:decode(match[2]),title:text(match[3])}));}
function articlePage(post){
  const group=groupFor(post);const sequence=essays.filter(item=>item.phase===post.phase);const at=sequence.findIndex(item=>item.slug===post.slug);const previous=sequence[at-1];const next=sequence[at+1];const article=cleanArticle(post);const toc=tocFor(article);
  const background=[...post.prerequisites.map(slug=>bySlug.get(slug)).filter(Boolean).map(item=>`<a href="post/${item.slug}/">${esc(item.title)}</a>`),...(post.background||[]).map(esc)].join(' · ');
  return frame(`<main id="main-content" class="article-page"><div class="article-content"><div class="article-breadcrumb"><a href="series/${group.slug}/">← ${esc(group.title)}</a><span>Part ${at+1} of ${sequence.length}</span></div><article><header class="article-header"><p class="kicker">Part ${String(at+1).padStart(2,'0')}</p><h1>${esc(post.title)}</h1><p class="post-meta"><span>${esc(group.title)}</span><span>${post.minutes} min read</span></p></header>${background?`<aside class="reading-background"><strong>Background</strong><p>${background}</p></aside>`:''}<div class="article-layout"><details class="article-toc"><summary>On this page</summary>${toc.length?`<ol>${toc.map(item=>`<li class="toc-level-${item.level}"><a href="#${encodeURIComponent(item.id)}">${esc(item.title)}</a></li>`).join('')}</ol>`:'<span>This passage has no internal headings.</span>'}</details><div class="article-prose">${article}</div></div><nav class="article-next-prev" aria-label="Adjacent essays">${previous?`<a href="post/${previous.slug}/"><span>← Previous</span><strong>${esc(previous.title)}</strong></a>`:'<span></span>'}${next?`<a href="post/${next.slug}/"><span>Next →</span><strong>${esc(next.title)}</strong></a>`:`<a href="blog/"><span>Continue →</span><strong>Explore the other series</strong></a>`}</nav></article></div></main>`);
}

function legacyRedirect(){return `<script>(function(){if(!location.hash.startsWith('#/'))return;var value=location.hash.slice(2),parts=value.split('?'),page=parts[0];while(page.endsWith('/'))page=page.slice(0,-1);if(page==='path'||page==='archive')page='blog';else if(page.startsWith('path/'))page='blog/'+page.slice(5);else if(page.startsWith('archive/'))page='blog/'+page.slice(8);if(!page||page==='home'||page==='recommendations')page='blog';var q=new URLSearchParams(parts[1]||''),ref=q.get('ref'),track=q.get('track'),tracks={'complex analysis':'standard-tools','riemann surfaces':'surfaces-and-curves','elliptic curves':'surfaces-and-curves','abelian functions':'surfaces-and-curves','surfaces and curves':'surfaces-and-curves','structures':'k-theory','k-theory':'k-theory','complex dynamics':'dynamics','thermodynamic formalism':'ergodic-theory','commutative algebra':'commutative-algebra','ergodic theory':'ergodic-theory','the lemma book':'lemma-book','lemma book (olympiad days)':'lemma-book','miscellaneous':'miscellaneous'};q.delete('ref');if(page==='blog'&&track&&tracks[track.toLowerCase().trim()]){page='series/'+tracks[track.toLowerCase().trim()];q.delete('track');}else if(page.startsWith('blog/'))page='series/'+page.slice(5);var number=q.get('page'),seriesPage=page.startsWith('series/')&&page.indexOf('/',7)<0;if(number&&Number.isInteger(Number(number))&&Number(number)>1&&(page==='blog'||seriesPage)){page+='/page/'+number;q.delete('page');}var dest=page+'/',rest=q.toString();if(rest)dest+='?'+rest;if(ref)dest+='#'+encodeURIComponent(ref);location.replace(new URL(dest,document.baseURI));})();</script>`;}
function replaceMeta(page,attribute,key,content){
  const matcher=new RegExp(`<meta\\s+${attribute}="${key}"[^>]*\\/?>(?:\\s*)`,'i');
  const tag=`<meta ${attribute}="${key}" content="${esc(content)}" />\n    `;
  return matcher.test(page)?page.replace(matcher,tag):page.replace('</head>',`    ${tag}</head>`);
}
function removeMeta(page,attribute,key){return page.replace(new RegExp(`\\s*<meta\\s+${attribute}="${key}"[^>]*\\/?>`,'gi'),'');}
function writePage(relative,route,title,description,body,base,useSiteImage=true){
  const directory=relative?join(out,relative):out;mkdirSync(directory,{recursive:true});const canonical=new URL(relative?`${relative.replace(/\/+$/,'')}/`:'.',canonicalRoot).href;
  // Fragment-only hrefs resolve against <base>, not the current article.
  body=body.replace(/href="#(?!\/)([^"]*)"/g,(_full,fragment)=>`href="${relative ? `${relative}/` : './'}#${fragment}"`);
  let page=shell
    .replace(/\s*<link\s+rel="canonical"[^>]*>/gi,'')
    .replace(/\s*<meta\s+property="og:url"[^>]*>/gi,'')
    .replace('<head>',`<head>\n    <base href="${base}">\n    <meta name="blog-route" content="${esc(route)}">`)
    .replace(/<title>[\s\S]*?<\/title>/,`<title>${esc(title)}</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?\/>/,`<meta name="description" content="${esc(description)}" />`)
    .replace('</head>',`    <link rel="canonical" href="${canonical}">\n    <meta property="og:url" content="${canonical}">\n  </head>`)
    .replace('<div id="root"></div>',`<div id="root">${body}</div>`)
    .replace('<script type="module"',`${legacyRedirect()}\n    <script type="module"`);
  page=replaceMeta(page,'property','og:title',title);
  page=replaceMeta(page,'property','og:description',description);
  page=replaceMeta(page,'property','og:type',useSiteImage?'website':'article');
  page=replaceMeta(page,'name','twitter:title',title);
  page=replaceMeta(page,'name','twitter:description',description);
  page=replaceMeta(page,'name','twitter:card',useSiteImage?'summary_large_image':'summary');
  if(!useSiteImage) for(const [attribute,key] of [['property','og:image'],['property','og:image:alt'],['property','og:image:width'],['property','og:image:height'],['name','twitter:image'],['name','twitter:image:alt']]) page=removeMeta(page,attribute,key);
  writeFileSync(join(directory,'index.html'),page);
}

rmSync(join(out,'post'),{recursive:true,force:true});rmSync(join(out,'series'),{recursive:true,force:true});rmSync(join(out,'blog'),{recursive:true,force:true});rmSync(join(out,'lab'),{recursive:true,force:true});
writePage('', 'blog', 'The Iteration Café', 'Mathematical writing by S. Viswanathan.', blogPage(), './');
writePage('blog','blog','All posts · The Iteration Café','All mathematical posts by S. Viswanathan.',blogPage(),'../');
for(let page=2;page<=Math.ceil(essays.length/6);page++)writePage(`blog/page/${page}`,`blog?page=${page}`,`All posts, page ${page} · The Iteration Café`,'More mathematical posts by S. Viswanathan.',blogPage(undefined,page),'../../../');
for(const group of series){writePage(`series/${group.slug}`,`blog/${group.slug}`,`${group.title} · The Iteration Café`,`${group.title}: mathematical posts by S. Viswanathan.`,blogPage(group),'../../');const count=Math.ceil(essays.filter(post=>post.phase===group.phase).length/6);for(let page=2;page<=count;page++)writePage(`series/${group.slug}/page/${page}`,`blog/${group.slug}?page=${page}`,`${group.title}, page ${page} · The Iteration Café`,`${group.title}: more mathematical posts by S. Viswanathan.`,blogPage(group,page),'../../../../');}
for(const post of essays){const description=text(post.excerptHtml).slice(0,260);writePage(`post/${post.slug}`,`post/${post.slug}`,`${post.title} · The Iteration Café`,description,articlePage(post),'../../',false);}
writePage('lab','lab','Laboratory · The Iteration Café','Interactive experiments in complex dynamics and algebraic correspondences.',frame('<main id="main-content" class="lab-page"><div class="blog-laboratory-content"><header class="journal-heading"><h1>Laboratory</h1></header><p class="article-loading">Opening the interactive experiments…</p></div></main>'),'../');

const xml=value=>esc(value).replaceAll("'",'&apos;');
writeFileSync(join(out,'rss.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>The Iteration Café</title><link>${xml(canonicalRoot)}</link><description>Mathematical writing by S. Viswanathan.</description>${essays.map(post=>`<item><title>${xml(post.title)}</title><link>${xml(new URL(`post/${post.slug}/`,canonicalRoot).href)}</link><guid isPermaLink="true">${xml(new URL(`post/${post.slug}/`,canonicalRoot).href)}</guid><description>${xml(text(post.excerptHtml))}</description></item>`).join('')}</channel></rss>\n`);
const allPageCount=Math.ceil(essays.length/6);
const paths=['', 'blog/', 'lab/',...Array.from({length:Math.max(0,allPageCount-1)},(_,index)=>`blog/page/${index+2}/`),...series.flatMap(item=>{const count=Math.ceil(essays.filter(post=>post.phase===item.phase).length/6);return [`series/${item.slug}/`,...Array.from({length:Math.max(0,count-1)},(_,index)=>`series/${item.slug}/page/${index+2}/`)];}),...essays.map(post=>`post/${post.slug}/`)];
writeFileSync(join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path=>`<url><loc>${xml(new URL(path,canonicalRoot).href)}</loc></url>`).join('')}</urlset>\n`);
writeFileSync(join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml',canonicalRoot).href}\n`);
writeFileSync(join(out,'404.html'),shell.replace('<div id="root"></div>',`<div id="root">${frame('<main id="main-content" class="not-found-page"><div class="not-found"><h1>Page not found</h1><p>The requested essay is not in the archive.</p><a href="blog/">Return to the blog</a></div></main>')}</div>`));
console.log(`Generated ${essays.length} article pages, ${series.length} series, RSS and sitemap.`);
