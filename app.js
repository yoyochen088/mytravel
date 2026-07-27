// ==================== 旅遊助手 PWA ====================

// --- State ---
let scheduleData = [];
let randomPlaces = [];
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

// --- Settings ---
function loadSettings() {
    const sheetId = localStorage.getItem('sheetId') || '';
    const sheetNameSchedule = localStorage.getItem('sheetNameSchedule') || '行程表';
    const sheetNameRandom = localStorage.getItem('sheetNameRandom') || '隨機景點';
    $('#sheet-id').value = sheetId;
    $('#sheet-name-schedule').value = sheetNameSchedule;
    $('#sheet-name-random').value = sheetNameRandom;
}

function saveSettings() {
    const rawInput = $('#sheet-id').value.trim();
    const sheetId = extractSheetId(rawInput);

    if (!sheetId && rawInput) {
        showStatus('❌ 無法辨識連結，請貼上正確的 Google Sheets 網址或 ID', 'error');
        return;
    }

    localStorage.setItem('sheetId', sheetId);
    localStorage.setItem('sheetNameSchedule', $('#sheet-name-schedule').value.trim() || '行程表');
    localStorage.setItem('sheetNameRandom', $('#sheet-name-random').value.trim() || '隨機景點');
    showStatus('✅ 設定已儲存！', 'success');
    loadData();
}

function extractSheetId(input) {
    if (!input) return '';
    // If it's already just an ID (no slashes, no spaces)
    if (/^[a-zA-Z0-9_-]+$/.test(input) && input.length > 20) {
        return input;
    }
    // Extract from URL: https://docs.google.com/spreadsheets/d/SHEET_ID/...
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return '';
}

function getSheetCsvUrl(sheetId, sheetName) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function showStatus(msg, type) {
    const el = $('#settings-status');
    el.textContent = msg;
    el.className = type === 'success' ? 'status-success' : 'status-error';
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}

// --- Data Loading ---
async function loadData() {
    const sheetId = localStorage.getItem('sheetId');
    const sheetNameSchedule = localStorage.getItem('sheetNameSchedule') || '行程表';
    const sheetNameRandom = localStorage.getItem('sheetNameRandom') || '隨機景點';

    if (!sheetId) {
        showEmptyState();
        return;
    }

    showLoading(true);

    try {
        // Load schedule
        const scheduleUrl = getSheetCsvUrl(sheetId, sheetNameSchedule);
        const scheduleRes = await fetch(scheduleUrl);
        if (!scheduleRes.ok) throw new Error(`HTTP ${scheduleRes.status}`);
        const scheduleCsv = await scheduleRes.text();
        scheduleData = parseScheduleCSV(scheduleCsv);

        // Load random places
        try {
            const randomUrl = getSheetCsvUrl(sheetId, sheetNameRandom);
            const randomRes = await fetch(randomUrl);
            if (randomRes.ok) {
                const randomCsv = await randomRes.text();
                randomPlaces = parseRandomCSV(randomCsv);
            }
        } catch (e) {
            console.log('隨機景點分頁讀取失敗（可能不存在）:', e);
        }

        updateNowTab();
        updateTimeline();
        updateRandomList();
    } catch (err) {
        console.error('載入資料失敗:', err);
        showStatus('❌ 載入失敗，請確認試算表已設為公開檢視', 'error');
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
function updateRandomList() {
    const container = $('#random-list');

    if (randomPlaces.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="emoji">🎲</div>
                <p>尚未設定隨機景點</p>
            </div>
        `;
        return;
    }

    container.innerHTML = randomPlaces.map(item => `
        <div class="place-card">
            <div class="place-info">
                <h3>${item.place}</h3>
                <p>${item.notes || ''}</p>
            </div>
            ${item.type ? `<span class="place-type">${item.type}</span>` : ''}
        </div>
    `).join('');
}

function shuffleRandom() {
    if (randomPlaces.length === 0) return;

    const pick = randomPlaces[Math.floor(Math.random() * randomPlaces.length)];
    $('#random-pick').style.display = 'block';
    $('#random-place').textContent = pick.place;
    $('#random-notes').textContent = pick.notes ? `📝 ${pick.notes}` : '';
    $('#navigate-random').onclick = () => navigateTo(pick.address || pick.place);

    // Add a fun animation
    $('#random-pick').style.animation = 'none';
    setTimeout(() => { $('#random-pick').style.animation = 'fadeIn 0.3s ease'; }, 10);
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
    $('#save-settings').addEventListener('click', () => saveSettings());
    $('#test-connection').addEventListener('click', () => testConnection());
    $('#shuffle-btn').addEventListener('click', () => shuffleRandom());
}

async function testConnection() {
    const rawInput = $('#sheet-id').value.trim();
    const sheetId = extractSheetId(rawInput);

    if (!sheetId) {
        showStatus('❌ 請先輸入 Google Sheets 連結或 ID', 'error');
        return;
    }

    const sheetName = $('#sheet-name-schedule').value.trim() || '行程表';

    try {
        const url = getSheetCsvUrl(sheetId, sheetName);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const lines = text.split('\n').filter(l => l.trim());
        showStatus(`✅ 連線成功！「${sheetName}」分頁找到 ${lines.length - 1} 筆資料`, 'success');
    } catch (err) {
        showStatus('❌ 連線失敗，請確認試算表已設為「知道連結的人可以檢視」', 'error');
    }
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

function showEmptyState() {
    $('#now-place').textContent = '請先設定 Google Sheets';
    $('#now-time-range').textContent = '';
    $('#now-notes').textContent = '前往「設定」頁面貼上你的試算表連結';
    $('#navigate-now').style.display = 'none';
    $('#next-activity').style.display = 'none';
}

// --- Service Worker ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    }
}
