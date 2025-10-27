// Real-Time News - client-side static app
// Notes:
// - Uses Google News RSS search feeds for topic queries.
// - First tries rss2json public endpoint; if blocked/fails, falls back to CORS proxy (allorigins) + XML parse.
// - For production: use a server-side proxy or RSS-to-JSON service with an API key to avoid CORS & rate limits.

// Sections and queries
// --- Theme Toggle ---
const darkToggle = document.getElementById("darkToggle");
darkToggle.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  alert(`Dark Mode ${isDark ? "Enabled 🌙" : "Disabled ☀️"}`);
});

// Apply saved theme on load
if (localStorage.getItem("theme") === "dark") {
  document.documentElement.classList.add("dark");
}

// --- Clock ---
function updateClock() {
  const clock = document.getElementById("clock");
  const now = new Date();
  clock.textContent = now.toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

// --- Scroll to Top ---
const toTopBtn = document.getElementById("toTopBtn");
window.addEventListener("scroll", () => {
  toTopBtn.style.display = window.scrollY > 400 ? "block" : "none";
});
toTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// --- News Fetch Simulation (replace with your API later) ---
const newsContainer = document.getElementById("news-container");
setTimeout(() => {
  const sampleNews = [
    { title: "Government Launches New UPSC Mentorship Program", content: "Aimed to improve access for rural aspirants." },
    { title: "RBI Policy Update", content: "Repo rate unchanged for the 3rd consecutive quarter." },
    { title: "ISRO Announces New Mission", content: "India to launch a Venus orbiter in 2026." },
    { title: "Sports News", content: "India clinches Asia Cup title with a dominant win." }
  ];
  newsContainer.innerHTML = sampleNews.map(news => `
    <div class="card">
      <h3>${news.title}</h3>
      <p>${news.content}</p>
    </div>
  `).join('');
}, 1000);

