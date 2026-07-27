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
    initAI();
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


// ==================== AI 助手 (Gemini 3.1 Flash Lite) ====================

const GEMINI_MODEL = 'gemini-3.1-flash-lite';

function getGeminiEndpoint() {
    const key = localStorage.getItem('geminiApiKey') || '';
    return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
}

let aiChatHistory = [];

function initAI() {
    const input = $('#ai-input');
    const sendBtn = $('#ai-send');
    const imageInput = $('#ai-image-input');

    sendBtn.addEventListener('click', () => sendAIMessage());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            sendAIMessage();
        }
    });

    // Image upload for translation
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageUpload(file);
            imageInput.value = ''; // Reset for next use
        }
    });

    // Long press header to reset API key
    let pressTimer;
    const header = $('.app-header h1');
    header.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => {
            const key = prompt('設定 Gemini API Key：', localStorage.getItem('geminiApiKey') || '');
            if (key !== null) {
                localStorage.setItem('geminiApiKey', key.trim());
                alert('API Key 已更新！');
            }
        }, 2000);
    });
    header.addEventListener('touchend', () => clearTimeout(pressTimer));
    header.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

async function sendAIMessage() {
    const input = $('#ai-input');
    const message = input.value.trim();
    if (!message) return;

    // Check API key
    if (!localStorage.getItem('geminiApiKey')) {
        const key = prompt('首次使用請輸入 Gemini API Key：\n（到 https://aistudio.google.com/apikey 免費申請）');
        if (key && key.trim()) {
            localStorage.setItem('geminiApiKey', key.trim());
        } else {
            return;
        }
    }

    // Show user message
    appendAIMessage(message, 'user');
    input.value = '';

    // Show loading
    const loadingEl = appendAIMessage('思考中...', 'bot loading');

    try {
        const response = await callGemini(message);
        loadingEl.remove();
        appendAIMessage(response, 'bot');
    } catch (err) {
        loadingEl.remove();
        appendAIMessage(`❌ 發生錯誤：${err.message}`, 'bot');
        console.error('Gemini API error:', err);
    }
}

function appendAIMessage(text, type) {
    const container = $('#ai-messages');
    const div = document.createElement('div');
    div.className = `ai-message ${type}`;
    div.innerHTML = formatAIResponse(text);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function formatAIResponse(text) {
    // Basic markdown-like formatting
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function buildSystemContext() {
    const now = new Date();
    const today = formatDate(now);
    const currentTime = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

    let context = `你是一個旅遊行程助手。現在的時間是 ${today} ${currentTime}。`;

    if (currentPosition) {
        context += `\n使用者目前位置：緯度 ${currentPosition.lat.toFixed(5)}, 經度 ${currentPosition.lng.toFixed(5)}`;
    }

    // Add today's schedule
    const todaySchedule = scheduleData.filter(item => normalizeDate(item.date) === today);
    if (todaySchedule.length > 0) {
        context += '\n\n【今天的行程】\n';
        todaySchedule.forEach(item => {
            context += `- ${item.startTime}~${item.endTime} ${item.place}（${item.address}）${item.notes ? '備註：' + item.notes : ''}\n`;
        });
    }

    // Add all schedule data (compact)
    if (scheduleData.length > 0) {
        context += '\n\n【所有行程】\n';
        scheduleData.forEach(item => {
            context += `- ${item.date} ${item.startTime}~${item.endTime} ${item.place}（${item.address}）${item.notes ? ' / ' + item.notes : ''}\n`;
        });
    }

    // Add food list
    if (foodList.length > 0) {
        context += '\n\n【美食清單】\n';
        foodList.forEach(item => {
            const info = [item.type, item.price, item.rating ? `評分${item.rating}` : '', item.area, item.queue, item.recommend].filter(Boolean).join('、');
            context += `- ${item.name}（${item.address}）${info ? ' / ' + info : ''}${item.notes ? ' / ' + item.notes : ''}\n`;
        });
    }

    // Add random places
    if (randomPlaces.length > 0) {
        context += '\n\n【隨機景點】\n';
        randomPlaces.forEach(item => {
            context += `- ${item.place}（${item.address}）類型：${item.type}${item.notes ? ' / ' + item.notes : ''}\n`;
        });
    }

    context += '\n\n請用繁體中文回答。根據以上資料回答使用者的問題，提供具體的建議和規劃。如果行程有延遲，幫忙建議如何調整。回答盡量簡潔實用。';

    return context;
}

async function callGemini(userMessage) {
    // Build conversation with context
    const systemContext = buildSystemContext();

    // Add to chat history
    aiChatHistory.push({ role: 'user', parts: [{ text: userMessage }] });

    const requestBody = {
        system_instruction: {
            parts: [{ text: systemContext }]
        },
        contents: aiChatHistory,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
        }
    };

    const response = await fetch(getGeminiEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，我無法回答這個問題。';

    // Add AI response to history
    aiChatHistory.push({ role: 'model', parts: [{ text: aiResponse }] });

    // Keep history manageable (last 20 messages)
    if (aiChatHistory.length > 20) {
        aiChatHistory = aiChatHistory.slice(-20);
    }

    return aiResponse;
}

// --- Image Translation ---
async function handleImageUpload(file) {
    // Check API key
    if (!localStorage.getItem('geminiApiKey')) {
        const key = prompt('首次使用請輸入 Gemini API Key：\n（到 https://aistudio.google.com/apikey 免費申請）');
        if (key && key.trim()) {
            localStorage.setItem('geminiApiKey', key.trim());
        } else {
            return;
        }
    }

    // Convert image to base64
    const base64 = await fileToBase64(file);
    const mimeType = file.type || 'image/jpeg';

    // Show image in chat
    const imgHtml = `<img src="data:${mimeType};base64,${base64}" alt="uploaded image">`;
    appendAIMessageRaw(`📷 翻譯這張圖片：${imgHtml}`, 'user');

    // Show loading
    const loadingEl = appendAIMessage('辨識翻譯中...', 'bot loading');

    try {
        const response = await callGeminiWithImage(base64, mimeType);
        loadingEl.remove();
        appendAIMessage(response, 'bot');
    } catch (err) {
        loadingEl.remove();
        appendAIMessage(`❌ 發生錯誤：${err.message}`, 'bot');
        console.error('Gemini image error:', err);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function appendAIMessageRaw(html, type) {
    const container = $('#ai-messages');
    const div = document.createElement('div');
    div.className = `ai-message ${type}`;
    div.innerHTML = html;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

async function callGeminiWithImage(base64, mimeType) {
    const prompt = '請翻譯這張圖片中的所有日文/外文文字成繁體中文。如果是菜單，請列出每道菜的名稱和中文翻譯。如果是路標或指示牌，請說明內容。格式清楚易讀。';

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048
        }
    };

    const response = await fetch(getGeminiEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，無法辨識圖片內容。';
}
