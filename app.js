// ==================== 旅遊助手 PWA ====================

// --- State ---
let scheduleData = [];
let randomPlaces = [];
let foodList = [];
let currentPosition = null;
let selectedDate = new Date();

// --- DOM Elements ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initClock();
    initLocation();
    loadSettings();
    loadData();
    initDateSelector();
    initButtons();
    registerServiceWorker();
});

// --- Tabs ---
function initTabs() {
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.tab-btn').forEach(b => b.classList.remove('active'));
            $$('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            $(`#tab-${btn.dataset.tab}`).classList.add('active');
        });
    });
}

// --- Clock ---
function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
    // Re-check current activity every minute
    setInterval(() => updateNowTab(), 60000);
}

function updateClock() {
    const now = new Date();
    $('#current-time').textContent = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    $('#current-date').textContent = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

// --- Location ---
function initLocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition(
            (pos) => {
                currentPosition = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
                $('#current-location').textContent = `📍 ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
            },
            (err) => {
                $('#current-location').textContent = '📍 無法取得位置（請開啟定位權限）';
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }
}

// --- Settings (hardcoded) ---
const SHEET_ID = '1vZYYdHuaeXf0yCcln23dEvFXOYLJE_pSpkSftkKhn48';
const SHEET_NAME_SCHEDULE = localStorage.getItem('sheetNameSchedule') || '行程表';
const SHEET_NAME_RANDOM = localStorage.getItem('sheetNameRandom') || '隨機景點';
const SHEET_NAME_FOOD = localStorage.getItem('sheetNameFood') || '美食';

function loadSettings() {
    // No-op, settings are hardcoded
}

function saveSettings() {
    // No-op
}

function extractSheetId(input) {
    if (!input) return '';
    if (/^[a-zA-Z0-9_-]+$/.test(input) && input.length > 20) {
        return input;
    }
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return '';
}

function getSheetCsvUrl(sheetId, sheetName) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

// --- Data Loading ---
async function loadData() {
    showLoading(true);

    try {
        // Load schedule
        const scheduleUrl = getSheetCsvUrl(SHEET_ID, SHEET_NAME_SCHEDULE);
        const scheduleRes = await fetch(scheduleUrl);
        if (!scheduleRes.ok) throw new Error(`HTTP ${scheduleRes.status}`);
        const scheduleCsv = await scheduleRes.text();
        scheduleData = parseScheduleCSV(scheduleCsv);

        // Load random places
        try {
            const randomUrl = getSheetCsvUrl(SHEET_ID, SHEET_NAME_RANDOM);
            const randomRes = await fetch(randomUrl);
            if (randomRes.ok) {
                const randomCsv = await randomRes.text();
                randomPlaces = parseRandomCSV(randomCsv);
            }
        } catch (e) {
            console.log('隨機景點分頁讀取失敗（可能不存在）:', e);
        }

        // Load food list
        try {
            const foodUrl = getSheetCsvUrl(SHEET_ID, SHEET_NAME_FOOD);
            const foodRes = await fetch(foodUrl);
            if (foodRes.ok) {
                const foodCsv = await foodRes.text();
                foodList = parseFoodCSV(foodCsv);
            }
        } catch (e) {
            console.log('美食分頁讀取失敗（可能不存在）:', e);
        }

        updateNowTab();
        updateTimeline();
        updateRandomList();
        updateFoodList();
    } catch (err) {
        console.error('載入資料失敗:', err);
    }

    showLoading(false);
}

// --- CSV Parsing ---
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function parseScheduleCSV(csv) {
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    // Skip header
    return lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        return {
            date: cols[0] || '',
            startTime: cols[1] || '',
            endTime: cols[2] || '',
            place: cols[3] || '',
            address: cols[4] || '',
            notes: cols[5] || ''
        };
    }).filter(item => item.date && item.place);
}

function parseRandomCSV(csv) {
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        return {
            place: cols[0] || '',
            address: cols[1] || '',
            type: cols[2] || '',
            notes: cols[3] || ''
        };
    }).filter(item => item.place);
}

function parseFoodCSV(csv) {
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        return {
            name: cols[0] || '',
            hours: cols[1] || '',
            address: cols[2] || '',
            type: cols[3] || '',
            price: cols[4] || '',
            rating: cols[5] || '',
            queue: cols[6] || '',
            recommend: cols[7] || '',
            area: cols[8] || '',
            notes: cols[9] || ''
        };
    }).filter(item => item.name);
}

// --- Now Tab ---
function updateNowTab() {
    const now = new Date();
    const today = formatDate(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const todaySchedule = scheduleData.filter(item => normalizeDate(item.date) === today);

    let currentActivity = null;
    let nextActivity = null;

    for (let i = 0; i < todaySchedule.length; i++) {
        const item = todaySchedule[i];
        const start = timeToMinutes(item.startTime);
        const end = timeToMinutes(item.endTime);

        if (currentMinutes >= start && currentMinutes < end) {
            currentActivity = item;
            nextActivity = todaySchedule[i + 1] || null;
            break;
        } else if (currentMinutes < start) {
            nextActivity = item;
            break;
        }
    }

    // Update current activity card
    if (currentActivity) {
        $('#now-place').textContent = currentActivity.place;
        $('#now-time-range').textContent = `⏰ ${currentActivity.startTime} - ${currentActivity.endTime}`;
        $('#now-notes').textContent = currentActivity.notes ? `📝 ${currentActivity.notes}` : '';
        $('#navigate-now').onclick = () => navigateTo(currentActivity.address || currentActivity.place);
        $('#current-activity').style.display = 'block';
    } else {
        $('#now-place').textContent = '目前沒有行程';
        $('#now-time-range').textContent = '';
        $('#now-notes').textContent = todaySchedule.length > 0 ? '等待下一個行程...' : '今天沒有安排行程';
        $('#navigate-now').style.display = 'none';
        $('#current-activity').style.display = 'block';
    }

    // Update next activity card
    if (nextActivity) {
        $('#next-place').textContent = nextActivity.place;
        $('#next-time-range').textContent = `⏰ ${nextActivity.startTime} - ${nextActivity.endTime}`;
        $('#next-notes').textContent = nextActivity.notes ? `📝 ${nextActivity.notes}` : '';
        $('#navigate-next').onclick = () => navigateTo(nextActivity.address || nextActivity.place);
        $('#next-activity').style.display = 'block';
    } else {
        $('#next-activity').style.display = 'none';
    }
}

// --- Timeline ---
function updateTimeline() {
    const dateStr = formatDate(selectedDate);
    const daySchedule = scheduleData.filter(item => normalizeDate(item.date) === dateStr);

    const container = $('#timeline-list');
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const isToday = formatDate(now) === dateStr;

    if (daySchedule.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">📭</div>
                <p>這天沒有安排行程</p>
            </div>
        `;
        return;
    }

    container.innerHTML = daySchedule.map(item => {
        const start = timeToMinutes(item.startTime);
        const end = timeToMinutes(item.endTime);
        let status = '';

        if (isToday) {
            if (currentMinutes >= start && currentMinutes < end) status = 'current';
            else if (currentMinutes >= end) status = 'past';
        }

        return `
            <div class="timeline-item ${status}">
                <div class="time">${item.startTime} - ${item.endTime}</div>
                <div class="place">${item.place}</div>
                ${item.notes ? `<div class="notes">${item.notes}</div>` : ''}
                <button class="navigate-timeline" onclick="navigateTo('${(item.address || item.place).replace(/'/g, "\\'")}')">
                    🧭 導航
                </button>
            </div>
        `;
    }).join('');
}

// --- Date Selector ---
function initDateSelector() {
    updateSelectedDateDisplay();

    $('#prev-day').addEventListener('click', () => {
        selectedDate.setDate(selectedDate.getDate() - 1);
        updateSelectedDateDisplay();
        updateTimeline();
    });

    $('#next-day').addEventListener('click', () => {
        selectedDate.setDate(selectedDate.getDate() + 1);
        updateSelectedDateDisplay();
        updateTimeline();
    });
}

function updateSelectedDateDisplay() {
    $('#selected-date').textContent = selectedDate.toLocaleDateString('zh-TW', {
        month: 'long', day: 'numeric', weekday: 'short'
    });
}

// --- Random Places ---
let selectedCategory = 'all';

function updateRandomList() {
    const container = $('#random-list');
    const filtersContainer = $('#category-filters');

    if (randomPlaces.length === 0) {
        filtersContainer.innerHTML = '';
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">🎲</div>
                <p>尚未設定隨機景點</p>
            </div>
        `;
        return;
    }

    // Build category filters
    const categories = [...new Set(randomPlaces.map(p => p.type).filter(Boolean))];
    filtersContainer.innerHTML = `
        <button class="filter-btn ${selectedCategory === 'all' ? 'active' : ''}" data-category="all">全部</button>
        ${categories.map(cat => `
            <button class="filter-btn ${selectedCategory === cat ? 'active' : ''}" data-category="${cat}">${getCategoryEmoji(cat)} ${cat}</button>
        `).join('')}
    `;

    // Bind filter clicks
    filtersContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedCategory = btn.dataset.category;
            filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderFilteredList();
            // Hide previous pick
            $('#random-pick').style.display = 'none';
        });
    });

    renderFilteredList();
}

function getFilteredPlaces() {
    if (selectedCategory === 'all') return randomPlaces;
    return randomPlaces.filter(p => p.type === selectedCategory);
}

function renderFilteredList() {
    const container = $('#random-list');
    const filtered = getFilteredPlaces();

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">📭</div>
                <p>這個分類沒有景點</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(item => `
        <div class="place-card" onclick="navigateTo('${(item.address || item.place).replace(/'/g, "\\'")}')">
            <div class="place-info">
                <h3>${item.place}</h3>
                <p>${item.notes || ''}</p>
            </div>
            ${item.type ? `<span class="place-type">${getCategoryEmoji(item.type)} ${item.type}</span>` : ''}
        </div>
    `).join('');
}

function getCategoryEmoji(type) {
    const emojiMap = {
        '吃': '🍽️',
        '美食': '🍽️',
        '餐廳': '🍽️',
        '小吃': '🍜',
        '咖啡': '☕',
        '飲料': '🧋',
        '購物': '🛍️',
        '逛街': '🛍️',
        '景點': '📸',
        '觀光': '📸',
        '自然': '🌿',
        '公園': '🌳',
        '玩具店': '🧸',
        '玩具': '🧸',
        '文創': '🎨',
        '書店': '📚',
        '夜市': '🏮',
        '廟宇': '🏯',
        '博物館': '🏛️',
        '娛樂': '🎮',
        '酒吧': '🍺',
        '甜點': '🍰',
    };
    return emojiMap[type] || '📍';
}

function shuffleRandom() {
    const filtered = getFilteredPlaces();
    if (filtered.length === 0) {
        $('#random-pick').style.display = 'none';
        return;
    }

    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    $('#random-pick').style.display = 'block';
    $('#random-place').textContent = pick.place;
    $('#random-type').textContent = pick.type ? `${getCategoryEmoji(pick.type)} ${pick.type}` : '';
    $('#random-notes').textContent = pick.notes ? `📝 ${pick.notes}` : '';
    $('#navigate-random').onclick = () => navigateTo(pick.address || pick.place);

    // Animation
    $('#random-pick').style.animation = 'none';
    setTimeout(() => { $('#random-pick').style.animation = 'fadeIn 0.3s ease'; }, 10);
}

// --- Food List ---
let selectedFoodCategory = 'all';

function updateFoodList() {
    const container = $('#food-list');
    const filtersContainer = $('#food-category-filters');

    if (foodList.length === 0) {
        filtersContainer.innerHTML = '';
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">🍽️</div>
                <p>尚未設定美食清單</p>
            </div>
        `;
        return;
    }

    // Build category filters
    const categories = [...new Set(foodList.map(f => f.type).filter(Boolean))];
    filtersContainer.innerHTML = `
        <button class="filter-btn ${selectedFoodCategory === 'all' ? 'active' : ''}" data-category="all">全部</button>
        ${categories.map(cat => `
            <button class="filter-btn ${selectedFoodCategory === cat ? 'active' : ''}" data-category="${cat}">${getFoodEmoji(cat)} ${cat}</button>
        `).join('')}
    `;

    // Bind filter clicks
    filtersContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedFoodCategory = btn.dataset.category;
            filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderFilteredFoodList();
            $('#food-pick').style.display = 'none';
        });
    });

    renderFilteredFoodList();
}

function getFilteredFood() {
    if (selectedFoodCategory === 'all') return foodList;
    return foodList.filter(f => f.type === selectedFoodCategory);
}

function renderFilteredFoodList() {
    const container = $('#food-list');
    const filtered = getFilteredFood();

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">📭</div>
                <p>這個分類沒有餐廳</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const tags = [
            item.price ? `💰 ${item.price}` : '',
            item.rating ? `⭐ ${item.rating}` : '',
            item.queue ? `🕐 ${item.queue}` : '',
            item.area ? `📍 ${item.area}` : '',
            item.hours ? `🕒 ${item.hours}` : ''
        ].filter(Boolean).join('　');

        return `
            <div class="place-card food-card" onclick="navigateTo('${(item.address || item.name).replace(/'/g, "\\'")}')">
                <div class="place-info">
                    <h3>${item.name}</h3>
                    ${tags ? `<p class="food-tags">${tags}</p>` : ''}
                    ${item.recommend ? `<p class="food-recommend">🍽️ ${item.recommend}</p>` : ''}
                    ${item.notes ? `<p class="food-notes">${item.notes}</p>` : ''}
                </div>
                ${item.type ? `<span class="place-type">${getFoodEmoji(item.type)} ${item.type}</span>` : ''}
            </div>
        `;
    }).join('');
}

function getFoodEmoji(type) {
    const emojiMap = {
        '拉麵': '🍜',
        '日式': '🍱',
        '壽司': '🍣',
        '燒肉': '🥩',
        '火鍋': '🫕',
        '牛排': '🥩',
        '義式': '🍝',
        '披薩': '🍕',
        '漢堡': '🍔',
        '炸雞': '🍗',
        '中式': '🥢',
        '台式': '🍚',
        '小吃': '🧆',
        '滷味': '🍲',
        '早餐': '🥞',
        '早午餐': '🥞',
        '咖啡': '☕',
        '飲料': '🧋',
        '甜點': '🍰',
        '冰品': '🍦',
        '麵包': '🥐',
        '韓式': '🥘',
        '泰式': '🍛',
        '印度': '🍛',
        '越南': '🍜',
        '素食': '🥗',
        '海鮮': '🦐',
        '居酒屋': '🍶',
        '酒吧': '🍺',
        '夜市': '🏮',
    };
    return emojiMap[type] || '🍽️';
}

function shuffleFood() {
    const filtered = getFilteredFood();
    if (filtered.length === 0) {
        $('#food-pick').style.display = 'none';
        return;
    }

    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    $('#food-pick').style.display = 'block';
    $('#food-pick-name').textContent = pick.name;
    $('#food-pick-type').textContent = pick.type ? `${getFoodEmoji(pick.type)} ${pick.type}` : '';

    const details = [
        pick.price ? `💰 ${pick.price}` : '',
        pick.rating ? `⭐ ${pick.rating}` : '',
        pick.queue ? `🕐 ${pick.queue}` : '',
        pick.area ? `📍 ${pick.area}` : '',
        pick.hours ? `🕒 ${pick.hours}` : '',
        pick.recommend ? `🍽️ ${pick.recommend}` : '',
        pick.notes ? `📝 ${pick.notes}` : ''
    ].filter(Boolean).join('　');

    $('#food-pick-notes').textContent = details;
    $('#navigate-food-pick').onclick = () => navigateTo(pick.address || pick.name);

    // Animation
    $('#food-pick').style.animation = 'none';
    setTimeout(() => { $('#food-pick').style.animation = 'fadeIn 0.3s ease'; }, 10);
}

// --- Navigation ---
function navigateTo(destination) {
    if (!destination) return;

    let url;
    if (currentPosition) {
        // Use current location as starting point
        url = `https://www.google.com/maps/dir/?api=1&origin=${currentPosition.lat},${currentPosition.lng}&destination=${encodeURIComponent(destination)}&travelmode=transit`;
    } else {
        // Just open destination
        url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=transit`;
    }

    window.open(url, '_blank');
}

// --- Buttons ---
function initButtons() {
    $('#refresh-btn').addEventListener('click', () => loadData());
    $('#shuffle-btn').addEventListener('click', () => shuffleRandom());
    $('#food-shuffle-btn').addEventListener('click', () => shuffleFood());
}

// --- Utilities ---
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

function normalizeDate(dateStr) {
    // Handle various date formats: 2026/7/28, 2026-7-28, etc.
    const parts = dateStr.replace(/-/g, '/').split('/');
    if (parts.length !== 3) return dateStr;
    const y = parts[0];
    const m = String(parseInt(parts[1])).padStart(2, '0');
    const d = String(parseInt(parts[2])).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

function timeToMinutes(timeStr) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
}

function showLoading(show) {
    $('#loading').style.display = show ? 'flex' : 'none';
}

// --- Service Worker ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    }
}
