// Real-Time News - client-side static app
// Notes:
// - Uses Google News RSS search feeds for topic queries.
// - First tries rss2json public endpoint; if blocked/fails, falls back to CORS proxy (allorigins) + XML parse.
// - For production: use a server-side proxy or RSS-to-JSON service with an API key to avoid CORS & rate limits.

// Sections and queries
// --- Theme Toggle ---
/* ---------- configuration ---------- */
const FEEDS = [
  { id: 'latest', label: 'Latest', queries: ['UPSC', 'IAS', 'Civil Services', 'Current Affairs'] },
  { id: 'editorial', label: 'Editorials', queries: ['editorial OR opinion OR "op-ed"'] },
  { id: 'schemes', label: 'Schemes', queries: ['Government Schemes OR "government scheme" OR "govt scheme"'] },
  { id: 'pib', label: 'PIB', queries: ['Press Information Bureau OR PIB OR "Press Information Bureau of India"'] }
];

const MAX_ITEMS_PER_SECTION = 20;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
const rss2jsonBase = 'https://api.rss2json.com/v1/api.json?rss_url=';
const corsProxy = 'https://api.allorigins.win/raw?url='; // fallback

/* ---------- UI elements ---------- */
const sectionsNav = document.getElementById('sectionsNav');
const newsArea = document.getElementById('newsArea');
const searchInput = document.getElementById('searchInput');
const darkToggle = document.getElementById('darkToggle');
const clockEl = document.getElementById('clock');
const toTopBtn = document.getElementById('toTopBtn');

let allArticles = []; // flattened
let activeSection = 'latest';

/* ---------- build nav from FEEDS (ensures clicking tabs works) ---------- */
function buildNav(){
  sectionsNav.innerHTML = '';
  FEEDS.forEach(feed => {
    const btn = document.createElement('button');
    btn.className = 'section-pill' + (feed.id === activeSection ? ' active' : '');
    btn.textContent = feed.label;
    btn.dataset.section = feed.id;
    btn.addEventListener('click', async () => {
      // set active and re-render (we fetch all in background; but to be fresh, call fetchSection)
      setActiveSection(feed.id);
      await fetchSection(feed.id);
      render();
    });
    sectionsNav.appendChild(btn);
  });
}
function setActiveSection(id){
  activeSection = id;
  document.querySelectorAll('.section-pill').forEach(p=>p.classList.remove('active'));
  const btn = document.querySelector(`.section-pill[data-section="${id}"]`);
  if(btn) btn.classList.add('active');
}

/* ---------- feed helpers ---------- */
function googleNewsRss(q){
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

async function fetchFeedViaRss2Json(rssUrl){
  try{
    const url = rss2jsonBase + encodeURIComponent(rssUrl);
    const res = await fetch(url);
    if(!res.ok) throw new Error('rss2json failed');
    const json = await res.json();
    if(json && Array.isArray(json.items)) return json.items.map(normalizeRss2JsonItem);
    throw new Error('invalid rss2json payload');
  }catch(e){
    return await fetchFeedViaProxyXml(rssUrl);
  }
}

async function fetchFeedViaProxyXml(rssUrl){
  const proxyUrl = corsProxy + encodeURIComponent(rssUrl);
  const res = await fetch(proxyUrl);
  if(!res.ok) throw new Error('proxy fetch failed');
  const text = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');
  const items = Array.from(xml.querySelectorAll('item')).map(parseXmlItem);
  return items;
}

function normalizeRss2JsonItem(item){
  const content = item.content || item.content_encoded || item.description || '';
  return {
    title: item.title || '',
    link: item.link || '',
    content,
    description: item.description || item.contentSnippet || stripHtml(content).slice(0,1000),
    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
    source: (item.source && item.source.title) || (item.author) || extractDomain(item.link),
    image: (item.thumbnail || (item.enclosure && item.enclosure.link) || extractImageFromContent(content) || '')
  };
}

function parseXmlItem(node){
  const title = node.querySelector('title')?.textContent || '';
  const link = node.querySelector('link')?.textContent || '';
  const description = node.querySelector('description')?.textContent || '';
  const pubDate = node.querySelector('pubDate')?.textContent || new Date().toISOString();
  const media = node.querySelector('media\\:content, enclosure, media');
  let image = '';
  if(media){
    image = media.getAttribute('url') || media.getAttribute('src') || media.textContent || '';
  }
  image = image || extractImageFromContent(description);
  return { title, link, content: description, description: stripHtml(description).slice(0,1000), pubDate, source: extractDomain(link), image };
}

/* ---------- utilities ---------- */
function extractImageFromContent(html){
  if(!html) return '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}
function stripHtml(html){ return (html||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim(); }
function extractDomain(url){ try{ const u=new URL(url); return u.hostname.replace('www.',''); }catch(e){ return ''; } }
function placeholderImage(text){ const s = encodeURIComponent((text||'news').slice(0,28)); return `https://via.placeholder.com/800x450.png?text=${s}`; }
function formatTimeAgo(dateStr){
  const date = new Date(dateStr);
  if(isNaN(date)) return '';
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff/1000);
  if(sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec/60);
  if(min < 60) return `${min}m ago`;
  const hr = Math.floor(min/60);
  if(hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr/24);
  if(days < 7) return `${days}d ago`;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/* ---------- fetching: full and per-section ---------- */
async function fetchAll(){
  showLoading(true);
  try{
    const promises = [];
    for(const section of FEEDS){
      for(const q of section.queries){
        const rssUrl = googleNewsRss(q);
        promises.push(fetchFeedViaRss2Json(rssUrl).then(items=>({sectionId: section.id, items})).catch(()=>({sectionId: section.id, items:[]})));
      }
    }
    const results = await Promise.all(promises);
    const grouped = {};
    results.forEach(r => { grouped[r.sectionId] = (grouped[r.sectionId] || []).concat(r.items || []); });

    allArticles = [];
    for(const section of FEEDS){
      const items = grouped[section.id] || [];
      const normalized = items.map(it => it.title ? it : normalizeRss2JsonItem(it));
      const unique = dedupeByLinkOrTitle(normalized);
      unique.sort((a,b)=> new Date(b.pubDate) - new Date(a.pubDate));
      const limited = unique.slice(0, MAX_ITEMS_PER_SECTION);
      // attach section id on each
      limited.forEach(it => it.section = section.id);
      allArticles.push(...limited);
    }
    render();
  }catch(e){
    console.error('fetchAll error', e);
  }finally{
    showLoading(false);
  }
}

// fetch only one section (used when clicking a tab to refresh that category)
async function fetchSection(sectionId){
  showLoading(true);
  try{
    const section = FEEDS.find(f=>f.id===sectionId);
    if(!section) return;
    const promises = section.queries.map(q => fetchFeedViaRss2Json(googleNewsRss(q)).catch(()=>[]));
    const results = await Promise.all(promises);
    let items = [];
    results.forEach(arr => items = items.concat(arr || []));
    items = items.map(it => it.title ? it : normalizeRss2JsonItem(it));
    const unique = dedupeByLinkOrTitle(items);
    unique.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
    const limited = unique.slice(0, MAX_ITEMS_PER_SECTION);
    // remove old articles from this section in allArticles, then add new ones
    allArticles = allArticles.filter(a => a.section !== sectionId);
    limited.forEach(it => { it.section = sectionId; allArticles.push(it); });
    // keep global sort
    allArticles.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
  }catch(e){
    console.error('fetchSection error', e);
  }finally{
    showLoading(false);
  }
}

function dedupeByLinkOrTitle(items){
  const seen = new Set(); const out = [];
  for(const it of items){
    const key = (it.link || it.title || '').trim();
    if(!key) continue;
    if(seen.has(key)) continue;
    seen.add(key); out.push(it);
  }
  return out;
}

/* ---------- render ---------- */
function render(){
  const q = (searchInput.value||'').trim().toLowerCase();
  const filtered = allArticles.filter(a=>{
    if(activeSection && activeSection !== 'latest' && a.section !== activeSection) return false;
    if(q){
      const hay = `${a.title} ${a.description} ${a.source}`.toLowerCase();
      return hay.includes(q);
    }
    return true;
  });
  filtered.sort((x,y)=> new Date(y.pubDate) - new Date(x.pubDate));
  newsArea.innerHTML = '';
  if(filtered.length === 0){
    newsArea.innerHTML = `<div class="card" style="grid-column:1/-1;padding:18px;text-align:center;color:var(--muted)">No stories matched. Try clearing search or wait a moment while feeds load.</div>`;
    return;
  }
  for(const item of filtered){
    newsArea.appendChild(createCard(item));
  }
}

/* ---------- create card (summary + MCQ, no external link) ---------- */
function createCard(item){
  const el = document.createElement('article'); el.className='card';

  const img = document.createElement('img'); img.className='media';
  img.alt = item.title || 'news image';
  img.loading = 'lazy';
  img.src = item.image || extractImageFromContent(item.content) || placeholderImage(item.title);
  el.appendChild(img);

  const content = document.createElement('div'); content.className='card-content';
  const title = document.createElement('h3'); title.textContent = item.title || 'Untitled';
  content.appendChild(title);

  const summary = document.createElement('p'); summary.className='snippet';
  summary.textContent = generateSummary(item.title + '. ' + (item.description || item.content || ''));
  content.appendChild(summary);

  const mcq = document.createElement('div'); mcq.className='mcq';
  mcq.innerHTML = generateMCQ(item);
  content.appendChild(mcq);

  const meta = document.createElement('div'); meta.className='meta';
  const left = document.createElement('div'); left.className='source'; left.textContent = item.source || 'Source';
  const right = document.createElement('div'); right.className='time'; right.textContent = formatTimeAgo(item.pubDate);
  meta.appendChild(left); meta.appendChild(right);
  content.appendChild(meta);

  el.appendChild(content);
  return el;
}

/* ---------- basic summary generator (~120-140 words) ---------- */
function generateSummary(text){
  const clean = stripHtml(text);
  const words = clean.split(/\s+/).filter(Boolean);
  // target between 110 - 140 words. If shorter, return entire text.
  if(words.length <= 140) return clean;
  const slice = words.slice(0, 130).join(' ');
  return slice.trim() + '...';
}

/* ---------- simple rule-based MCQ generator (client-side) ---------- */
function generateMCQ(item){
  // Create a simple MCQ from title + short heuristics.
  const title = item.title || '';
  const nouns = extractKeywords(title);
  // options (one correct + 3 distractors)
  const correct = nouns[0] || 'Policy/Program';
  const distractors = [
    nouns[1] || 'Judicial decision',
    nouns[2] || 'International report',
    nouns[3] || 'Economic measure'
  ];
  // shuffle distractors so correct always option (a) for clarity? we'll place correct as (b) randomly
  const opts = [correct, ...distractors];
  // simple shuffle while keeping correctness index
  const choices = shuffleArray(opts);
  const correctIndex = choices.indexOf(correct);
  const letters = ['(A)','(B)','(C)','(D)'];
  const explanation = `Correct: ${letters[correctIndex]} — ${correct}. Explanation: This news item primarily concerns ${correct.toLowerCase()} and is relevant for GS Paper II/III depending on context.`;
  // assemble HTML
  let html = `<strong>UPSC-style MCQ:</strong><br><small>Based on headline</small><br><ol style="margin:6px 0 0 18px">`;
  for(let i=0;i<4;i++) html += `<li>${choices[i] || 'Not applicable'}</li>`;
  html += `</ol><div style="margin-top:8px;font-style:italic;color:var(--muted)">${explanation}</div>`;
  return html;
}

function extractKeywords(text){
  // very small heuristic: return capitalized words or split by punctuation
  if(!text) return [];
  const caps = Array.from(text.matchAll(/\b([A-Z][a-zA-Z]{2,})\b/g)).map(m=>m[1]);
  const words = caps.length ? caps : text.replace(/[^a-zA-Z ]/g,' ').split(/\s+/).slice(0,6);
  return words;
}

function shuffleArray(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  // ensure length 4
  while(a.length<4) a.push('Other');
  return a.slice(0,4);
}

/* ---------- loading indicator ---------- */
function showLoading(on){
  if(on){
    if(!document.getElementById('loadingCard')){
      const c = document.createElement('div'); c.id='loadingCard'; c.className='card';
      c.style.gridColumn='1/-1'; c.style.textAlign='center'; c.style.padding='22px';
      c.innerHTML = `<strong>Loading news...</strong><div style="margin-top:8px;color:var(--muted)">Updates every 5 minutes</div>`;
      newsArea.prepend(c);
    }
  }else{ const ex = document.getElementById('loadingCard'); if(ex) ex.remove(); }
}

/* ---------- small UI / behavior ---------- */
searchInput.addEventListener('input', debounce(()=>render(), 220));
darkToggle.addEventListener('click', ()=>{
  const isDark = document.documentElement.classList.toggle('dark');
  darkToggle.setAttribute('aria-pressed', String(isDark));
  localStorage.setItem('rtnews-theme', isDark ? 'dark' : 'light');
});
if(localStorage.getItem('rtnews-theme') === 'dark') document.documentElement.classList.add('dark');

function updateClock(){ if(clockEl) clockEl.textContent = new Date().toLocaleTimeString('en-IN'); }
setInterval(updateClock,1000); updateClock();

window.addEventListener('scroll', ()=>{ toTopBtn.style.display = window.scrollY > 400 ? 'block' : 'none'; });
toTopBtn.addEventListener('click', ()=> window.scrollTo({top:0,behavior:'smooth'}));

window.addEventListener('keydown', (e)=>{ if(e.key === '/' && document.activeElement !== searchInput){ e.preventDefault(); searchInput.focus(); } });

/* ---------- startup ---------- */
buildNav();
fetchAll();
setInterval(fetchAll, AUTO_REFRESH_MS);

/* ---------- helpers ---------- */
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }

