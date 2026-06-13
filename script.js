console.log("감사일기 스크립트(script.js) 로드 시작");
// --- State Management ---
const state = {
    supabaseClient: null,
    diaries: [],
    currentUser: null,
    supabaseConfig: {
        url: '',
        key: ''
    },
    isSupabaseMode: false,
    theme: 'dark',
    activeMood: 'grateful',
    filters: {
        query: '',
        mood: 'all',
        time: 'all'
    },
    authMode: 'login', // 'login' or 'signup'
    isExplicitLogin: false,
    isExplicitLogout: false
};

// --- Time & Date Utilities ---
// Returns a local timezone-aware date string (YYYY-MM-DD)
function getLocalDateString(offsetDays = 0) {
    const d = new Date();
    if (offsetDays !== 0) {
        d.setDate(d.getDate() + offsetDays);
    }
    const offset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - offset);
    return local.toISOString().split('T')[0];
}

// --- Timeout Helper ---
function withTimeout(promise, timeoutMs = 10000, errorMessage = "요청 시간 초과") {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))
    ]);
}

// --- Mock / Sample Data (Calming, Warm, Realistic Korean Entries) ---
const SAMPLE_ENTRIES = [
    {
        id: 'sample-1',
        entry_date: getLocalDateString(0),
        mood: 'peaceful',
        items: [
            "아침에 따뜻한 햇살을 받으며 차 한 잔을 차분하게 마신 것",
            "동료가 먼저 다가와 바쁜 업무 중 따뜻한 응원의 말을 건네준 것",
            "퇴근길 한강 위로 붉게 떨어지는 저녁 노을을 바라본 것"
        ],
        reflection: "오늘 하루는 큰 일 없이 잔잔하고 평온하게 흘러갔습니다. 이런 소소한 일상에서 행복을 발견할 수 있는 마음의 여유가 있음에 깊이 감사한 날입니다.",
        tags: ["평온", "동료", "일상"],
        created_at: new Date().toISOString()
    },
    {
        id: 'sample-2',
        entry_date: getLocalDateString(-1), // Yesterday
        mood: 'grateful',
        items: [
            "부모님이 건강한 목소리로 안부 전화를 주시고 응원해 주신 것",
            "오래전 구매해 두고 잊고 있었던 책에서 마음에 깊은 울림을 주는 구절을 발견한 것",
            "점심시간에 좋아하는 한식당에서 정갈하고 맛있는 식사를 대접받은 것"
        ],
        reflection: "늘 곁에 있어 익숙함에 잊기 쉬운 가족의 소중함과 따뜻함을 다시 한번 마음에 새기는 하루였습니다.",
        tags: ["가족", "독서", "건강"],
        created_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
        id: 'sample-3',
        entry_date: getLocalDateString(-2), // 2 days ago
        mood: 'growth',
        items: [
            "오랫동안 미뤄왔던 가벼운 스트레칭과 명상 루틴을 드디어 실행에 옮긴 것",
            "업무 중 오랜 시간 머리를 썩이던 코딩 문제의 해결책을 스스로 찾아내 해결한 것",
            "오늘 계획했던 중요 업무 3가지를 집중력 있게 끝마친 것"
        ],
        reflection: "계획했던 바를 미루지 않고 행동으로 실천해내어 스스로가 대견스럽습니다. 느리더라도 매일 조금씩 성장해 나가는 저를 힘차게 응원해 주고 싶습니다.",
        tags: ["성장", "운동", "해결"],
        created_at: new Date(Date.now() - 172800000).toISOString()
    }
];

// --- Toast Alerts Utility ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'check_circle';
    if (type === 'error') icon = 'warning';
    if (type === 'warning') icon = 'error';
    if (type === 'info') icon = 'info';
    
    toast.innerHTML = `
        <span class="material-symbols-outlined toast-icon">${icon}</span>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Animate out
    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px) scale(0.9)';
        setTimeout(() => toast.remove(), 400);
    }, 3200);
}

// --- Storage Service Engine ---
const StorageService = {
    getLocalEntries() {
        const stored = localStorage.getItem('aura_gratitude_entries');
        if (!stored) {
            // First run: load sample entries
            localStorage.setItem('aura_gratitude_entries', JSON.stringify(SAMPLE_ENTRIES));
            return SAMPLE_ENTRIES;
        }
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error("로컬 저장소 일기 데이터 파싱 실패. 리셋합니다.", e);
            return [];
        }
    },
    
    saveLocalEntries(entries) {
        localStorage.setItem('aura_gratitude_entries', JSON.stringify(entries));
    },
    
    async fetchEntries() {
        if (state.isSupabaseMode && state.currentUser) {
            try {
                const { data, error } = await withTimeout(
                    state.supabaseClient
                        .from('gratitude_entries')
                        .select('*')
                        .order('entry_date', { ascending: false }),
                    10000,
                    "데이터 요청 시간 초과"
                );
                
                if (error) throw error;
                state.diaries = data || [];
                return state.diaries;
            } catch (err) {
                console.error("Supabase 데이터 호출 에러:", err);
                showToast(`클라우드 데이터를 가져오는 데 실패했습니다: ${err.message || err}. 로컬 데이터를 대신 로드합니다.`, "error");
                state.diaries = this.getLocalEntries();
                return state.diaries;
            }
        } else {
            state.diaries = this.getLocalEntries().sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
            return state.diaries;
        }
    },
    
    async saveEntry(entry) {
        console.log("saveEntry 시작, entry:", entry);
        
        // AI Response Generation Logic (Groq API)
        if (state.groqConfig?.key) {
            // Find if there is an existing entry with the same ID or date to check if we need to regenerate
            const existing = state.diaries.find(d => d.id === entry.id || (d.entry_date === entry.entry_date && d.id !== entry.id));
            const itemsChanged = existing ? JSON.stringify(existing.items) !== JSON.stringify(entry.items) : true;
            const reflectionChanged = existing ? existing.reflection !== entry.reflection : true;
            
            // Only generate if it's a new entry OR if the items/reflection changed OR if there's no existing AI response
            if (itemsChanged || reflectionChanged || (existing && !existing.ai_response)) {
                const aiText = await generateMindfulnessQuote(entry.items, entry.reflection);
                if (aiText) {
                    entry.ai_response = aiText;
                }
            } else if (existing) {
                // Keep the old response
                entry.ai_response = existing.ai_response;
            }
        }

        if (state.isSupabaseMode && state.currentUser) {
            console.log("Supabase 모드 저장 시도...");
            try {
                // Attach user_id
                entry.user_id = state.currentUser.id;
                console.log("유저 ID 할당 완료:", entry.user_id);
                
                // If it has a temporary local id (starts with 'local-' or 'sample-'), remove it so Supabase creates a UUID
                if (typeof entry.id === 'string' && (entry.id.startsWith('local-') || entry.id.startsWith('sample-'))) {
                    delete entry.id;
                }
                
                console.log("Supabase upsert 요청 전송...");
                const { data, error } = await withTimeout(
                    state.supabaseClient
                        .from('gratitude_entries')
                        .upsert(entry, { onConflict: 'user_id,entry_date' })
                        .select(),
                    10000,
                    "Supabase 서버 저장 시간 초과"
                );
                
                console.log("Supabase upsert 응답 수신. error:", error, "data:", data);
                if (error) throw error;
                showToast("감사일기가 클라우드에 안전하게 보관되었습니다.", "success");
                await this.fetchEntries();
                updateUI();
                return true;
            } catch (err) {
                console.error("Supabase 저장 에러:", err);
                showToast(`저장 오류: ${err.message || err}`, "error");
                return false;
            }
        } else {
            console.log("로컬 모드 저장 시도...");
            const entries = this.getLocalEntries();
            console.log("로컬 데이터 로드 완료, 총 개수:", entries.length);
            
            // Check for date conflict in local mode
            const existingIndex = entries.findIndex(e => e.entry_date === entry.entry_date && e.id !== entry.id);
            if (existingIndex !== -1) {
                // Update existing
                entry.id = entries[existingIndex].id;
                entries[existingIndex] = entry;
                console.log("기존 날짜의 일기 발견. 덮어쓰기 예약.");
                showToast("해당 날짜의 로컬 일기가 덮어쓰기되었습니다.", "info");
            } else {
                const idx = entries.findIndex(e => e.id === entry.id);
                if (idx !== -1) {
                    entries[idx] = entry;
                    console.log("기존 ID 일기 발견. 수정 예약.");
                    showToast("로컬 일기가 수정되었습니다.", "success");
                } else {
                    entry.id = 'local-' + Date.now();
                    entries.unshift(entry);
                    console.log("새 일기 등록 예약.");
                    showToast("로컬 감사일기가 저장되었습니다.", "success");
                }
            }
            
            console.log("로컬 저장소 저장 완료, entries:", entries);
            this.saveLocalEntries(entries);
            console.log("fetchEntries 호출...");
            await this.fetchEntries();
            console.log("updateUI 호출...");
            updateUI();
            console.log("로컬 저장 프로세스 완료!");
            return true;
        }
    },
    
    async deleteEntry(id) {
        if (state.isSupabaseMode && state.currentUser) {
            try {
                const { error } = await withTimeout(
                    state.supabaseClient
                        .from('gratitude_entries')
                        .delete()
                        .eq('id', id),
                    10000,
                    "삭제 요청 시간 초과"
                );
                
                if (error) throw error;
                showToast("일기를 클라우드에서 삭제했습니다.", "success");
                await this.fetchEntries();
                updateUI();
                return true;
            } catch (err) {
                console.error("Supabase 삭제 에러:", err);
                showToast(`삭제 실패: ${err.message}`, "error");
                return false;
            }
        } else {
            const entries = this.getLocalEntries();
            const filtered = entries.filter(e => e.id !== id);
            this.saveLocalEntries(filtered);
            showToast("로컬 감사일기가 삭제되었습니다.", "success");
            await this.fetchEntries();
            updateUI();
            return true;
        }
    },
    
    async syncLocalToCloud() {
        if (!state.isSupabaseMode || !state.currentUser) return;
        
        const localEntries = this.getLocalEntries();
        const realLocalEntries = localEntries.filter(e => e.id && !e.id.startsWith('sample-'));
        if (realLocalEntries.length === 0) {
            showToast("동기화할 로컬 일기 데이터가 없습니다.", "info");
            return;
        }
        
        showToast("로컬 데이터를 클라우드로 동기화 중...", "info");
        
        let successCount = 0;
        const failedEntries = [];
        
        for (const entry of realLocalEntries) {
            // Prepare clean object for upload
            const uploadEntry = {
                entry_date: entry.entry_date,
                mood: entry.mood,
                items: entry.items,
                reflection: entry.reflection,
                tags: entry.tags,
                user_id: state.currentUser.id
            };
            
            try {
                const { error } = await withTimeout(
                    state.supabaseClient
                        .from('gratitude_entries')
                        .upsert(uploadEntry, { onConflict: 'user_id,entry_date' }),
                    10000,
                    "동기화 서버 응답 시간 초과"
                );
                
                if (!error) {
                    successCount++;
                } else {
                    console.error("개별 일기 동기화 에러:", error);
                    failedEntries.push(entry);
                }
            } catch (err) {
                console.error("동기화 예외:", err);
                failedEntries.push(entry);
            }
        }
        
        if (successCount > 0) {
            showToast(`${successCount}개의 감사일기가 클라우드로 성공적으로 이전되었습니다.`, "success");
            
            // If some entries failed, keep only the failed ones in localStorage.
            if (failedEntries.length > 0) {
                this.saveLocalEntries(failedEntries);
                showToast(`${failedEntries.length}개의 일기 동기화에 실패하여 로컬에 보존했습니다.`, "warning");
            } else {
                // All succeeded, we can safely clear local entries (stored as empty array to prevent sample generation)
                this.saveLocalEntries([]);
            }
        } else {
            showToast("클라우드 동기화에 실패했습니다. 네트워크 상태 및 테이블 RLS 보안 설정을 확인해 주세요. 로컬 데이터는 보존됩니다.", "error");
        }
        
        await this.fetchEntries();
        updateUI();
    }
};

// --- Groq AI Connector ---
function initGroqSettings() {
    let key = localStorage.getItem('aura_groq_key');
    if (key === null) {
        key = '';
    }
    let model = localStorage.getItem('aura_groq_model');
    if (model === null) {
        model = 'llama-3.3-70b-versatile';
    }
    
    state.groqConfig = { key, model };
    
    // Pre-populate input fields in DOM if they exist
    const keyEl = document.getElementById('groq-key');
    const modelEl = document.getElementById('groq-model');
    if (keyEl) keyEl.value = key;
    if (modelEl) modelEl.value = model;
    
    console.log("저장된 Groq API Key (앞 10글자):", key ? key.substring(0, 10) + "..." : "없음");
    console.log("저장된 Groq AI 모델:", model);
}

async function generateMindfulnessQuote(items, reflection) {
    const key = state.groqConfig?.key;
    const model = state.groqConfig?.model || 'llama-3.3-70b-versatile';
    
    if (!key) return null;
    
    console.log("Groq API 호출 시도... 모델:", model);
    
    const messages = [
        {
            role: "system",
            content: "당신은 따뜻하고 공감 능력이 뛰어난 전문 심리 상담사 및 명상 가이드입니다. 사용자가 오늘 하루 감사했던 일과 성찰을 작성했습니다. 이 내용을 바탕으로, 오늘의 긍정적 에너지를 강화하고 위안과 성장을 주는 2~3문장 정도의 부드럽고 따뜻한 격려 메시지를 한글로 작성해 주세요. (답변은 친근하되 정중한 존댓말로 작성하고, 문장 내에 마크다운 기호 없이 순수한 텍스트만 출력하세요. 글자 수는 200자 내외로 해주세요.)"
        },
        {
            role: "user",
            content: `[감사한 일 목록]\n${items.map((it, idx) => `${idx + 1}. ${it}`).join('\n')}\n\n[오늘의 성찰]\n${reflection || '없음'}`
        }
    ];
    
    try {
        const response = await withTimeout(
            fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${key}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 300
                })
            }),
            10000,
            "Groq AI 서버 응답 시간 초과"
        );
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        return content ? content.trim() : null;
    } catch (err) {
        console.error("Groq API 호출 실패:", err);
        showToast(`AI 격려 생성 실패: ${err.message}`, "warning");
        return null;
    }
}

// --- Supabase Connector ---
function initSupabase() {
    const url = localStorage.getItem('aura_supabase_url');
    const key = localStorage.getItem('aura_supabase_key');
    console.log("저장된 Supabase URL:", url);
    console.log("저장된 Supabase Key (앞 10글자):", key ? key.substring(0, 10) + "..." : "없음");
    
    const syncStatusEl = document.getElementById('sync-status');
    const syncLocalBtn = document.getElementById('sync-local-btn');
    
    // Set settings modal default fields if stored
    if (url) document.getElementById('supabase-url').value = url;
    if (key) document.getElementById('supabase-key').value = key;
    
    if (url && key && window.supabase) {
        try {
            state.supabaseConfig.url = url;
            state.supabaseConfig.key = key;
            state.supabaseClient = window.supabase.createClient(url, key);
            state.isSupabaseMode = true;
            
            if (syncStatusEl) {
                syncStatusEl.className = "cloud-status supabase-connected";
                syncStatusEl.querySelector('.status-text').textContent = "Supabase 클라우드 모드";
            }
            
            // Monitor auth events
            state.supabaseClient.auth.onAuthStateChange(async (event, session) => {
                state.currentUser = session?.user || null;
                updateAuthUI();
                
                if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
                    // Close the auth modal immediately upon successful authentication
                    closeModal('auth-modal');
                    
                    if (state.isExplicitLogin) {
                        showToast(`${state.currentUser?.email || '사용자'}님 환영합니다.`, 'success');
                        if (syncLocalBtn) syncLocalBtn.style.display = 'inline-flex';
                        
                        // 로그인 직후 로컬에 임시 작성한 진짜 일기가 있다면 자동 업로드 권유
                        const localEntries = StorageService.getLocalEntries();
                        const realLocalEntries = localEntries.filter(e => !e.id.startsWith('sample-'));
                        if (realLocalEntries.length > 0) {
                            setTimeout(() => {
                                const confirmSync = confirm("로그인 전에 로컬에 작성해 둔 감사일기(" + realLocalEntries.length + "개)가 있습니다. 현재 로그인한 클라우드 계정으로 모두 안전하게 이동(동기화)하시겠습니까?");
                                if (confirmSync) {
                                    StorageService.syncLocalToCloud();
                                }
                            }, 800);
                        }
                        state.isExplicitLogin = false;
                    } else {
                        // Silent restoring of session on page load
                        const localEntries = StorageService.getLocalEntries();
                        const realLocalEntries = localEntries.filter(e => !e.id.startsWith('sample-'));
                        if (realLocalEntries.length > 0 && syncLocalBtn) {
                            syncLocalBtn.style.display = 'inline-flex';
                        }
                    }
                } else if (event === 'SIGNED_OUT') {
                    if (state.isExplicitLogout) {
                        showToast('로그아웃되었습니다.', 'info');
                        state.isExplicitLogout = false;
                    }
                    if (syncLocalBtn) syncLocalBtn.style.display = 'none';
                }
                
                await StorageService.fetchEntries();
                updateUI();
            });
            
        } catch (e) {
            console.error("Supabase 클라이언트 초기화 실패:", e);
            showToast("Supabase 연결 설정 오류가 발생했습니다. 로컬 모드로 가동합니다.", "error");
            fallbackToLocalMode();
        }
    } else {
        fallbackToLocalMode();
    }
}

function fallbackToLocalMode() {
    state.isSupabaseMode = false;
    state.currentUser = null;
    state.supabaseClient = null;
    
    const syncStatusEl = document.getElementById('sync-status');
    const syncLocalBtn = document.getElementById('sync-local-btn');
    
    if (syncStatusEl) {
        syncStatusEl.className = "cloud-status local-mode";
        syncStatusEl.querySelector('.status-text').textContent = "로컬 저장 모드";
    }
    if (syncLocalBtn) syncLocalBtn.style.display = 'none';
    
    updateAuthUI();
    StorageService.fetchEntries().then(() => updateUI());
}

// --- Auth UI Updates ---
function updateAuthUI() {
    const authWidget = document.getElementById('auth-widget');
    if (!authWidget) return;
    
    if (state.isSupabaseMode && state.currentUser) {
        const email = state.currentUser.email;
        const initial = email.charAt(0).toUpperCase();
        authWidget.innerHTML = `
            <div class="profile-badge" id="profile-btn" title="계정 관리" onclick="triggerLogout()">
                <div class="profile-avatar">${initial}</div>
                <span style="font-family: var(--font-ui);">${email.split('@')[0]}</span>
            </div>
        `;
    } else {
        authWidget.innerHTML = `
            <button id="auth-btn" class="btn-primary">
                <span class="material-symbols-outlined">login</span>
                로그인
            </button>
        `;
        document.getElementById('auth-btn').addEventListener('click', () => openModal('auth-modal'));
    }
}

// Exposed globally to handle profile badge click
window.triggerLogout = async function() {
    console.log("triggerLogout 클릭됨");
    const confirmLogout = confirm("로그아웃 하시겠습니까?");
    if (confirmLogout) {
        state.isExplicitLogout = true;
        
        // 1. 로컬 상태 즉시 로그아웃 업데이트 (Hanging 방지)
        console.log("로컬 로그아웃 상태 처리 시작");
        state.currentUser = null;
        updateAuthUI();
        await StorageService.fetchEntries();
        updateUI();
        console.log("로컬 로그아웃 상태 처리 완료");

        // 1.5. Supabase 로컬 세션 강제 삭제 (네트워크 지연 시 새로고침 자동 로그인 방지)
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k) {
                if ((k.startsWith('sb-') && k.endsWith('-auth-token')) || k === 'supabase.auth.token') {
                    console.log("Supabase 로컬 토큰 삭제:", k);
                    localStorage.removeItem(k);
                }
            }
        }

        // 2. Supabase 서버 로그아웃은 백그라운드 비동기로 요청 (대기하지 않음)
        if (state.supabaseClient) {
            console.log("Supabase 서버 로그아웃 요청 전송 (비동기)...");
            state.supabaseClient.auth.signOut().then(({ error }) => {
                if (error) {
                    console.error("Supabase 서버 로그아웃 에러:", error);
                } else {
                    console.log("Supabase 서버 로그아웃 완료.");
                }
            }).catch(err => {
                console.error("Supabase 서버 로그아웃 예외:", err);
            });
        }
    }
};

// Exposed globally to trigger local-to-cloud data sync
window.triggerSyncLocalToCloud = function() {
    StorageService.syncLocalToCloud();
};

// --- Streak & Stats Calculators ---
function calculateStreak(entries) {
    if (entries.length === 0) return 0;
    
    // Extract entry dates and map to local ISO strings, removing time, then sort descending
    const dates = [...new Set(entries.map(e => e.entry_date))].sort((a, b) => new Date(b) - new Date(a));
    if (dates.length === 0) return 0;
    
    // Timezone safe today and yesterday string formats
    const todayStr = getLocalDateString(0);
    const yesterdayStr = getLocalDateString(-1);
    
    // Check if the most recent diary is today or yesterday. If not, streak is broken.
    if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
        return 0;
    }
    
    let streak = 1;
    for (let i = 0; i < dates.length - 1; i++) {
        const d1 = new Date(dates[i]);
        const d2 = new Date(dates[i+1]);
        
        // Difference in days
        const diffTime = Math.abs(d1 - d2);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            streak++;
        } else if (diffDays > 1) {
            break; // Streak chain broken
        }
    }
    return streak;
}

function updateStatistics() {
    const totalCount = state.diaries.length;
    const streak = calculateStreak(state.diaries);
    
    // Total count & Streak count DOM updates
    const totalEl = document.getElementById('stat-total');
    const streakEl = document.getElementById('stat-streak');
    if (totalEl) totalEl.textContent = `${totalCount}개`;
    if (streakEl) streakEl.textContent = `${streak}일`;
    
    // Calculate Gratitude ratio (grateful mood / total)
    const gratefulCount = state.diaries.filter(e => e.mood === 'grateful').length;
    const pct = totalCount > 0 ? Math.round((gratefulCount / totalCount) * 100) : 0;
    
    // Circular Progress Wheel updates
    const wheel = document.getElementById('stat-grateful-wheel');
    const pctText = document.getElementById('stat-grateful-pct');
    
    if (pctText) pctText.textContent = `${pct}%`;
    if (wheel) {
        // Circumference is 163.3
        const offset = 163.3 - (163.3 * pct) / 100;
        wheel.style.strokeDashoffset = offset;
    }
    
    // Popular Tags Engine
    const tagCounts = {};
    state.diaries.forEach(e => {
        if (Array.isArray(e.tags)) {
            e.tags.forEach(t => {
                if (t.trim()) {
                    tagCounts[t] = (tagCounts[t] || 0) + 1;
                }
            });
        }
    });
    
    // Sort tags descending
    const popularTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Take top 10
        
    const cloudEl = document.getElementById('tag-cloud');
    if (cloudEl) {
        if (popularTags.length === 0) {
            cloudEl.innerHTML = `<span class="text-disabled" style="font-size: 0.8rem;">작성된 태그가 없습니다.</span>`;
        } else {
            cloudEl.innerHTML = popularTags.map(([tag, count]) => `
                <span class="tag-item" onclick="setTagFilter('${tag}')">#${tag} (${count})</span>
            `).join('');
        }
    }
}

function setTagFilter(tag) {
    const searchInput = document.getElementById('search-query');
    if (searchInput) {
        searchInput.value = `#${tag}`;
        state.filters.query = `#${tag}`;
        renderTimeline();
    }
}

// --- Date Formatter ---
function formatKoreanDate(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const date = new Date(parts[0], parts[1]-1, parts[2]);
    const week = ["일", "월", "화", "수", "목", "금", "토"];
    return {
        formatted: `${parts[0]}년 ${parseInt(parts[1])}월 ${parseInt(parts[2])}일`,
        dayOfWeek: week[date.getDay()]
    };
}

// --- Dynamic Form inputs: bullet points (3 to 5 toggle) ---
let extraInputsCount = 0;
const addMoreBtn = document.getElementById('add-more-btn');
const extraInputs = document.querySelectorAll('.extra-input');

if (addMoreBtn) {
    addMoreBtn.addEventListener('click', () => {
        if (extraInputsCount < extraInputs.length) {
            extraInputs[extraInputsCount].style.display = 'flex';
            extraInputs[extraInputsCount].querySelector('input').required = true;
            extraInputsCount++;
            
            if (extraInputsCount === extraInputs.length) {
                addMoreBtn.style.display = 'none';
            }
        }
    });
}

function resetFormInputs() {
    const form = document.getElementById('entry-form');
    if (form) form.reset();
    
    // Reset date picker to local today
    document.getElementById('entry-date').value = getLocalDateString(0);
    
    // Reset active mood to grateful
    document.querySelectorAll('.mood-btn').forEach(btn => btn.classList.remove('active'));
    const defMood = document.querySelector('.mood-btn[data-mood="grateful"]');
    if (defMood) defMood.classList.add('active');
    state.activeMood = 'grateful';
    
    // Reset dynamic gratitude bullet lines to 3
    extraInputs.forEach(el => {
        el.style.display = 'none';
        el.querySelector('input').required = false;
        el.querySelector('input').value = '';
    });
    extraInputsCount = 0;
    if (addMoreBtn) addMoreBtn.style.display = 'inline-flex';
}

// --- Timeline Renderer ---
function renderTimeline() {
    const timelineEl = document.getElementById('timeline-list');
    const emptyStateEl = document.getElementById('empty-state');
    if (!timelineEl) return;
    
    timelineEl.innerHTML = '';
    
    // 1. Filter entries
    const filtered = state.diaries.filter(entry => {
        // Query search (both reflection contents, gratitude items, and tags)
        const q = state.filters.query.toLowerCase().trim();
        let matchesQuery = true;
        if (q) {
            if (q.startsWith('#')) {
                // Tag search
                const tagSearch = q.slice(1);
                matchesQuery = entry.tags && entry.tags.some(t => t.toLowerCase().includes(tagSearch));
            } else {
                // Standard search
                const reflectionMatch = entry.reflection && entry.reflection.toLowerCase().includes(q);
                const itemsMatch = entry.items && entry.items.some(item => item.toLowerCase().includes(q));
                const tagsMatch = entry.tags && entry.tags.some(t => t.toLowerCase().includes(q));
                matchesQuery = reflectionMatch || itemsMatch || tagsMatch;
            }
        }
        
        // Mood filter
        let matchesMood = true;
        if (state.filters.mood !== 'all') {
            matchesMood = entry.mood === state.filters.mood;
        }
        
        // Date filter
        let matchesTime = true;
        if (state.filters.time !== 'all') {
            const entryDate = new Date(entry.entry_date);
            const now = new Date();
            const timeDiff = Math.abs(now - entryDate);
            const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            
            if (state.filters.time === 'week') {
                matchesTime = diffDays <= 7;
            } else if (state.filters.time === 'month') {
                matchesTime = diffDays <= 30;
            } else if (state.filters.time === 'year') {
                matchesTime = entryDate.getFullYear() === now.getFullYear();
            }
        }
        
        return matchesQuery && matchesMood && matchesTime;
    });
    
    // 2. Render cards
    if (filtered.length === 0) {
        timelineEl.style.display = 'none';
        if (emptyStateEl) {
            emptyStateEl.style.display = 'flex';
            
            // Check if user is logged in but has unsynced local entries
            if (state.isSupabaseMode && state.currentUser) {
                const localEntries = StorageService.getLocalEntries();
                const realLocalEntries = localEntries.filter(e => e.id && !e.id.startsWith('sample-'));
                if (realLocalEntries.length > 0) {
                    emptyStateEl.innerHTML = `
                        <div class="empty-state-icon" style="color: var(--primary);">
                            <span class="material-symbols-outlined">cloud_upload</span>
                        </div>
                        <div class="empty-state-text">클라우드 동기화 대기 중</div>
                        <div class="empty-state-desc" style="margin-bottom: 16px;">
                            로그인하기 전에 작성해 두신 감사일기가 <strong>${realLocalEntries.length}개</strong> 있습니다.<br>
                            안전한 보관을 위해 지금 클라우드 계정으로 모두 업로드하시겠습니까?
                        </div>
                        <button type="button" class="btn-primary" onclick="triggerSyncLocalToCloud()" style="padding: 10px 20px; gap: 8px; font-weight: 600;">
                            <span class="material-symbols-outlined" style="font-size: 1.2rem;">sync</span>
                            클라우드로 일기 동기화하기
                        </button>
                    `;
                    return;
                }
            }
            
            // Default empty state
            emptyStateEl.innerHTML = `
                <div class="empty-state-icon">
                    <span class="material-symbols-outlined">spa</span>
                </div>
                <div class="empty-state-text">작성된 일기가 없습니다</div>
                <div class="empty-state-desc">왼쪽 폼을 작성해 오늘 하루 감사했던 순간을 남겨보세요. 삶의 긍정적인 에너지가 채워집니다.</div>
            `;
        }
    } else {
        if (emptyStateEl) emptyStateEl.style.display = 'none';
        timelineEl.style.display = 'grid';
        
        filtered.forEach(entry => {
            const card = document.createElement('article');
            card.className = 'diary-card';
            
            const dateInfo = formatKoreanDate(entry.entry_date);
            
            // Mood icons & strings translator
            const MOOD_META = {
                grateful: { label: '감사해요', emoji: '🙏' },
                joyful: { label: '기뻐요', emoji: '✨' },
                peaceful: { label: '평온해요', emoji: '🍃' },
                hopeful: { label: '희망차요', emoji: '🌅' },
                growth: { label: '성장해요', emoji: '🌱' }
            };
            
            const mood = MOOD_META[entry.mood] || { label: '감사해요', emoji: '🙏' };
            
            const bulletsHtml = entry.items.map(item => `
                <div class="diary-bullet-item">
                    <span class="material-symbols-outlined icon">favorite</span>
                    <span>${item}</span>
                </div>
            `).join('');
            
            const reflectionHtml = entry.reflection ? `
                <div class="diary-reflection">"${entry.reflection}"</div>
            ` : '';
            
            const tagsHtml = entry.tags && entry.tags.length > 0 ? `
                <div class="diary-tags">
                    ${entry.tags.map(t => `<span class="diary-tag">#${t}</span>`).join('')}
                </div>
            ` : '';
            
            const aiResponseHtml = entry.ai_response ? `
                <div class="ai-response-box">
                    <div class="ai-response-title">
                        <span class="material-symbols-outlined icon">psychology</span>
                        <span>AI 마음챙김 동반자</span>
                    </div>
                    <p class="ai-response-content">${entry.ai_response}</p>
                </div>
            ` : '';
            
            card.innerHTML = `
                <div class="diary-header">
                    <div class="diary-date-group">
                        <span class="diary-date">${dateInfo.formatted}</span>
                        <span class="diary-day">${dateInfo.dayOfWeek}요일</span>
                    </div>
                    <div class="diary-mood-badge mood-${entry.mood}">
                        <span>${mood.emoji}</span>
                        <span>${mood.label}</span>
                    </div>
                </div>
                
                <div class="diary-bullet-list">
                    ${bulletsHtml}
                </div>
                
                ${reflectionHtml}
                ${tagsHtml}
                ${aiResponseHtml}
                
                <div class="diary-actions" style="margin-top: 8px; justify-content: flex-end;">
                    <button class="btn-icon" onclick="openEditModal('${entry.id}')" title="수정" style="width: 32px; height: 32px; font-size: 1.1rem;">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="btn-icon" onclick="triggerDeleteEntry('${entry.id}')" title="삭제" style="width: 32px; height: 32px; font-size: 1.1rem; color: var(--error);">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            `;
            
            timelineEl.appendChild(card);
        });
    }
}

function updateUI() {
    updateStatistics();
    renderTimeline();
}

// --- Popup Modals Management ---
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    console.log("closeModal 호출됨, id:", id);
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        console.log("모달 active 클래스 제거 완료:", id);
    } else {
        console.error("closeModal 에러: 모달 요소를 찾을 수 없음, id:", id);
    }
}

// Global binders for modal close buttons
document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
    });
});

// Click outside modal to close
document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

// --- Settings Handler ---
const saveSettingsBtn = document.getElementById('save-settings-btn');
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        const url = document.getElementById('supabase-url').value.trim();
        const key = document.getElementById('supabase-key').value.trim();
        
        // Save Groq settings
        const groqKeyEl = document.getElementById('groq-key');
        const groqModelEl = document.getElementById('groq-model');
        if (groqKeyEl && groqModelEl) {
            localStorage.setItem('aura_groq_key', groqKeyEl.value.trim());
            localStorage.setItem('aura_groq_model', groqModelEl.value);
            initGroqSettings();
        }
        
        if (url && key) {
            localStorage.setItem('aura_supabase_url', url);
            localStorage.setItem('aura_supabase_key', key);
            showToast("설정이 성공적으로 저장되었습니다.", "success");
            closeModal('settings-modal');
            
            // Re-boot Supabase
            initSupabase();
        } else {
            // If cleared, fallback to local storage mode
            localStorage.removeItem('aura_supabase_url');
            localStorage.removeItem('aura_supabase_key');
            showToast("설정이 성공적으로 저장되었습니다. (로컬 모드)", "success");
            closeModal('settings-modal');
            fallbackToLocalMode();
        }
    });
}

// Settings toggle trigger
const settingsToggleBtn = document.getElementById('settings-toggle');
if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener('click', () => {
        openModal('settings-modal');
    });
}

// Sync Local trigger
const syncLocalBtn = document.getElementById('sync-local-btn');
if (syncLocalBtn) {
    syncLocalBtn.addEventListener('click', () => {
        const confirmSync = confirm("로컬 저장소에 저장된 감사일기를 Supabase 클라우드로 업로드하시겠습니까? 업로드 후 로컬 데이터는 동기화 상태 유지를 위해 비워집니다.");
        if (confirmSync) {
            StorageService.syncLocalToCloud();
        }
    });
}

// --- Theme Management ---
const themeToggleBtn = document.getElementById('theme-toggle');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('aura_theme', nextTheme);
        
        const iconSpan = themeToggleBtn.querySelector('.material-symbols-outlined');
        if (iconSpan) {
            iconSpan.textContent = nextTheme === 'dark' ? 'light_mode' : 'dark_mode';
        }
        showToast(nextTheme === 'dark' ? "다크 모드가 적용되었습니다." : "라이트 모드가 적용되었습니다.", "info");
    });
}

// Set saved theme on startup
const savedTheme = localStorage.getItem('aura_theme');
if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    const iconSpan = themeToggleBtn?.querySelector('.material-symbols-outlined');
    if (iconSpan) {
        iconSpan.textContent = savedTheme === 'dark' ? 'light_mode' : 'dark_mode';
    }
}

// --- Entry Write Handler ---
const entryForm = document.getElementById('entry-form');
if (entryForm) {
    console.log("감사일기 제출 리스너 등록 완료");
    entryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("일기 저장하기 제출 이벤트 실행됨!");
        
        const entry_date = document.getElementById('entry-date').value;
        const mood = state.activeMood;
        
        // Collect gratitude items
        const itemInputs = document.querySelectorAll('.gratitude-item-input');
        const items = [];
        itemInputs.forEach(input => {
            const val = input.value.trim();
            // In creation form, inputs that are hidden or empty won't be collected
            if (val && input.closest('.input-bullet-wrapper').style.display !== 'none') {
                items.push(val);
            }
        });
        
        if (items.length < 1) {
            showToast("감사한 일을 1가지 이상 입력하세요.", "warning");
            return;
        }
        
        const reflection = document.getElementById('reflection-input').value.trim();
        
        // Process tags: split by comma, remove hash sign and whitespaces
        const tagsInputVal = document.getElementById('tags-input').value.trim();
        const tags = tagsInputVal ? tagsInputVal.split(',').map(t => t.replace('#', '').trim()).filter(t => t) : [];
        
        const newEntry = {
            entry_date,
            mood,
            items,
            reflection,
            tags,
            created_at: new Date().toISOString()
        };
        
        const submitBtn = entryForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span> AI 분석 및 저장 중...`;
        }
        
        try {
            const success = await StorageService.saveEntry(newEntry);
            if (success) {
                resetFormInputs();
            }
        } catch (err) {
            console.error("일기 저장 처리 실패:", err);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.innerHTML = `<span class="material-symbols-outlined">edit_note</span> 일기 저장하기`;
            }
        }
    });
}

// Mood selector binder in creation form
document.querySelectorAll('.mood-selector .mood-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mood-selector .mood-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = e.target.closest('.mood-btn');
        if (activeBtn) {
            activeBtn.classList.add('active');
            state.activeMood = activeBtn.getAttribute('data-mood');
        }
    });
});

// --- Search & Filters Event Listeners ---
const searchInput = document.getElementById('search-query');
const moodFilterSelect = document.getElementById('filter-mood');
const timeFilterSelect = document.getElementById('filter-time');

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        state.filters.query = e.target.value;
        renderTimeline();
    });
}

if (moodFilterSelect) {
    moodFilterSelect.addEventListener('change', (e) => {
        state.filters.mood = e.target.value;
        renderTimeline();
    });
}

if (timeFilterSelect) {
    timeFilterSelect.addEventListener('change', (e) => {
        state.filters.time = e.target.value;
        renderTimeline();
    });
}

// --- Auth Modal (Login / Sign Up) logic ---
const authForm = document.getElementById('auth-form');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchLink = document.getElementById('auth-switch-link');
const authModalTitle = document.getElementById('auth-modal-title');
const authSwitchText = document.getElementById('auth-switch-text');

if (authSwitchLink) {
    authSwitchLink.addEventListener('click', () => {
        if (state.authMode === 'login') {
            state.authMode = 'signup';
            authModalTitle.innerHTML = `<span class="material-symbols-outlined text-primary">person_add</span> 회원가입`;
            authSubmitBtn.textContent = "가입하기";
            authSwitchText.innerHTML = `이미 계정이 있으신가요? <span id="auth-switch-link" class="auth-switch-link">로그인하기</span>`;
        } else {
            state.authMode = 'login';
            authModalTitle.innerHTML = `<span class="material-symbols-outlined text-primary">login</span> 로그인`;
            authSubmitBtn.textContent = "로그인";
            authSwitchText.innerHTML = `아직 계정이 없으신가요? <span id="auth-switch-link" class="auth-switch-link">회원가입하기</span>`;
        }
        
        // Re-bind click event since we re-wrote HTML content dynamically
        document.getElementById('auth-switch-link').addEventListener('click', () => authSwitchLink.click());
    });
}

if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("로그인/회원가입 폼 제출 이벤트 트리거됨!");
        
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        
        if (!state.isSupabaseMode || !state.supabaseClient) {
            showToast("먼저 설정 패널에서 Supabase 연결을 완료하세요.", "warning");
            console.log("로그인 차단: Supabase 모드가 아님");
            return;
        }
        
        authSubmitBtn.disabled = true;
        authSubmitBtn.style.opacity = '0.7';
        state.isExplicitLogin = true; // Set flag for explicit action
        
        try {
            if (state.authMode === 'login') {
                console.log("Supabase signInWithPassword 호출 시도... email:", email);
                // 30초 타임아웃 레이스 결합
                const { data, error } = await Promise.race([
                    state.supabaseClient.auth.signInWithPassword({ email, password }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("네트워크 연결 시간 초과 (설정된 Supabase URL이 올바른지 확인해 주세요)")), 30000))
                ]);
                console.log("Supabase signInWithPassword 응답 수신. error:", error);
                if (error) throw error;
                console.log("로그인 성공. closeModal('auth-modal') 호출 직전");
                closeModal('auth-modal');
                authForm.reset();
                console.log("로그인 완료 처리 끝");
            } else {
                console.log("Supabase signUp 호출 시도... email:", email);
                // 30초 타임아웃 레이스 결합
                const { data, error } = await Promise.race([
                    state.supabaseClient.auth.signUp({ email, password }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("네트워크 연결 시간 초과 (설정된 Supabase URL이 올바른지 확인해 주세요)")), 30000))
                ]);
                console.log("Supabase signUp 응답 수신. error:", error);
                if (error) throw error;
                showToast("인증 이메일을 전송했습니다. 이메일을 확인하고 로그인을 완료하세요.", "info");
                closeModal('auth-modal');
                authForm.reset();
                console.log("회원가입 완료 처리 끝");
            }
        } catch (err) {
            console.error("인증 에러:", err);
            showToast(`실패: ${err.message}`, "error");
            state.isExplicitLogin = false; // Reset on error
        } finally {
            authSubmitBtn.disabled = false;
            authSubmitBtn.style.opacity = '1';
        }
    });
}

// --- Entry Editing Handlers ---
let activeEditMood = 'grateful';

// Exposed globally so inline onclick handlers in timeline cards resolve safely
window.openEditModal = function(id) {
    const entry = state.diaries.find(e => e.id === id);
    if (!entry) return;
    
    document.getElementById('edit-id').value = entry.id;
    document.getElementById('edit-date').value = entry.entry_date;
    
    // Set edit mood selector
    activeEditMood = entry.mood;
    document.querySelectorAll('#edit-mood-selector .mood-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-mood') === entry.mood) {
            btn.classList.add('active');
        }
    });
    
    // Render edit item input fields (up to 5 lines depending on entry items length)
    const itemsContainer = document.getElementById('edit-items-container');
    if (itemsContainer) {
        itemsContainer.innerHTML = '';
        
        // Show at least 3 fields, or more if the entry has 4 or 5 items
        const fieldsCount = Math.max(3, entry.items.length);
        
        for (let i = 0; i < fieldsCount; i++) {
            const bulletVal = entry.items[i] || '';
            const isRequired = i < 1 ? 'required' : '';
            
            const wrapper = document.createElement('div');
            wrapper.className = 'input-bullet-wrapper';
            wrapper.innerHTML = `
                <span class="input-bullet-num">${i + 1}</span>
                <input type="text" class="edit-item-input" value="${bulletVal}" placeholder="${i + 1}번째 감사 일기를 입력해 보세요." ${isRequired}>
            `;
            itemsContainer.appendChild(wrapper);
        }
    }
    
    // Reflection
    document.getElementById('edit-reflection').value = entry.reflection || '';
    
    // Tags
    document.getElementById('edit-tags').value = entry.tags ? entry.tags.join(', ') : '';
    
    openModal('edit-modal');
};

// Mood selector click logic inside Edit Modal
document.querySelectorAll('#edit-mood-selector .mood-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#edit-mood-selector .mood-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = e.target.closest('.mood-btn');
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeEditMood = activeBtn.getAttribute('data-mood');
        }
    });
});

// Edit submit button
const saveEditBtn = document.getElementById('save-edit-btn');
if (saveEditBtn) {
    saveEditBtn.addEventListener('click', async () => {
        const id = document.getElementById('edit-id').value;
        const entry_date = document.getElementById('edit-date').value;
        
        // Collect bullet inputs
        const itemInputs = document.querySelectorAll('.edit-item-input');
        const items = [];
        itemInputs.forEach(input => {
            const val = input.value.trim();
            if (val) items.push(val);
        });
        
        if (items.length < 1) {
            showToast("감사한 일을 1가지 이상 입력하세요.", "warning");
            return;
        }
        
        const reflection = document.getElementById('edit-reflection').value.trim();
        const tagsInputVal = document.getElementById('edit-tags').value.trim();
        const tags = tagsInputVal ? tagsInputVal.split(',').map(t => t.replace('#', '').trim()).filter(t => t) : [];
        
        const originalEntry = state.diaries.find(e => e.id === id);
        const updatedEntry = {
            id,
            entry_date,
            mood: activeEditMood,
            items,
            reflection,
            tags,
            created_at: originalEntry ? originalEntry.created_at : new Date().toISOString()
        };
        
        if (saveEditBtn) {
            saveEditBtn.disabled = true;
            saveEditBtn.style.opacity = '0.7';
            saveEditBtn.innerHTML = `저장 중...`;
        }
        
        try {
            const success = await StorageService.saveEntry(updatedEntry);
            if (success) {
                closeModal('edit-modal');
            }
        } catch (err) {
            console.error("일기 수정 처리 실패:", err);
        } finally {
            if (saveEditBtn) {
                saveEditBtn.disabled = false;
                saveEditBtn.style.opacity = '1';
                saveEditBtn.innerHTML = `수정 완료`;
            }
        }
    });
}

// Delete trigger
window.triggerDeleteEntry = function(id) {
    const entry = state.diaries.find(e => e.id === id);
    if (!entry) return;
    
    const confirmDelete = confirm(`${formatKoreanDate(entry.entry_date).formatted} 일기를 정말 삭제하시겠습니까?`);
    if (confirmDelete) {
        StorageService.deleteEntry(id);
    }
};

// --- Boot Strap application ---
function boot() {
    console.log("Aura Gratitude system starting up...");
    
    // Set date input default value to local today
    const dateInput = document.getElementById('entry-date');
    if (dateInput) {
        dateInput.value = getLocalDateString(0);
        // Don't allow writing future diaries
        dateInput.max = getLocalDateString(0);
    }
    
    // Render local diaries immediately for fast loading
    StorageService.fetchEntries().then(() => updateUI());
    
    // Initialize Groq settings
    initGroqSettings();
    
    // Boot storage syncing and setup
    initSupabase();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
