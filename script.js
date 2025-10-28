const API_KEY = "YOUR_NEWSDATA_API_KEY"; // Replace this
const API_URL = `https://newsdata.io/api/1/news?country=in&language=en&category=top&apikey=${API_KEY}`;
const newsArea = document.getElementById("newsArea");
const searchInput = document.getElementById("searchInput");
const darkToggle = document.getElementById("darkToggle");

// Fetch news
async function fetchNews(query = "") {
  newsArea.innerHTML = "📰 Loading latest headlines...";
  try {
    const res = await fetch(query ? `${API_URL}&q=${query}` : API_URL);
    const data = await res.json();

    newsArea.innerHTML = "";

    if (!data.results || data.results.length === 0) {
      newsArea.innerHTML = "<p>No news found.</p>";
      return;
    }

    data.results.forEach(article => {
      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <img src="${article.image_url || 'https://via.placeholder.com/400x200?text=No+Image'}" alt="news image">
        <h3>${article.title || 'Untitled'}</h3>
        <p>${article.description || ''}</p>
        <button class="btn" onclick="summarize('${article.title.replace(/'/g, '')}')">🤖 Summarize</button>
        <div class="summary" id="${article.title.replace(/[^a-zA-Z0-9]/g, '')}"></div>
      `;
      newsArea.appendChild(card);
    });
  } catch (err) {
    newsArea.innerHTML = "❌ Failed to load news.";
    console.error(err);
  }
}

// AI summary (free API)
async function summarize(text) {
  const el = document.getElementById(text.replace(/[^a-zA-Z0-9]/g, ""));
  el.textContent = "🤖 Generating AI summary...";
  try {
    const res = await fetch(`https://api.monkedev.com/fun/chat?msg=Summarize this news: ${encodeURIComponent(text)}`);
    const data = await res.json();
    el.textContent = data.response || "AI summary unavailable.";
  } catch (err) {
    el.textContent = "⚠️ Could not generate AI summary.";
  }
}

// Search functionality
searchInput.addEventListener("input", e => {
  const query = e.target.value.trim();
  fetchNews(query);
});

// Dark mode toggle
darkToggle.addEventListener("click", () => {
  document.body.classList.toggle("light");
  if (document.body.classList.contains("light")) {
    document.body.style.background = "#f4f4f4";
    document.body.style.color = "#222";
  } else {
    document.body.style.background = "#0f0f0f";
    document.body.style.color = "#eee";
  }
});

// Auto-refresh every 5 min
setInterval(fetchNews, 300000);

// Initial load
fetchNews();

