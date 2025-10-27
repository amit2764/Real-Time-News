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
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

// Simple fake summary (replace with AI API later)
function generateSummary(text) {
  const clean = stripHtml(text);
  const words = clean.split(' ').slice(0, 100).join(' ');
  return words + '...';
}

// Generate random UPSC-style MCQ
function generateMCQ(title) {
  return `
    <strong>UPSC Practice:</strong> Based on "${title}"<br><br>
    Q. Which of the following statements best relates to this news?<br>
    (a) It highlights a policy initiative by the Government.<br>
    (b) It discusses a judicial interpretation.<br>
    (c) It concerns a constitutional amendment.<br>
    (d) It relates to an international report.<br><br>
    <em>Answer:</em> (a) — This news covers government policy aspects, relevant under GS Paper II.<br>
  `;
}

