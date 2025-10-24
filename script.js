// Real-Time News - client-side static app
// Notes:
// - Uses Google News RSS search feeds for topic queries.
// - First tries rss2json public endpoint; if blocked/fails, falls back to CORS proxy (allorigins) + XML parse.
// - For production: use a server-side proxy or RSS-to-JSON service with an API key to avoid CORS & rate limits.

// Sections and queries
const FEEDS = [
  { id: 'latest', label: 'Latest News', queries: ['UPSC', 'IAS', 'Civil Services', 'Current Affairs'] },
  { id: 'editorial', label: 'Editorials', queries: ['editorial OR opinion OR "op-ed"'] },
  { id: 'schemes', label: 'Government Schemes', queries: ['Government Schemes OR "government scheme" OR "govt scheme"'] },
  { id: 'pib', label: 'PIB Updates', queries: ['Press Information Bureau OR PIB OR "Press Information Bureau of India"'] }
];

const MAX_ITEMS_PER_SECTION = 30;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

const rss2jsonBase = 'https://api.rss2json.com/v1/api.json?rss_url='; // public, rate-limited
const corsProxy = 'https://api.allorigins.win/raw?url='; // fallback

const sectionsNav = document.getElementById('sectionsNav');
const newsArea = document.getElementById('newsArea');
const searchInput = document.getElementById('searchInput');
const darkToggle = document.getElementById('darkToggle');

let allArticles = []; // flattened list
let activeSection = 'latest';

// Build nav
function buildNav(){
  sectionsNav.innerHTML = '';
  FEEDS.forEach(s=>{
    const btn = document.createElement('button');
    btn.className = 'section-pill' + (s.id===activeSection ? ' active' : '');
    btn.textContent = s.label;
    btn.onclick = () => {
      activeSection = s.id;
      document.querySelectorAll('.section-pill').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      render();
    };
    sectionsNav.appendChild(btn);
  });
}

// Google News RSS search generator
function googleNewsRss(q){
  // hl=en-IN gl=IN ceid=IN:en (India-centric)
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

// Fetch feed via rss2json then fallback to XML via proxy
async function fetchFeedViaRss2Json(rssUrl){
  try{
    const url = rss2jsonBase + encodeURIComponent(rssUrl);
    const res = await fetch(url);
    if(!res.ok) throw new Error('rss2json failed');
    const json = await res.json();
    // rss2json returns items array
    if(json && Array.isArray(json.items)) return json.items.map(normalizeRss2JsonItem);
    throw new Error('invalid rss2json payload');
  }catch(err){
    // fallback to proxy + XML parse
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

// normalize rss2json item shape into common object
function normalizeRss2JsonItem(item){
  const content = item.content || item.content_encoded || item.description || '';
  return {
    title: item.title || '',
    link: item.link || '',
    content,
    description: item.description || item.contentSnippet || stripHtml(content).slice(0,320),
    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
    source: (item.source && item.source.title) || (item.author) || extractDomain(item.link),
    image: (item.thumbnail || (item.enclosure && item.enclosure.link) || extractImageFromContent(content) || ''),
    raw: item
  };
}

// parse XML <item> into same object shape
function parseXmlItem(itemNode){
  const title = (itemNode.querySelector('title') && itemNode.querySelector('title').textContent) || '';
  const link = (itemNode.querySelector('link') && itemNode.querySelector('link').textContent) || '';
  const description = (itemNode.querySelector('description') && itemNode.querySelector('description').textContent) || '';
  const pubDate = (itemNode.querySelector('pubDate') && itemNode.querySelector('pubDate').textContent) || new Date().toISOString();
  // Try media:content or enclosure
  const media = itemNode.querySelector('media\\:content, enclosure, media');
  let image = '';
  if(media){
    image = media.getAttribute('url') || media.getAttribute('src') || media.textContent || '';
  }
  image = image || extractImageFromContent(description);
  return {
    title,
    link,
    content: description,
    description: stripHtml(description).slice(0,320),
    pubDate,
    source: extractDomain(link),
    image
  };
}

// utilities
function extractImageFromContent(html){
  if(!html) return '';
  const m = html.match(/<img[^>]+src="([^">]+)"/i);
  return m ? m[1] : '';
}
function stripHtml(html){
  return html.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
}
function extractDomain(url){
  try{
    const u = new URL(url);
    return u.hostname.replace('www.','');
  }catch(e){
    return '';
  }
}
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
  return date.toLocaleString();
}

// fetch all feeds and build list
async function fetchAll(){
  showLoading(true);
  try{
    const promises = [];

    // For each section, fetch all queries and combine
    for(const section of FEEDS){
      const queries = section.queries;
      for(const q of queries){
        const rssUrl = googleNewsRss(q);
        promises.push(
          fetchFeedViaRss2Json(rssUrl)
            .then(items => ({ sectionId: section.id, items }))
            .catch(err => {
              console.warn('feed error for', q, err);
              return { sectionId: section.id, items: [] };
            })
        );
      }
    }

    const results = await Promise.all(promises);
    // group by section
    const grouped = {};
    results.forEach(r=>{
      if(!grouped[r.sectionId]) grouped[r.sectionId]=[];
      grouped[r.sectionId].push(...r.items);
    });

    // build allArticles with section tag
    allArticles = [];
    for(const section of FEEDS){
      const items = grouped[section.id] || [];
      const normalized = items.map(it => {
        const n = it.title ? it : normalizeRss2JsonItem(it);
        return {...n, section: section.id};
      });
      // dedupe by link or title
      const unique = dedupeByLinkOrTitle(normalized);
      // sort by pubDate desc
      unique.sort((a,b)=> new Date(b.pubDate) - new Date(a.pubDate));
      // limit
      const limited = unique.slice(0, MAX_ITEMS_PER_SECTION);
      allArticles.push(...limited);
    }

    // also create a 'latest' combined view (already present as a section "latest")
    // render
    render();

  }catch(err){
    console.error('fetchAll error', err);
  }finally{
    showLoading(false);
  }
}

function dedupeByLinkOrTitle(items){
  const seen = new Set();
  const out = [];
  for(const it of items){
    const key = (it.link || it.title || '').trim();
    if(!key) continue;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// render current (activeSection) list filtered by search
function render(){
  const q = (searchInput.value||'').trim().toLowerCase();
  const filtered = allArticles.filter(a=>{
    if(activeSection && a.section && activeSection !== 'latest' && a.section !== activeSection) return false;
    // For 'latest' section we show everything
    if(q){
      const hay = `${a.title} ${a.description} ${a.source}`.toLowerCase();
      return hay.includes(q);
    }
    return true;
  });

  // sort newest first
  filtered.sort((x,y)=> new Date(y.pubDate) - new Date(x.pubDate));

  newsArea.innerHTML = '';
  if(filtered.length === 0){
    newsArea.innerHTML = `<div class="no-results" style="grid-column:1/-1;padding:18px;background:var(--card);border-radius:12px;text-align:center;color:var(--muted)">No stories matched. Try clearing the search or wait a few seconds while feeds load.</div>`;
    return;
  }

  for(const item of filtered){
    const card = createCard(item);
    newsArea.appendChild(card);
  }
}

// create card element
function createCard(item){
  const el = document.createElement('article');
  el.className = 'card';

  // image
  const img = document.createElement('img');
  img.className = 'media';
  img.alt = item.title || 'news image';
  img.loading = 'lazy';
  img.src = item.image || getOgImage(item.link) || placeholderImage(item.title);

  // content
  const content = document.createElement('div');
  content.className = 'card-content';

  const title = document.createElement('h3');
  const a = document.createElement('a');
  a.className = 'title-link';
  a.href = item.link || '#';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = item.title || 'Untitled';
  title.appendChild(a);

  const snippet = document.createElement('p');
  snippet.className = 'snippet';
  snippet.textContent = item.description || '';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const left = document.createElement('div');
  left.className = 'source';
  left.textContent = item.source || '';

  const right = document.createElement('div');
  right.className = 'time';
  right.textContent = formatTimeAgo(item.pubDate);

  meta.appendChild(left);
  meta.appendChild(right);

  content.appendChild(title);
  content.appendChild(snippet);
  content.appendChild(meta);

  el.appendChild(img);
  el.appendChild(content);

  return el;
}

function placeholderImage(text){
  const s = encodeURIComponent((text||'news').slice(0,30));
  return `https://via.placeholder.com/640x360.png?text=${s}`;
}

// Try to get an Open Graph image by hitting the article page; avoid heavy fetches
function getOgImage(url){
  // To keep client-side light, we won't fetch the page for OG image.
  // Return empty to use extracted image or placeholder.
  return '';
}

// loading indicator
function showLoading(loading){
  // simple: put a subtle overlay card
  if(loading){
    if(!document.getElementById('loadingCard')){
      const c = document.createElement('div');
      c.id = 'loadingCard';
      c.className = 'card';
      c.style.gridColumn = '1/-1';
      c.style.textAlign = 'center';
      c.style.padding = '26px';
      c.innerHTML = `<strong>Loading news...</strong><div style="margin-top:8px;color:var(--muted)">Updates every 5 minutes</div>`;
      newsArea.prepend(c);
    }
  }else{
    const ex = document.getElementById('loadingCard');
    if(ex) ex.remove();
  }
}

// search input handler
searchInput.addEventListener('input', debounce(()=>render(), 220));

// dark mode
function loadTheme(){
  const pref = localStorage.getItem('rtnews-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(pref === 'dark');
}
function setTheme(isDark){
  if(isDark){
    document.documentElement.classList.add('dark');
    darkToggle.setAttribute('aria-pressed','true');
    localStorage.setItem('rtnews-theme','dark');
  }else{
    document.documentElement.classList.remove('dark');
    darkToggle.setAttribute('aria-pressed','false');
    localStorage.setItem('rtnews-theme','light');
  }
}
darkToggle.addEventListener('click', ()=>{
  const isDark = document.documentElement.classList.toggle('dark');
  setTheme(isDark);
});

// util debounce
function debounce(fn, ms){
  let t;
  return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

// initialize
buildNav();
loadTheme();
fetchAll();

// auto-refresh
setInterval(fetchAll, AUTO_REFRESH_MS);

// Keyboard search focus (press /)
window.addEventListener('keydown', (e)=>{
  if(e.key === '/' && document.activeElement !== searchInput){
    e.preventDefault();
    searchInput.focus();
  }
});
