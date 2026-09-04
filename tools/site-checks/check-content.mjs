import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import katex from 'katex';

const root = new URL('../', import.meta.url);
const publicRelease = process.argv.includes('--public');
if (publicRelease) {
  for (const path of ['_source/', '_withdrawn/', 'EDITORIAL_REVIEW.md', 'scripts/curation.json', 'public/manuscripts/']) {
    assert.ok(!existsSync(new URL(path, root)), `Private material in public release: ${path}`);
  }
}
for (const path of ['public/figures/research-statement/', 'public/manuscripts/research-statement/']) {
  assert.ok(!existsSync(new URL(path, root)), `Withdrawn research statement files are still served: ${path}`);
}
const posts = JSON.parse(readFileSync(new URL('lib/generated-posts.json', root), 'utf8'));
const expectedPublicPostCount = 84;
const bySlug = new Map(posts.map(post => [post.slug, post]));
const decode = value => value.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
const mathIssues=[];
const requiredPassages = {
  'vector-bundles': ['A paracompact Hasudorff space is normal and also admits a partition of unity'],
  'classification-vector-bundles': ['holds homotopic information about', 'is orthogonal'],
  'first-surgery': ['have no wandering Fatou components'],
  'locally-trivial-bundles': ['replacing points'],
};
let figures=0, equations=0;
assert.equal(bySlug.size, posts.length);
const essayCount = posts.filter(post=>post.track!=='Research').length;
assert.equal(essayCount,expectedPublicPostCount);
assert.equal(posts.length,expectedPublicPostCount);
assert.ok(!bySlug.has('research-statement'));
assert.ok(bySlug.has('mcmullens-surgery'));
assert.ok(bySlug.has('mcmullens-surgery-finite-symmetry'));
assert.equal(bySlug.get('mcmullens-surgery').order,bySlug.get('third-surgery').order+1);
assert.equal(bySlug.get('mcmullens-surgery-finite-symmetry').order,bySlug.get('mcmullens-surgery').order+1);
assert.equal(posts.filter(post=>post.phase===1).length,12);
assert.ok(bySlug.has('polynomial-like-maps-and-the-straightening-theorem'));
assert.ok(posts.filter(post=>post.phase===3).every(post=>post.phaseLabel==='K-theory'));
assert.ok(posts.filter(post=>post.phase===4).every(post=>post.phaseLabel==='Complex Dynamics'));
for(const post of posts) {
  assert.equal(typeof post.title, 'string', `${post.slug} has no source-derived title`);
  assert.ok(post.title.length > 0 && post.title === post.title.trim(), `${post.slug} has an invalid source-derived title`);
  assert.doesNotMatch(post.title, /[\r\n\\$]|<[^>]*>/, `${post.slug} has title markup that escaped conversion`);
  if (publicRelease) {
    assert.ok(!post.sourceUrl, `Full manuscript download in public release: ${post.slug}`);
    assert.ok(!/manuscripts\/|file:\/\/|\/Users\//.test(JSON.stringify(post)), `Private reference in ${post.slug}`);
  } else {
    const source=readFileSync(new URL(`_source/${post.sourcePath}`,root),'utf8');
    const lines=source.match(/[^\n]*\n|[^\n]+$/g);
    for (const segment of post.sourceSegments ?? [{source:post.sourcePath,start:post.sourceStart,end:post.sourceEnd,sha256:post.sourceSha256}]) {
      assert.equal(segment.source,post.sourcePath);
      const excerpt=lines.slice(segment.start-1,segment.end).join('');
      assert.equal(createHash('sha256').update(excerpt).digest('hex'),segment.sha256,post.slug);
    }
    assert.equal(readFileSync(new URL(`public/${post.sourceUrl}`,root),'utf8'),source);
  }
  assert.ok(post.wordCount > (post.editedSourceSha256 ? 0 : 250), `${post.slug} has no publishable text`);
  assert.equal(post.dek,'');
  assert.ok(post.excerptHtml === '' || post.html.includes(post.excerptHtml));
  assert.ok(!/the cited result|preserved in the linked TeX source|A technique-led field note/.test(post.html));
  if (!post.editedSourceSha256) {
    for(const passage of requiredPassages[post.slug] ?? []) assert.ok(decode(post.html).includes(passage), `Missing source passage in ${post.slug}: ${passage}`);
    if(post.slug==='classification-vector-bundles') assert.ok(post.html.includes('\\tag{1}'));
    if(post.slug==='bott-periodicity-k-theory') for(const n of [2,3,4]) assert.ok(post.html.includes(`\\tag{${n}}`));
  }
  for(const slug of post.prerequisites) assert.ok(bySlug.has(slug) && bySlug.get(slug).order<post.order,`Invalid prerequisite ${slug}`);
  for(const match of post.html.matchAll(/src="([^"]+)"/g)) {
    assert.ok(existsSync(new URL(`public/${decode(match[1])}`,root)),`${post.slug}: missing ${match[1]}`);
    figures++;
    if (match[1].includes('/diagram-') && match[1].endsWith('.svg')) {
      const svg=readFileSync(new URL('public/'+decode(match[1]),root),'utf8');
      assert.ok(/stroke=/.test(svg), post.slug+': diagram drawing commands missing');
      assert.ok(/transform=/.test(svg), post.slug+': diagram transforms missing');
    }
    if(match[1].startsWith('figures/complex-analysis/')) assert.ok(match[1].endsWith('.svg'), 'Complex analysis figures must remain vector graphics');
  }
  for(const match of post.html.matchAll(/<span class="math (inline|display)">([\s\S]*?)<\/span>/g)) {
    equations++;
    const raw=decode(match[2]).replace(/^(?:\\\[|\\\()/,'').replace(/(?:\\\]|\\\))$/,'');
    try { katex.renderToString(raw,{displayMode:match[1]==='display',throwOnError:true,strict:false,macros:{'\\xlongrightarrow':'\\xrightarrow','\\qed':'\\square','\\supp':'\\operatorname{supp}',...post.mathMacros}}); }
    catch(error) { mathIssues.push({slug:post.slug,math:raw.slice(0,100),error:error.message.slice(0,180)}); }
  }
}
console.log(JSON.stringify({posts:posts.length,essays:essayCount,figures,equations,checks:publicRelease?'public privacy, content, assets and typesetting':'source fidelity, content, assets and typesetting',result:mathIssues.length?'failed':'passed',mathIssues},null,2));
assert.equal(mathIssues.length,0,'All manuscript formulas should typeset without errors. This does not validate the mathematics.');
