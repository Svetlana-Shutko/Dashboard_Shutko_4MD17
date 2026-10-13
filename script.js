/* =========================================================
   Сводка дня — дашборд на открытых API (ключи не нужны)
   - Open-Meteo: геокодинг и прогноз погоды
   - Frankfurter: курсы валют ЕЦБ
   - CoinGecko: цены криптовалют
   - Hacker News (Firebase API): топ новостей
   ========================================================= */

const CONFIG = {
  defaultCity: "Москва",
  refreshMs: 5 * 60 * 1000,
  timeoutMs: 10000,
  currencies: {
    USD: "доллар США",
    GBP: "фунт",
    CHF: "франк",
    CNY: "юань",
    JPY: "иена",
    TRY: "лира",
  },
  coins: [
    { id: "bitcoin", name: "Bitcoin", symbol: "BTC" },
    { id: "ethereum", name: "Ethereum", symbol: "ETH" },
    { id: "solana", name: "Solana", symbol: "SOL" },
    { id: "the-open-network", name: "Toncoin", symbol: "TON" },
  ],
  newsCount: 8,
};

const WEATHER_CODES = {
  0: "Ясно", 1: "Преимущественно ясно", 2: "Переменная облачность", 3: "Пасмурно",
  45: "Туман", 48: "Изморозь и туман",
  51: "Слабая морось", 53: "Морось", 55: "Сильная морось",
  56: "Ледяная морось", 57: "Сильная ледяная морось",
  61: "Небольшой дождь", 63: "Дождь", 65: "Ливень",
  66: "Ледяной дождь", 67: "Сильный ледяной дождь",
  71: "Небольшой снег", 73: "Снег", 75: "Сильный снег", 77: "Снежная крупа",
  80: "Кратковременный дождь", 81: "Ливневый дождь", 82: "Сильный ливень",
  85: "Снегопад", 86: "Сильный снегопад",
  95: "Гроза", 96: "Гроза с градом", 99: "Сильная гроза с градом",
};

/* ---------- Утилиты ---------- */

const $ = (id) => document.getElementById(id);

async function getJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Сервер ответил ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Сервис не ответил за 10 секунд");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

const fmt = (n, digits = 2) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const signed = (n, digits = 2) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n), digits);

function timeAgo(unixSec) {
  const min = Math.round((Date.now() / 1000 - unixSec) / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function showState(container, message, retry) {
  container.innerHTML = "";
  const el = document.createElement(container.tagName === "TBODY" ? "tr" : "li");
  const inner = container.tagName === "TBODY" ? document.createElement("td") : el;
  if (container.tagName === "TBODY") { inner.colSpan = 4; el.appendChild(inner); }
  inner.className = retry ? "state error" : "state";
  inner.textContent = message;
  if (retry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Повторить";
    btn.addEventListener("click", retry);
    inner.appendChild(btn);
  }
  container.appendChild(el);
}

function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

/* ---------- Погода ---------- */

let currentCity = storage("dashboard-city") || CONFIG.defaultCity;

async function loadWeather() {
  const geo = await getJSON(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(currentCity)}&count=1&language=ru&format=json`
  );
  if (!geo.results || !geo.results.length) {
    throw new Error(`Город «${currentCity}» не найден. Проверьте название.`);
  }
  const place = geo.results[0];

  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,pressure_msl",
    hourly: "temperature_2m,precipitation_probability",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset",
    timezone: "auto",
    forecast_days: "5",
    wind_speed_unit: "ms",
  });
  const data = await getJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
  renderWeather(place, data);
}

function renderWeather(place, data) {
  const c = data.current;
  $("place").textContent = [place.name, place.country].filter(Boolean).join(", ");
  $("temp").textContent = `${Math.round(c.temperature_2m)}°`;
  $("condition").textContent = WEATHER_CODES[c.weather_code] ?? "—";

  const sunrise = data.daily.sunrise[0].slice(11, 16);
  const sunset = data.daily.sunset[0].slice(11, 16);
  const pressureMm = Math.round(c.pressure_msl * 0.750062);

  $("facts").innerHTML = `
    <dt>Ощущается</dt><dd>${Math.round(c.apparent_temperature)}°</dd>
    <dt>Ветер</dt><dd>${fmt(c.wind_speed_10m, 1)} м/с</dd>
    <dt>Влажность</dt><dd>${c.relative_humidity_2m}%</dd>
    <dt>Давление</dt><dd>${pressureMm} мм рт. ст.</dd>
    <dt>Световой день</dt><dd>${sunrise}–${sunset}</dd>
  `;

  // Следующие 24 часа начиная с текущего часа
  const nowHour = c.time.slice(0, 13);
  let start = data.hourly.time.findIndex((t) => t.slice(0, 13) === nowHour);
  if (start < 0) start = 0;
  const hours = data.hourly.time.slice(start, start + 24);
  const temps = data.hourly.temperature_2m.slice(start, start + 24);
  const rain = data.hourly.precipitation_probability.slice(start, start + 24);
  renderCurve(hours, temps, rain);

  const dayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric" });
  $("days").innerHTML = data.daily.time.map((d, i) => `
    <li>
      <p class="day-name">${i === 0 ? "Сегодня" : dayFmt.format(new Date(d + "T12:00"))}</p>
      <p class="day-temp">${Math.round(data.daily.temperature_2m_max[i])}° <span>${Math.round(data.daily.temperature_2m_min[i])}°</span></p>
      <p class="day-cond">${WEATHER_CODES[data.daily.weather_code[i]] ?? ""}</p>
    </li>`).join("");
}

function renderCurve(hours, temps, rain) {
  const svg = $("curve");
  const W = 600, H = 200, top = 16, bottom = 150;
  const min = Math.min(...temps), max = Math.max(...temps);
  const span = max - min || 1;
  const x = (i) => (i / (temps.length - 1)) * W;
  const y = (t) => top + (1 - (t - min) / span) * (bottom - top);

  // Плавная кривая (кубические сегменты)
  let line = `M ${x(0)} ${y(temps[0])}`;
  for (let i = 1; i < temps.length; i++) {
    const cx = (x(i - 1) + x(i)) / 2;
    line += ` C ${cx} ${y(temps[i - 1])}, ${cx} ${y(temps[i])}, ${x(i)} ${y(temps[i])}`;
  }
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  const barW = W / temps.length;
  const bars = rain.map((p, i) => {
    const h = ((p ?? 0) / 100) * 45;
    return `<rect class="curve-rain" x="${i * barW + 1}" y="${H - h}" width="${barW - 2}" height="${h}"></rect>`;
  }).join("");

  svg.innerHTML = `
    <line class="curve-grid" x1="0" y1="${H}" x2="${W}" y2="${H}"></line>
    ${bars}
    <path class="curve-area" d="${area}"></path>
    <path class="curve-line" d="${line}"></path>
  `;

  // Подписи — в HTML, чтобы текст не растягивался вместе с SVG
  let labels = svg.parentElement.querySelector(".curve-labels");
  if (!labels) {
    labels = document.createElement("div");
    labels.className = "curve-labels";
    svg.after(labels);
  }
  const marks = [0, 6, 12, 18, temps.length - 1];
  labels.innerHTML = marks.map((i) => `
    <span style="left:${(i / (temps.length - 1)) * 100}%">
      <b>${Math.round(temps[i])}°</b>${i === 0 ? "сейчас" : hours[i].slice(11, 16)}
    </span>`).join("");

  const maxRain = Math.max(...rain.map((p) => p ?? 0));
  svg.nextElementSibling.nextElementSibling.textContent =
    `Ближайшие 24 часа. Столбики — вероятность осадков${maxRain ? `, максимум ${maxRain}%` : ", осадков не ожидается"}.`;
}

/* ---------- Курсы валют ---------- */

async function loadFx() {
  const symbols = Object.keys(CONFIG.currencies).join(",");
  const from = new Date();
  from.setDate(from.getDate() - 31);
  const data = await getJSON(
    `https://api.frankfurter.dev/v1/${isoDate(from)}..?base=EUR&symbols=${symbols}`
  );
  const dates = Object.keys(data.rates).sort();
  if (dates.length < 2) throw new Error("Недостаточно данных за период");

  const rows = Object.entries(CONFIG.currencies).map(([code, name]) => {
    const series = dates.map((d) => data.rates[d][code]).filter((v) => v != null);
    const last = series[series.length - 1];
    const first = series[0];
    const change = ((last - first) / first) * 100;
    const dir = change >= 0 ? "up" : "down";
    const digits = last >= 100 ? 2 : 4;
    return `
      <tr>
        <td><span class="code">${code}</span><span class="name">${name}</span></td>
        <td>${fmt(last, digits)}</td>
        <td class="${dir}">${signed(change)}%</td>
        <td>${sparkline(series, dir)}</td>
      </tr>`;
  });
  $("fxBody").innerHTML = rows.join("");
}

function sparkline(values, dir) {
  const W = 90, H = 28, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => {
    const px = (i / (values.length - 1)) * W;
    const py = pad + (1 - (v - min) / span) * (H - pad * 2);
    return `${i ? "L" : "M"} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join(" ");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="${dir}" d="${d}"></path></svg>`;
}

/* ---------- Криптовалюты ---------- */

async function loadCrypto() {
  const ids = CONFIG.coins.map((c) => c.id).join(",");
  const data = await getJSON(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
  );
  $("cryptoList").innerHTML = CONFIG.coins.map((coin) => {
    const item = data[coin.id];
    if (!item) return `<li><p class="coin-name">${coin.name}</p><p class="state">Нет данных</p></li>`;
    const change = item.usd_24h_change ?? 0;
    const dir = change >= 0 ? "up" : "down";
    const digits = item.usd >= 1000 ? 0 : 2;
    return `
      <li>
        <p class="coin-name">${coin.name} (${coin.symbol})</p>
        <p class="coin-price">$${fmt(item.usd, digits)}</p>
        <p class="coin-change ${dir}">${signed(change)}% за сутки</p>
      </li>`;
  }).join("");
}

/* ---------- Hacker News ---------- */

async function loadNews() {
  const ids = await getJSON("https://hacker-news.firebaseio.com/v0/topstories.json");
  const items = await Promise.all(
    ids.slice(0, CONFIG.newsCount).map((id) =>
      getJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)
    )
  );
  const stories = items.filter(Boolean);
  if (!stories.length) throw new Error("Не удалось загрузить ни одной новости");

  $("newsList").innerHTML = stories.map((s) => {
    const discussion = `https://news.ycombinator.com/item?id=${s.id}`;
    const url = s.url || discussion;
    let domain = "news.ycombinator.com";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* оставляем по умолчанию */ }
    return `
      <li>
        <span class="news-score" title="Очки">${s.score}</span>
        <div>
          <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(s.title)}</a>
          <p class="news-meta">
            ${escapeHTML(domain)}, ${timeAgo(s.time)},
            <a href="${discussion}" target="_blank" rel="noopener noreferrer">${s.descendants ?? 0} комм.</a>
          </p>
        </div>
      </li>`;
  }).join("");
}

/* ---------- Оркестрация ---------- */

const widgets = {
  weather: {
    load: loadWeather,
    loading: () => { $("condition").textContent = "Загружаем прогноз…"; },
    error: (msg) => {
      $("condition").textContent = msg;
      $("condition").classList.add("down");
    },
    ok: () => $("condition").classList.remove("down"),
  },
  fx: {
    load: loadFx,
    loading: () => showState($("fxBody"), "Загружаем курсы…"),
    error: (msg) => showState($("fxBody"), `Курсы недоступны: ${msg}`, () => runWidget("fx")),
  },
  crypto: {
    load: loadCrypto,
    loading: () => showState($("cryptoList"), "Загружаем цены…"),
    error: (msg) => showState($("cryptoList"), `Цены недоступны: ${msg}`, () => runWidget("crypto")),
  },
  news: {
    load: loadNews,
    loading: () => showState($("newsList"), "Загружаем новости…"),
    error: (msg) => showState($("newsList"), `Новости недоступны: ${msg}`, () => runWidget("news")),
  },
};

async function runWidget(name, { silent = false } = {}) {
  const w = widgets[name];
  if (!silent) w.loading();
  try {
    await w.load();
    w.ok?.();
    return true;
  } catch (err) {
    console.error(`[${name}]`, err);
    w.error(err.message || "неизвестная ошибка");
    return false;
  }
}

async function refreshAll({ silent = false } = {}) {
  const btn = $("refreshBtn");
  btn.setAttribute("aria-busy", "true");
  btn.disabled = true;

  const results = await Promise.all(Object.keys(widgets).map((n) => runWidget(n, { silent })));

  const time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const failed = results.filter((r) => !r).length;
  $("updated").textContent = failed
    ? `Обновлено в ${time}. Не загрузилось блоков: ${failed}`
    : `Обновлено в ${time}`;

  btn.removeAttribute("aria-busy");
  btn.disabled = false;
}

/* ---------- События ---------- */

$("cityForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = $("cityInput").value.trim();
  if (!value) return;
  currentCity = value;
  storage("dashboard-city", value);
  $("cityInput").value = "";
  $("cityInput").placeholder = value;
  runWidget("weather");
});

$("refreshBtn").addEventListener("click", () => refreshAll());

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshAll({ silent: true });
});

$("cityInput").placeholder = currentCity;
refreshAll();
setInterval(() => refreshAll({ silent: true }), CONFIG.refreshMs);
