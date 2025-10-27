// Real-Time News - client-side static app
// Notes:
// - Uses Google News RSS search feeds for topic queries.
// - First tries rss2json public endpoint; if blocked/fails, falls back to CORS proxy (allorigins) + XML parse.
// - For production: use a server-side proxy or RSS-to-JSON service with an API key to avoid CORS & rate limits.

// Sections and queries
function createCard(item) {
  const el = document.createElement('article');
  el.className = 'card';

  const img = document.createElement('img');
  img.src = item.image || extractImageFromContent(item.content) || 'https://via.placeholder.com/640x360?text=No+Image';
  img.alt = item.title || 'news image';

  const content = document.createElement('div');
  content.className = 'card-content';

  const title = document.createElement('h3');
  title.textContent = item.title || 'Untitled News';

  const summary = document.createElement('p');
  summary.textContent = generateSummary(item.description || item.content);

  const mcq = document.createElement('div');
  mcq.className = 'mcq';
  mcq.innerHTML = generateMCQ(item.title);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `
    <span>${item.source || 'Unknown Source'}</span>
    <span>${formatDate(item.pubDate)}</span>
  `;

  content.appendChild(title);
  content.appendChild(summary);
  content.appendChild(mcq);
  content.appendChild(meta);

  el.appendChild(img);
  el.appendChild(content);

  return el;
}
