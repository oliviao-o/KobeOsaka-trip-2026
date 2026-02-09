const CORRECT_PASSWORD = "158A323A7BA44870F23D96F1516DD70AA48E9A72DB4EBB026B0A89E212A208AB";
let isShowAll = false;

async function sha256Hex(str) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function unlock() {
    document.getElementById('password-gate').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    localStorage.setItem('trip-auth', 'true'); // 改用 localStorage 以持久保存登入狀態
    init();
    setInterval(tick, 1000);

    // 載入匯率和天氣資訊
    fetchExchangeRate();
    fetchWeather();

    // 自動滾動到今天的行程
    setTimeout(() => {
        const todayBox = document.querySelector('.today');
        if (todayBox) {
            todayBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 300);
}

async function checkPassword() {
    const input = document.getElementById('pw-input').value || '';
    if (input === CORRECT_PASSWORD) { unlock(); return; }
    try {
        const hashed = await sha256Hex(input);
        if (hashed === CORRECT_PASSWORD) { unlock(); return; }
    } catch (e) {
        // if crypto fails, fall through to show error
    }
    const err = document.getElementById('login-error');
    err.style.visibility = 'visible';
    err.innerText = '密碼錯誤！';
}

function tick() {
    const now = new Date();
    const dateStr = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
    const timeStr = now.toTimeString().split(' ')[0];
    const display = document.getElementById('current-date');
    if (display) display.innerText = `現在時間：${dateStr} ${timeStr}`;

    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentMin = now.getHours() * 60 + now.getMinutes();

    const boxes = document.querySelectorAll('.schedule-box');
    boxes.forEach(box => {
        // remove any previous per-item highlight
        box.querySelectorAll('li.current-activity').forEach(li => li.classList.remove('current-activity'));
        if (box.dataset.date === todayKey) {
            const items = Array.from(box.querySelectorAll('ul > li'));
            const times = items.map(li => {
                const el = li.querySelector('.time-label');
                if (!el) return null;
                const txt = el.innerText.trim();
                const parts = txt.split(':').map(Number);
                if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
                return parts[0] * 60 + parts[1];
            });

            // find active item index: the last item whose time <= current, or the upcoming first if before all
            let activeIdx = -1;
            for (let i = 0; i < times.length; i++) {
                if (times[i] === null) continue;
                if (currentMin >= times[i]) activeIdx = i;
                else break;
            }
            if (activeIdx === -1) {
                // before first scheduled time -> highlight first upcoming
                for (let i = 0; i < times.length; i++) { if (times[i] !== null) { activeIdx = i; break; } }
            } else {
                // activeIdx is last with time <= now; keep it
            }

            if (activeIdx !== -1 && items[activeIdx]) {
                items[activeIdx].classList.add('current-activity');
            }
        }
    });
}

function init() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const boxes = document.querySelectorAll('.schedule-box');

    // 判斷旅程是否已開始：今天日期 >= 任一行程日期
    let tripStarted = false;
    boxes.forEach(b => {
        const tripDate = new Date(b.dataset.date);
        const today = new Date(todayStr);
        if (today >= tripDate) {
            tripStarted = true;
        }
    });

    // 如果用戶沒有手動切換模式，則自動設定
    if (localStorage.getItem('manual-toggle') !== 'true') {
        isShowAll = !tripStarted; // 旅程開始前：顯示全部，旅程開始後：智慧導覽
    }
    updateUI(todayStr, tripStarted);
    tick();
}

function updateUI(todayStr, tripStarted) {
    const boxes = document.querySelectorAll('.schedule-box');
    boxes.forEach(b => {
        const diff = Math.round((new Date(b.dataset.date) - new Date(todayStr)) / 864e5);
        b.classList.remove('is-visible', 'today');

        // 標記今日行程
        if (diff === 0) b.classList.add('today');

        // 顯示邏輯
        if (isShowAll) {
            // 完整行程模式：顯示所有
            b.classList.add('is-visible');
        } else {
            // 智慧導覽模式：只顯示昨天、今天、明天
            if (diff === 0 || diff === -1 || diff === 1) {
                b.classList.add('is-visible');
            }
        }
    });

    // 更新按鈕文字
    const toggleBtn = document.getElementById('toggleBtn');
    if (toggleBtn) {
        toggleBtn.innerText = isShowAll ? "切換至智慧導覽模式" : "查看完整行程表";
    }

    // 旅程開始時：將行前準備清單移到最下方並收合
    const checklist = document.getElementById('dynamic-checklist');
    const scheduleContainer = document.getElementById('schedule-container');

    if (tripStarted && checklist && scheduleContainer) {
        // 將清單移到行程表之後
        scheduleContainer.insertAdjacentElement('afterend', checklist);
        // 預設收合
        document.getElementById('checklist-content').style.display = 'none';
        document.getElementById('chevron').innerText = '▶';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 註冊 Service Worker
    if ('serviceWorker' in navigator) {
        const swPath = new URL('sw.js', window.location.href).pathname;
        navigator.serviceWorker.register(swPath)
            .then(registration => {
                console.log('Service Worker registered:', registration);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }

    initPullToRefresh();
    document.getElementById('login-btn').onclick = checkPassword;
    document.getElementById('pw-input').onkeydown = (e) => { if (e.key === 'Enter') checkPassword(); };
    document.getElementById('toggleBtn').onclick = () => {
        isShowAll = !isShowAll;
        localStorage.setItem('manual-toggle', 'true');
        init();
        if (isShowAll) setTimeout(() => { document.querySelector('.today')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
    };

    const code = new URLSearchParams(window.location.search).get('code');
    if (localStorage.getItem('trip-auth') === 'true') {
        unlock();
    } else if (code === CORRECT_PASSWORD) {
        // only accept the pre-hashed code via URL (no raw-to-hash conversion)
        unlock();
    }

    document.querySelectorAll('#checklist-content .item').forEach(item => {
        const cb = item.querySelector('input[type="checkbox"]');
        if (localStorage.getItem(cb.id) === 'true') { cb.checked = true; item.classList.add('completed'); }
        cb.onchange = () => { localStorage.setItem(cb.id, cb.checked); item.classList.toggle('completed', cb.checked); };
    });

    // 為匯率和天氣卡片添加點擊重新整理功能
    document.querySelector('.exchange-card')?.addEventListener('click', () => {
        fetchExchangeRate();
    });

    document.querySelector('.weather-card')?.addEventListener('click', () => {
        fetchWeather();
    });
});

function toggleChecklist() {
    const content = document.getElementById('checklist-content');
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    document.getElementById('chevron').innerText = isHidden ? '▼' : '▶';
}

// 獲取匯率資訊
async function fetchExchangeRate() {
    try {
        // 使用配置的匯率基準貨幣
        const from = window.EXCHANGE_FROM || 'JPY';
        const to = window.EXCHANGE_TO || 'TWD';

        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
        const data = await response.json();
        const rate = data.rates[to];
        document.getElementById('exchange-rate').innerText = rate.toFixed(4);
        document.querySelector('.exchange-card .info-detail').innerText = `1 ${from} = ${rate.toFixed(4)} ${to}`;
    } catch (error) {
        console.error('匯率載入失敗:', error);
        document.getElementById('exchange-rate').innerText = '--';
        document.querySelector('.exchange-card .info-detail').innerText = '無法載入匯率';
    }
}

// 獲取天氣資訊
async function fetchWeather() {
    try {
        // 顯示載入中
        document.getElementById('weather-temp').innerText = '更新中...';
        document.getElementById('weather-desc').innerText = '--';

        // 使用配置的天氣城市（支援任何城市名稱）
        const cityName = window.WEATHER_CITY || 'Kuala Lumpur';

        // 將底線替換為空格（支援 Kuala_Lumpur 格式）
        const searchCity = cityName.replace(/_/g, ' ');

        // 步驟1: 使用 Open-Meteo Geocoding API 查詢城市座標
        const geoResponse = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchCity)}&count=1&language=zh&format=json`
        );
        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            throw new Error(`找不到城市: ${searchCity}`);
        }

        const location = geoData.results[0];
        const lat = location.latitude;
        const lon = location.longitude;

        // 步驟2: 使用座標獲取天氣資訊（Open-Meteo Weather API）
        const weatherResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`
        );
        const weatherData = await weatherResponse.json();

        const temp = Math.round(weatherData.current.temperature_2m);
        const weatherCode = weatherData.current.weather_code;

        // WMO Weather interpretation codes（世界氣象組織天氣代碼）
        const weatherInfo = {
            0: { emoji: '☀️', desc: '晴朗' },
            1: { emoji: '🌤️', desc: '大致晴朗' },
            2: { emoji: '⛅', desc: '部分多雲' },
            3: { emoji: '☁️', desc: '陰天' },
            45: { emoji: '🌫️', desc: '有霧' },
            48: { emoji: '🌫️', desc: '霧凇' },
            51: { emoji: '🌦️', desc: '小雨' },
            53: { emoji: '🌦️', desc: '中雨' },
            55: { emoji: '🌧️', desc: '大雨' },
            56: { emoji: '🌧️', desc: '凍雨' },
            57: { emoji: '🌧️', desc: '強凍雨' },
            61: { emoji: '🌧️', desc: '小雨' },
            63: { emoji: '🌧️', desc: '中雨' },
            65: { emoji: '🌧️', desc: '大雨' },
            66: { emoji: '🌧️', desc: '凍雨' },
            67: { emoji: '🌧️', desc: '強凍雨' },
            71: { emoji: '🌨️', desc: '小雪' },
            73: { emoji: '🌨️', desc: '中雪' },
            75: { emoji: '❄️', desc: '大雪' },
            77: { emoji: '🌨️', desc: '雪粒' },
            80: { emoji: '🌦️', desc: '陣雨' },
            81: { emoji: '🌧️', desc: '強陣雨' },
            82: { emoji: '🌧️', desc: '暴雨' },
            85: { emoji: '🌨️', desc: '陣雪' },
            86: { emoji: '❄️', desc: '強陣雪' },
            95: { emoji: '⛈️', desc: '雷暴' },
            96: { emoji: '⛈️', desc: '雷暴伴冰雹' },
            99: { emoji: '⛈️', desc: '強雷暴伴冰雹' }
        };

        const weather = weatherInfo[weatherCode] || { emoji: '🌤️', desc: '未知' };

        document.getElementById('weather-icon').innerText = weather.emoji;
        document.getElementById('weather-temp').innerText = `${temp}°C`;
        document.getElementById('weather-desc').innerText = weather.desc;
    } catch (error) {
        console.error('天氣載入失敗:', error);
        document.getElementById('weather-temp').innerText = '--';
        document.getElementById('weather-desc').innerText = '無法載入天氣';
    }
}

// 在 script.js 的最後或適當位置加入
function initPullToRefresh() {
    let touchStart = 0;
    let touchMove = 0;
    let isPulling = false;
    const threshold = 70; // 拉動多少 px 觸發
    const damping = 0.4; // 阻尼係數
    const container = document.body;

    // 創建下拉指示器
    const ptrEl = document.createElement('div');
    ptrEl.className = 'ptr-element';
    ptrEl.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
        <span id="ptr-text">下拉更新</span>
    `;
    container.prepend(ptrEl);

    // 更強健的頂部檢測
    function isAtTop() {
        return window.scrollY === 0 || window.pageYOffset === 0 || document.documentElement.scrollTop === 0;
    }

    window.addEventListener('touchstart', (e) => {
        if (isAtTop()) {
            touchStart = e.touches[0].clientY;
            touchMove = 0;
            isPulling = false;
        }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (touchStart > 0 && isAtTop()) {
            touchMove = e.touches[0].clientY;
            const distance = touchMove - touchStart;

            if (distance > 0) {
                // 防止原生下拉行為
                e.preventDefault();
                isPulling = true;

                // 應用阻尼效果
                const dragDistance = Math.min(distance * damping, threshold + 20);
                ptrEl.style.transform = `translateY(${dragDistance}px)`;
                ptrEl.style.opacity = Math.min(dragDistance / threshold, 1);

                const svg = ptrEl.querySelector('svg');
                const text = ptrEl.querySelector('#ptr-text');

                if (dragDistance >= threshold) {
                    svg.style.transform = 'rotate(180deg)';
                    text.innerText = '放開以更新';
                } else {
                    svg.style.transform = 'rotate(0deg)';
                    text.innerText = '下拉更新';
                }
            }
        }
    }, { passive: false }); // 改為 false 以允許 preventDefault

    window.addEventListener('touchend', () => {
        if (isPulling && touchStart > 0) {
            const distance = touchMove - touchStart;
            const dragDistance = distance * damping; // 使用相同的阻尼係數計算

            if (isAtTop() && dragDistance >= threshold) {
                ptrEl.classList.add('ptr-refreshing');
                ptrEl.querySelector('#ptr-text').innerText = '載入中...';
                ptrEl.querySelector('svg').style.transform = 'rotate(0deg)';

                // 執行重新整理
                setTimeout(() => {
                    location.reload();
                }, 300);
            } else {
                // 回彈
                ptrEl.style.transform = 'translateY(0)';
                ptrEl.style.opacity = '0';
            }
        }
        touchStart = 0;
        touchMove = 0;
        isPulling = false;
    }, { passive: false });

    // 處理取消手勢
    window.addEventListener('touchcancel', () => {
        ptrEl.style.transform = 'translateY(0)';
        ptrEl.style.opacity = '0';
        touchStart = 0;
        touchMove = 0;
        isPulling = false;
    });
}