// --- State Management & Initialization ---
let dDayList = [];
let currentTab = 'dashboard'; // Options: 'dashboard', 'milestones', 'archive'
let currentSort = 'timeLeft-asc';

// DOM Elements Selection
const ddayForm = document.getElementById('dday-form');
const titleInput = document.getElementById('event-name');
const targetDateInput = document.getElementById('target-date');
const categorySelect = document.getElementById('category');
const ddayGrid = document.getElementById('dday-grid');
const emptyState = document.getElementById('empty-state');
const addFormContainer = document.getElementById('add-form-container');
const toggleFormBtn = document.getElementById('toggle-form-btn');
const sortSelect = document.getElementById('sort-select');
const navTabs = document.getElementById('nav-tabs');

// Share Modal Elements
const shareModal = document.getElementById('share-modal');
const closeShareBtn = document.getElementById('close-share-btn');
const shareContent = document.getElementById('share-content');
const copyTextBtn = document.getElementById('copy-text-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');
let activeShareDDay = null;

// Category Metadata (High-Tech Abstract backgrounds for Bento design)
const CATEGORY_BG_IMAGES = {
    general: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&auto=format&fit=crop&q=60', // Grid cyber network
    work: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&auto=format&fit=crop&q=60', // Code abstract
    anniversary: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&auto=format&fit=crop&q=60', // Particle waves
    health: 'https://images.unsplash.com/photo-1507398941214-572c25f4b1dc?w=400&auto=format&fit=crop&q=60', // Tech metrics
    travel: 'https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?w=400&auto=format&fit=crop&q=60', // Cyber grid maps
    exam: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400&auto=format&fit=crop&q=60', // Abstract lines
    other: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&auto=format&fit=crop&q=60'
};

// --- Time & Parsing Utilities ---

// Convert Javascript Date to local ISO string (YYYY-MM-DDTHH:mm)
function getLocalISOString(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

// Safely parse datetime-local string to avoid zone shift
function parseLocalDatetime(dateTimeStr) {
    if (!dateTimeStr) return new Date();
    const [datePart, timePart] = dateTimeStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart ? timePart.split(':').map(Number) : [0, 0];
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

// Format Date object: OCT 24, 2024
function formatReadableDateShort(date) {
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const m = months[date.getMonth()];
    const d = String(date.getDate()).padStart(2, '0');
    const y = date.getFullYear();
    return `${m} ${d}, ${y}`;
}

// Format Date object: 2024년 10월 24일 15:30
function formatReadableDateFull(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}년 ${m}월 ${d}일 ${h}:${min}`;
}

// --- Toast Alert System ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    
    let borderStyle = 'border-outline-variant/30 bg-surface-container-high/90 text-on-surface';
    let icon = 'info';
    
    if (type === 'success') {
        borderStyle = 'border-primary/40 bg-surface-container-high/95 text-primary shadow-[0_0_15px_rgba(192,193,255,0.15)]';
        icon = 'check_circle';
    } else if (type === 'error') {
        borderStyle = 'border-error/40 bg-surface-container-high/95 text-error shadow-[0_0_15px_rgba(255,180,171,0.15)]';
        icon = 'warning';
    }
    
    toast.className = `flex items-center gap-3 px-4 py-3 border rounded-xl backdrop-blur-md shadow-lg pointer-events-auto max-w-sm animate-toast ${borderStyle}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined text-md flex-shrink-0">${icon}</span>
        <span class="text-xs font-semibold tracking-wide font-label-caps uppercase">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.95)';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// --- Data Operations ---
function loadData() {
    const stored = localStorage.getItem('aura_ddays');
    if (stored) {
        try {
            dDayList = JSON.parse(stored);
        } catch (e) {
            console.error("Local storage D-Day parsing failed. Resetting data.", e);
            dDayList = [];
        }
    }
    
    if (!dDayList || dDayList.length === 0) {
        // Sample timelines for luxury initialization
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 0);

        const newYear = new Date(new Date().getFullYear() + 1, 0, 1, 0, 0, 0);
        const milestoneDate = new Date();
        milestoneDate.setDate(milestoneDate.getDate() + 12);
        
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 3);

        dDayList = [
            {
                id: 'sample-1',
                title: 'Project Alpha Launch',
                targetDate: tomorrow.toISOString(),
                category: 'work',
                isPinned: true,
                createdAt: Date.now() - 2 * 60 * 60 * 1000 // Launched 2 hours ago
            },
            {
                id: 'sample-2',
                title: 'System Migration',
                targetDate: milestoneDate.toISOString(),
                category: 'general',
                isPinned: false,
                createdAt: Date.now() - 6 * 24 * 60 * 60 * 1000 // Launched 6 days ago (total 18 days span, 33% elapsed)
            },
            {
                id: 'sample-3',
                title: 'Overseas Deployment',
                targetDate: newYear.toISOString(),
                category: 'travel',
                isPinned: false,
                createdAt: Date.now() - 12 * 24 * 60 * 60 * 1000
            }
        ];
        saveData();
    }
}

function saveData() {
    localStorage.setItem('aura_ddays', JSON.stringify(dDayList));
}

// --- Dynamic Rendering ---
function renderGrid() {
    if (!ddayGrid || !emptyState) return;
    ddayGrid.innerHTML = '';
    
    const now = Date.now();
    
    // 1. Tab Navigation Filter
    let filteredList = dDayList;
    if (currentTab === 'dashboard') {
        // Show future deadlines
        filteredList = dDayList.filter(item => new Date(item.targetDate).getTime() > now);
    } else if (currentTab === 'milestones') {
        // Show pinned active deadlines
        filteredList = dDayList.filter(item => new Date(item.targetDate).getTime() > now && item.isPinned);
    } else if (currentTab === 'archive') {
        // Show elapsed deadlines
        filteredList = dDayList.filter(item => new Date(item.targetDate).getTime() <= now);
    }
    
    // 2. Sort Logic
    filteredList.sort((a, b) => {
        const timeA = new Date(a.targetDate).getTime();
        const timeB = new Date(b.targetDate).getTime();
        
        // Pinned priority (placed at top of dashboard/archive)
        if (currentTab !== 'milestones') {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
        }

        if (currentSort === 'timeLeft-asc') {
            return timeA - timeB;
        } else if (currentSort === 'timeLeft-desc') {
            return timeB - timeA;
        } else if (currentSort === 'createdAt-desc') {
            return b.createdAt - a.createdAt;
        } else if (currentSort === 'createdAt-asc') {
            return a.createdAt - b.createdAt;
        }
        return 0;
    });

    if (filteredList.length === 0) {
        ddayGrid.classList.add('hidden');
        emptyState.classList.remove('hidden');
    } else {
        ddayGrid.classList.remove('hidden');
        emptyState.classList.add('hidden');
        
        filteredList.forEach(item => {
            const card = createCardElement(item);
            ddayGrid.appendChild(card);
        });
        
        updateTimers(); // Immediate ticks
    }
}

function createCardElement(item) {
    const target = new Date(item.targetDate);
    const bgImg = CATEGORY_BG_IMAGES[item.category] || CATEGORY_BG_IMAGES.general;
    
    const card = document.createElement('div');
    card.className = `group relative bg-[#1E1E22] p-xl rounded-[12px] card-hover transition-all duration-300 cursor-pointer overflow-hidden`;
    card.setAttribute('data-id', item.id);
    
    card.innerHTML = `
        <!-- Custom Bento Graphic Layer -->
        <div class="absolute inset-0 opacity-10 pointer-events-none transition-opacity duration-300 group-hover:opacity-15">
            <img class="w-full h-full object-cover grayscale" src="${bgImg}" alt="Bento grid mesh" />
        </div>
        
        <!-- Action Row (Bookmark Pin, Share, Delete) -->
        <div class="absolute top-md right-md flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
            <!-- Pin Button -->
            <button onclick="togglePin('${item.id}', event)" class="text-on-surface-variant hover:text-primary transition-colors cursor-pointer" title="상단 고정">
                <span class="material-symbols-outlined text-lg">${item.isPinned ? 'bookmark_added' : 'bookmark'}</span>
            </button>
            <!-- Share Button -->
            <button onclick="openShareModal('${item.id}', event)" class="text-on-surface-variant hover:text-secondary transition-colors cursor-pointer" title="공유하기">
                <span class="material-symbols-outlined text-lg">share</span>
            </button>
            <!-- Delete Button -->
            <button onclick="deleteDDay('${item.id}', event)" class="text-on-surface-variant hover:text-error transition-colors cursor-pointer" title="삭제">
                <span class="material-symbols-outlined text-lg">delete</span>
            </button>
        </div>

        <!-- Headline Content -->
        <div class="relative z-10 space-y-base mb-xl">
            <h3 class="font-headline-lg text-headline-lg tracking-tight text-white line-clamp-1">${item.title}</h3>
            <p class="card-status-label font-label-caps text-label-caps text-on-surface-variant">
                ${formatReadableDateShort(target)}
            </p>
        </div>

        <!-- Timer Grid (DAYS, HOURS, MINS, SECS) -->
        <div class="relative z-10 grid grid-cols-4 gap-md text-center">
            <div class="space-y-xs">
                <div class="card-days font-display-countdown text-display-countdown text-white tabular-nums">00</div>
                <div class="font-label-caps text-[10px] text-on-surface-variant">DAYS</div>
            </div>
            <div class="space-y-xs">
                <div class="card-hours font-display-countdown text-display-countdown text-white tabular-nums">00</div>
                <div class="font-label-caps text-[10px] text-on-surface-variant">HOURS</div>
            </div>
            <div class="space-y-xs">
                <div class="card-mins font-display-countdown text-display-countdown text-white tabular-nums">00</div>
                <div class="font-label-caps text-[10px] text-on-surface-variant">MINS</div>
            </div>
            <div class="space-y-xs">
                <div class="card-secs font-display-countdown text-display-countdown text-white tabular-nums">00</div>
                <div class="font-label-caps text-[10px] text-on-surface-variant">SECS</div>
            </div>
        </div>

        <!-- Progress bar frame -->
        <div class="relative z-10 mt-xl h-1 w-full bg-surface-container rounded-full overflow-hidden">
            <div class="card-progress h-full transition-all duration-1000"></div>
        </div>
    `;
    
    return card;
}

// --- Live Ticking System ---
function updateTimers() {
    const now = Date.now();
    
    dDayList.forEach(dday => {
        const card = document.querySelector(`.dday-card-mock, div[data-id="${dday.id}"]`);
        if (!card) return;
        
        const target = new Date(dday.targetDate).getTime();
        const diff = target - now;
        
        // 1. Resolve Urgency (diff < 24 Hours in the future)
        const isUrgent = diff > 0 && diff < 24 * 60 * 60 * 1000;
        
        if (isUrgent) {
            card.className = card.className.replace('urgency-pulse', '').trim();
            card.classList.add('urgency-pulse');
        } else {
            card.classList.remove('urgency-pulse');
        }
        
        // 2. Format Countdown Values
        const totalSecs = Math.floor(Math.abs(diff) / 1000);
        const daysVal = Math.floor(totalSecs / (3600 * 24));
        const hoursVal = Math.floor((totalSecs % (3600 * 24)) / 3600);
        const minsVal = Math.floor((totalSecs % 3600) / 60);
        const secsVal = totalSecs % 60;
        
        // Populate DOM countdown blocks
        const daysEl = card.querySelector('.card-days');
        const hoursEl = card.querySelector('.card-hours');
        const minsEl = card.querySelector('.card-mins');
        const secsEl = card.querySelector('.card-secs');
        
        if (daysEl) daysEl.textContent = String(daysVal).padStart(2, '0');
        if (hoursEl) hoursEl.textContent = String(hoursVal).padStart(2, '0');
        if (minsEl) minsEl.textContent = String(minsVal).padStart(2, '0');
        if (secsEl) secsEl.textContent = String(secsVal).padStart(2, '0');
        
        // 3. Status Badge rendering
        const statusEl = card.querySelector('.card-status-label');
        if (statusEl) {
            if (diff > 0) {
                if (isUrgent) {
                    statusEl.textContent = `TODAY • ${hoursVal}H ${minsVal}M ${secsVal}S REMAINING`;
                    statusEl.className = 'card-status-label font-label-caps text-label-caps text-secondary font-bold';
                } else {
                    statusEl.textContent = formatReadableDateShort(new Date(dday.targetDate));
                    statusEl.className = 'card-status-label font-label-caps text-label-caps text-on-surface-variant';
                }
            } else if (Math.abs(diff) <= 60000) {
                statusEl.textContent = '🎉 CURRENT TARGET REACHED TODAY';
                statusEl.className = 'card-status-label font-label-caps text-label-caps text-primary font-bold';
            } else {
                statusEl.textContent = `ELAPSED • ${formatReadableDateShort(new Date(dday.targetDate))}`;
                statusEl.className = 'card-status-label font-label-caps text-label-caps text-error opacity-70';
            }
        }
        
        // 4. Progress bar calculation
        const progressEl = card.querySelector('.card-progress');
        if (progressEl) {
            const createdAt = dday.createdAt || (target - 7 * 24 * 3600 * 1000); // fallback to 7 days before
            const duration = target - createdAt;
            const elapsed = now - createdAt;
            
            let progressPercent = 0;
            if (duration > 0) {
                progressPercent = Math.max(0, Math.min(100, (elapsed / duration) * 100));
            } else {
                progressPercent = 100;
            }
            
            // Set width
            progressEl.style.width = `${progressPercent}%`;
            
            // Set Color styling depending on urgency
            if (diff <= 0) {
                progressEl.className = 'card-progress h-full bg-error opacity-40';
            } else if (isUrgent) {
                progressEl.className = 'card-progress h-full bg-secondary urgency-pulse shadow-[0_0_10px_#06B6D4]';
            } else {
                progressEl.className = 'card-progress h-full bg-primary';
            }
        }
    });
}

// --- Action Handles ---
function togglePin(id, e) {
    if (e) e.stopPropagation();
    const item = dDayList.find(i => i.id === id);
    if (item) {
        item.isPinned = !item.isPinned;
        saveData();
        renderGrid();
        showToast(item.isPinned ? `Bookmark added to milestones.` : `Bookmark removed.`, 'success');
    }
}

function deleteDDay(id, e) {
    if (e) e.stopPropagation();
    const index = dDayList.findIndex(i => i.id === id);
    if (index !== -1) {
        const title = dDayList[index].title;
        dDayList.splice(index, 1);
        saveData();
        renderGrid();
        showToast(`'${title}' has been deleted.`, 'error');
    }
}

function openShareModal(id, e) {
    if (e) e.stopPropagation();
    const item = dDayList.find(i => i.id === id);
    if (!item) return;
    
    activeShareDDay = item;
    
    const target = new Date(item.targetDate);
    const now = Date.now();
    const diff = target.getTime() - now;
    
    let timeStr = "";
    if (diff > 0) {
        const days = Math.floor(diff / (24 * 3600 * 1000));
        timeStr = `${days} DAYS REMAINING`;
    } else {
        const days = Math.floor(Math.abs(diff) / (24 * 3600 * 1000));
        timeStr = `${days} DAYS ELAPSED`;
    }

    const shareText = `[ANTIGRAVITY TIMELINE]\n📌 EVENT: ${item.title}\n📅 TARGET: ${formatReadableDateFull(target)}\n⏰ STATUS: ${timeStr}`;
    if (shareContent) shareContent.textContent = shareText;
    
    // Show Modal
    if (shareModal) {
        shareModal.classList.remove('opacity-0', 'pointer-events-none');
        const innerDiv = shareModal.querySelector('div');
        if (innerDiv) {
            innerDiv.classList.remove('scale-95');
            innerDiv.classList.add('scale-100');
        }
    }
}

function closeShareModal() {
    if (shareModal) {
        shareModal.classList.add('opacity-0', 'pointer-events-none');
        const innerDiv = shareModal.querySelector('div');
        if (innerDiv) {
            innerDiv.classList.remove('scale-100');
            innerDiv.classList.add('scale-95');
        }
    }
    activeShareDDay = null;
}

// --- Share Copy Actions with File Scheme / Localhost Safe Clipboard Copy ---
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    } else {
        // Fallback for file:// or insecure local connections
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        return new Promise((resolve, reject) => {
            try {
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) resolve();
                else reject(new Error('execCommand copy returned false'));
            } catch (err) {
                document.body.removeChild(textArea);
                reject(err);
            }
        });
    }
}

// --- Event Listeners Helper ---
function safeAddListener(element, event, callback) {
    if (element) {
        element.addEventListener(event, callback);
    }
}

// Bind Share Utility buttons
safeAddListener(copyTextBtn, 'click', () => {
    if (!activeShareDDay || !shareContent) return;
    copyToClipboard(shareContent.textContent)
        .then(() => {
            showToast('Timeline data copied to clipboard.', 'success');
            closeShareModal();
        })
        .catch(err => {
            console.error('Clipboard copy error:', err);
            showToast('Failed to copy. Please copy manually.', 'error');
        });
});

safeAddListener(copyLinkBtn, 'click', () => {
    if (!activeShareDDay) return;
    
    // Construct Query String sharing URL
    const url = new URL(window.location.href);
    url.searchParams.set('shareTitle', activeShareDDay.title);
    url.searchParams.set('shareDate', activeShareDDay.targetDate);
    url.searchParams.set('shareCategory', activeShareDDay.category);
    
    copyToClipboard(url.toString())
        .then(() => {
            showToast('Shareable URL link copied to clipboard.', 'success');
            closeShareModal();
        })
        .catch(err => {
            console.error('Link copy error:', err);
            showToast('Failed to copy link.', 'error');
        });
});

// Toggle Add Form Collapse
safeAddListener(toggleFormBtn, 'click', () => {
    if (addFormContainer) {
        addFormContainer.classList.toggle('hidden');
        if (!addFormContainer.classList.contains('hidden') && titleInput) {
            titleInput.focus();
        }
    }
});

// Submit D-Day Form
safeAddListener(ddayForm, 'submit', (e) => {
    e.preventDefault();
    
    const title = titleInput ? titleInput.value.trim() : '';
    const rawDate = targetDateInput ? targetDateInput.value : '';
    const category = categorySelect ? categorySelect.value : 'general';
    
    if (!title || !rawDate) return;
    
    // Parse using timezone-safe local utility
    const targetDateObj = parseLocalDatetime(rawDate);
    
    const newDDay = {
        id: 'dday-' + Date.now(),
        title: title,
        targetDate: targetDateObj.toISOString(),
        category: category,
        isPinned: false,
        createdAt: Date.now()
    };
    
    dDayList.unshift(newDDay);
    saveData();
    renderGrid();
    
    // Reset form
    if (ddayForm) ddayForm.reset();
    showToast(`'${title}' tracker commenced successfully.`, 'success');
});

// Sorting Dropdown Trigger
safeAddListener(sortSelect, 'change', (e) => {
    currentSort = e.target.value;
    renderGrid();
});

// Navigation tab switches (DASHBOARD, MILESTONES, ARCHIVE)
safeAddListener(navTabs, 'click', (e) => {
    const tabBtn = e.target.closest('.nav-tab');
    if (!tabBtn) return;
    
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.remove('text-primary', 'font-bold');
        t.classList.add('text-on-surface-variant');
    });
    
    tabBtn.classList.remove('text-on-surface-variant');
    tabBtn.classList.add('text-primary', 'font-bold');
    
    currentTab = tabBtn.getAttribute('data-tab');
    renderGrid();
});

// Close share modal
safeAddListener(closeShareBtn, 'click', closeShareModal);
window.addEventListener('click', (e) => {
    if (e.target === shareModal) closeShareModal();
});

// --- URL Parameter Shared import handler ---
function checkImportedShare() {
    const params = new URLSearchParams(window.location.search);
    const title = params.get('shareTitle');
    const date = params.get('shareDate');
    const category = params.get('shareCategory') || 'general';
    
    if (title && date) {
        // Clean URL params to prevent infinite prompts
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('shareTitle');
        cleanUrl.searchParams.delete('shareDate');
        cleanUrl.searchParams.delete('shareCategory');
        window.history.replaceState({}, document.title, cleanUrl.toString());

        setTimeout(() => {
            const confirmImport = confirm(`[COMMENCE SHARE IMPORT]\n\nEvent: ${title}\nTarget Date: ${formatReadableDateFull(new Date(date))}\n\nDo you want to import this timeline tracking to your dashboard?`);
            if (confirmImport) {
                const newItem = {
                    id: 'import-' + Date.now(),
                    title: title,
                    targetDate: date,
                    category: category,
                    isPinned: false,
                    createdAt: Date.now()
                };
                dDayList.unshift(newItem);
                saveData();
                renderGrid();
                showToast(`'${title}' imported successfully.`, 'success');
            }
        }, 800);
    }
}

// Simple placeholder settings switcher (Can be extended for custom user settings later)
const themeBtn = document.getElementById('theme-toggle-btn');
safeAddListener(themeBtn, 'click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    if (isDark) {
        document.documentElement.style.backgroundColor = '#131315';
        showToast('Tactical Dark Mode activated.', 'success');
    } else {
        document.documentElement.style.backgroundColor = '#f4f4f5';
        showToast('Solarized Light Mode activated.', 'success');
    }
});

// --- Boot Application ---
function init() {
    console.log("ANTIGRAVITY temporal tracker boots...");
    
    // Set default target date inputs (Now + 24 hours) for convenient creation
    if (targetDateInput) {
        const defaultDate = new Date();
        defaultDate.setHours(defaultDate.getHours() + 24);
        targetDateInput.value = getLocalISOString(defaultDate);
        targetDateInput.min = getLocalISOString(new Date());
    }

    loadData();
    renderGrid();
    checkImportedShare();
    
    // Heartbeat ticker (1s)
    setInterval(updateTimers, 1000);
}

// Kickstart safely
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
