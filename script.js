// DOM Elements
const displayInput = document.getElementById('display-input');
const displayExpression = document.getElementById('display-expression');
const inputCursor = document.getElementById('input-cursor');
const sciPanel = document.getElementById('sci-panel');
const modeStdBtn = document.getElementById('mode-std');
const modeSciBtn = document.getElementById('mode-sci');
const degRadToggle = document.getElementById('deg-rad-toggle');
const themeBtns = document.querySelectorAll('.theme-btn');
const historyToggle = document.getElementById('history-toggle');
const historyClose = document.getElementById('history-close');
const historyClear = document.getElementById('history-clear');
const historyDrawer = document.getElementById('history-drawer');
const historyList = document.getElementById('history-list');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// State Variables
let currentInput = '0';
let expressionString = '';
let isResultDisplayed = false;
let angleMode = 'DEG'; // 'DEG' or 'RAD'
let history = [];

// Initialize Web Audio Context for tactile clicks
let audioCtx = null;
function playClickSound() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, audioCtx.currentTime); // High-pitched click
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05);
        
        gain.gain.setValueAtTime(0.015, audioCtx.currentTime); // Very soft volume
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    } catch (e) {
        console.log('Audio feedback failed to play:', e);
    }
}

// Format numbers for display (adding commas for thousands)
function formatDisplayNumber(numStr) {
    if (numStr === 'Error' || numStr === 'Infinity' || numStr === '-Infinity' || numStr === 'NaN') {
        return numStr;
    }
    
    // Avoid formatting expressions in the input display
    if (isNaN(numStr) || numStr.includes('(') || numStr.includes(')') || numStr.includes('sin') || numStr.includes('cos') || numStr.includes('tan')) {
        return numStr;
    }
    
    const parts = numStr.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

// Update Display UI
function updateDisplay() {
    // Standardize representation for math display
    displayInput.textContent = formatDisplayNumber(currentInput);
    displayExpression.textContent = expressionString;
    
    // Auto-scroll input to the right if it gets too long
    displayInput.scrollLeft = displayInput.scrollWidth;
}

// Mode Selection
modeStdBtn.addEventListener('click', () => {
    playClickSound();
    modeStdBtn.classList.add('active');
    modeSciBtn.classList.remove('active');
    sciPanel.classList.add('collapsed');
});

modeSciBtn.addEventListener('click', () => {
    playClickSound();
    modeSciBtn.classList.add('active');
    modeStdBtn.classList.remove('active');
    sciPanel.classList.remove('collapsed');
});

// Theme Management
themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        playClickSound();
        const theme = btn.getAttribute('data-theme');
        
        // Remove current themes
        document.body.classList.remove('theme-dark', 'theme-light', 'theme-cyberpunk');
        document.body.classList.add(`theme-${theme}`);
        
        // Update active class
        themeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        localStorage.setItem('aura-calc-theme', theme);
    });
});

// Load saved theme
function loadTheme() {
    const savedTheme = localStorage.getItem('aura-calc-theme') || 'dark';
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-cyberpunk');
    document.body.classList.add(`theme-${savedTheme}`);
    
    themeBtns.forEach(btn => {
        if (btn.getAttribute('data-theme') === savedTheme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// History Drawer Actions
historyToggle.addEventListener('click', () => {
    playClickSound();
    renderHistory();
    historyDrawer.classList.add('open');
});

historyClose.addEventListener('click', () => {
    playClickSound();
    historyDrawer.classList.remove('open');
});

historyClear.addEventListener('click', () => {
    playClickSound();
    history = [];
    localStorage.setItem('aura-calc-history', JSON.stringify(history));
    renderHistory();
});

// Load history from storage
function loadHistory() {
    const savedHistory = localStorage.getItem('aura-calc-history');
    if (savedHistory) {
        history = JSON.parse(savedHistory);
    }
}

// Render History list
function renderHistory() {
    historyList.innerHTML = '';
    
    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="empty-history">
                <i data-lucide="clock" class="empty-icon"></i>
                <p>저장된 계산 기록이 없습니다</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    history.forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div class="history-item-exp">${item.expression} =</div>
            <div class="history-item-res">${formatDisplayNumber(item.result)}</div>
        `;
        
        historyItem.addEventListener('click', () => {
            playClickSound();
            currentInput = item.result;
            expressionString = item.expression;
            isResultDisplayed = true;
            updateDisplay();
            historyDrawer.classList.remove('open');
        });
        
        historyList.appendChild(historyItem);
    });
}

// Clipboard Copy
displayInput.addEventListener('click', () => {
    if (currentInput === '0' || currentInput === 'Error') return;
    
    navigator.clipboard.writeText(currentInput.replace(/,/g, ''))
        .then(() => {
            showToast('결과가 클립보드에 복사되었습니다.');
        })
        .catch(err => {
            console.error('클립보드 복사 실패:', err);
        });
});

function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// Calculator Logic Operations
function appendNumber(num) {
    if (isResultDisplayed) {
        currentInput = num;
        expressionString = '';
        isResultDisplayed = false;
    } else {
        if (currentInput === '0' && num !== '.') {
            currentInput = num;
        } else {
            // Prevent multiple decimals in the current input token
            if (num === '.' && currentInput.includes('.')) return;
            currentInput += num;
        }
    }
    updateDisplay();
}

function handleOperator(op) {
    isResultDisplayed = false;
    
    const displayOp = op === '*' ? '×' : op === '/' ? '÷' : op;
    
    // If there is a current input, push it to expression
    if (currentInput !== '') {
        // Remove trailing decimal if any
        if (currentInput.endsWith('.')) {
            currentInput = currentInput.slice(0, -1);
        }
        expressionString += ' ' + currentInput + ' ' + displayOp;
        currentInput = '';
    } else if (expressionString !== '') {
        // If last character in expression is an operator, replace it
        const trimmed = expressionString.trim();
        const lastChar = trimmed.slice(-1);
        if (['+', '-', '×', '÷', '^'].includes(lastChar)) {
            expressionString = trimmed.slice(0, -1) + displayOp;
        } else {
            expressionString += ' ' + displayOp;
        }
    } else {
        // Empty starting input: use 0 as base
        expressionString = '0 ' + displayOp;
    }
    
    updateDisplay();
}

function handleBackspace() {
    if (isResultDisplayed) {
        expressionString = '';
        currentInput = '0';
        isResultDisplayed = false;
    } else if (currentInput.length > 0) {
        currentInput = currentInput.slice(0, -1);
        if (currentInput === '' || currentInput === '-') {
            currentInput = '0';
        }
    }
    updateDisplay();
}

function clearAll() {
    currentInput = '0';
    expressionString = '';
    isResultDisplayed = false;
    updateDisplay();
}

function toggleSign() {
    if (isResultDisplayed) {
        currentInput = (parseFloat(currentInput) * -1).toString();
        expressionString = '';
        isResultDisplayed = false;
    } else {
        if (currentInput.startsWith('-')) {
            currentInput = currentInput.slice(1);
        } else if (currentInput !== '0') {
            currentInput = '-' + currentInput;
        }
    }
    updateDisplay();
}

function handleParenthesis() {
    if (isResultDisplayed) {
        clearAll();
    }
    
    // Smart Parenthesis matching
    const openCount = (expressionString.match(/\(/g) || []).length;
    const closeCount = (expressionString.match(/\)/g) || []).length;
    
    const lastChar = expressionString.trim().slice(-1);
    const hasCurrentInput = currentInput !== '' && currentInput !== '0';
    
    if (hasCurrentInput) {
        if (openCount > closeCount) {
            expressionString += ' ' + currentInput + ' )';
            currentInput = '';
        } else {
            expressionString += ' ' + currentInput + ' × (';
            currentInput = '';
        }
    } else {
        // No current input, check expression state
        if (['+', '-', '×', '÷', '(', '^'].includes(lastChar) || expressionString === '') {
            expressionString += ' (';
        } else if (openCount > closeCount) {
            expressionString += ' )';
        } else {
            expressionString += ' × (';
        }
    }
    updateDisplay();
}

function handleScientificAction(action) {
    if (isResultDisplayed) {
        expressionString = '';
        isResultDisplayed = false;
    }
    
    if (action === 'pi') {
        currentInput = 'π';
    } else if (action === 'e') {
        currentInput = 'e';
    } else if (action === 'deg-rad') {
        angleMode = angleMode === 'DEG' ? 'RAD' : 'DEG';
        degRadToggle.textContent = angleMode;
        showToast(`각도 단위가 ${angleMode}로 변경되었습니다.`);
    } else if (action === 'percent') {
        if (currentInput !== '' && !isNaN(currentInput)) {
            currentInput = (parseFloat(currentInput) / 100).toString();
        }
    } else if (action === 'factorial') {
        if (currentInput !== '' && !isNaN(currentInput)) {
            currentInput += '!';
        }
    } else {
        // sin, cos, tan, log, ln, sqrt, pow
        if (action === 'pow') {
            handleOperator('^');
            return;
        }
        
        // Functions: sin, cos, tan, log, ln, sqrt
        const lastChar = expressionString.trim().slice(-1);
        if (expressionString !== '' && !['+', '-', '×', '÷', '(', '^'].includes(lastChar) && currentInput === '') {
            expressionString += ' × ' + action + '(';
        } else {
            if (currentInput !== '' && currentInput !== '0') {
                expressionString += ' ' + action + '(' + currentInput;
                currentInput = '';
            } else {
                expressionString += ' ' + action + '(';
            }
        }
    }
    updateDisplay();
}

// Math Engine Evaluator
function evaluateFormula(jsFormula) {
    const degToRad = (val) => angleMode === 'DEG' ? val * Math.PI / 180 : val;
    const sin = (x) => {
        // Clean up small values close to 0 to prevent sin(180) returning 1e-16
        const result = Math.sin(degToRad(x));
        return Math.abs(result) < 1e-15 ? 0 : result;
    };
    const cos = (x) => {
        // Clean up small values close to 0 to prevent cos(90) returning 1e-16
        const result = Math.cos(degToRad(x));
        return Math.abs(result) < 1e-15 ? 0 : result;
    };
    const tan = (x) => {
        // Handle infinity for tan(90) in degrees
        if (angleMode === 'DEG' && Math.abs((x - 90) % 180) < 1e-9) return Infinity;
        const result = Math.tan(degToRad(x));
        return Math.abs(result) < 1e-15 ? 0 : result;
    };
    const log = (x) => Math.log10(x);
    const ln = (x) => Math.log(x);
    const sqrt = (x) => Math.sqrt(x);
    const π = Math.PI;
    const e = Math.E;
    
    const fact = (n) => {
        if (n < 0 || !Number.isInteger(n)) return NaN;
        if (n === 0 || n === 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return result;
    };
    
    let formulaToEval = jsFormula;
    
    // Parse factorials (e.g. "5!" -> "fact(5)")
    let factRegex = /(\d+(?:\.\d+)?|π|e|\([^)]+\))!/;
    while (factRegex.test(formulaToEval)) {
        formulaToEval = formulaToEval.replace(factRegex, 'fact($1)');
    }
    
    // Parse implicit multiplication (e.g., "5π" -> "5*π" or "3(2+1)" -> "3*(2+1)")
    formulaToEval = formulaToEval
        .replace(/(\d+)(π|e|\()/g, '$1*$2')
        .replace(/(π|e)(\d+|\()/g, '$1*$2')
        .replace(/\)([\d(πe])/g, ')*$1');

    // Replace mathematical symbols with JS expressions
    formulaToEval = formulaToEval.replaceAll('^', '**');
    formulaToEval = formulaToEval.replaceAll('×', '*').replaceAll('÷', '/');
    formulaToEval = formulaToEval.replaceAll('π', 'π').replaceAll('e', 'e');
    
    // Run evaluation in a clean function scope
    const evalFunc = new Function(
        'sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'fact', 'π', 'e',
        `return (${formulaToEval})`
    );
    
    const result = evalFunc(sin, cos, tan, log, ln, sqrt, fact, π, e);
    
    // Check validation of result
    if (typeof result !== 'number' || isNaN(result)) {
        throw new Error('NaN');
    }
    
    // Format precision to avoid decimal issues (e.g. 0.1 + 0.2 = 0.30000000000000004)
    if (!Number.isInteger(result)) {
        // Limit to 12 decimal places to fit screen and clean up floating point errors
        return parseFloat(result.toFixed(12)).toString();
    }
    
    return result.toString();
}

function calculate() {
    let fullExpression = expressionString;
    
    // Check if there's current input to append
    if (currentInput !== '') {
        // Remove trailing dot
        if (currentInput.endsWith('.')) {
            currentInput = currentInput.slice(0, -1);
        }
        fullExpression += ' ' + currentInput;
    }
    
    const cleanExpression = fullExpression.trim();
    if (cleanExpression === '') return;
    
    // Close any unclosed parentheses automatically
    let openParens = (cleanExpression.match(/\(/g) || []).length;
    let closeParens = (cleanExpression.match(/\)/g) || []).length;
    let autoCompletedExpression = cleanExpression;
    while (openParens > closeParens) {
        autoCompletedExpression += ' )';
        closeParens++;
    }
    
    try {
        const result = evaluateFormula(autoCompletedExpression);
        
        // Push to history
        const historyItem = {
            expression: autoCompletedExpression,
            result: result
        };
        history.unshift(historyItem); // Add to top
        if (history.length > 50) history.pop(); // Max 50 items
        
        localStorage.setItem('aura-calc-history', JSON.stringify(history));
        
        // Update states
        expressionString = autoCompletedExpression;
        currentInput = result;
        isResultDisplayed = true;
    } catch (err) {
        console.error('Calculation Error:', err);
        currentInput = 'Error';
        isResultDisplayed = true;
    }
    
    updateDisplay();
}

// Bind Button click event listeners
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        playClickSound();
        
        // Retrieve values and actions
        const val = btn.getAttribute('data-val');
        const action = btn.getAttribute('data-action');
        
        if (val) {
            if (['+', '-', '*', '/'].includes(val)) {
                handleOperator(val);
            } else if (val === 'negate') {
                toggleSign();
            } else {
                appendNumber(val);
            }
        } else if (action) {
            switch (action) {
                case 'clear':
                    clearAll();
                    break;
                case 'backspace':
                    handleBackspace();
                    break;
                case 'parenthesis':
                    handleParenthesis();
                    break;
                case 'calculate':
                    calculate();
                    break;
                default:
                    // Scientific actions
                    handleScientificAction(action);
                    break;
            }
        }
    });
});

// Desktop Keyboard Bindings
document.addEventListener('keydown', (e) => {
    const key = e.key;
    
    // Add visual click effect/active trigger for accessibility & UI
    let btnToClick = null;
    
    if (key >= '0' && key <= '9') {
        btnToClick = document.querySelector(`.btn-num[data-val="${key}"]`);
        if (btnToClick) {
            btnToClick.click();
            animateKeypress(btnToClick);
        }
    } else if (key === '.') {
        btnToClick = document.querySelector(`.btn-num[data-val="."]`);
        if (btnToClick) {
            btnToClick.click();
            animateKeypress(btnToClick);
        }
    } else if (key === '+' || key === '-' || key === '*' || key === '/') {
        btnToClick = document.querySelector(`.btn-op[data-val="${key}"]`);
        if (btnToClick) {
            btnToClick.click();
            animateKeypress(btnToClick);
        }
    } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        btnToClick = document.querySelector('.btn-equals');
        if (btnToClick) {
            btnToClick.click();
            animateKeypress(btnToClick);
        }
    } else if (key === 'Backspace') {
        btnToClick = document.querySelector('.btn-op[data-action="backspace"]');
        if (btnToClick) {
            btnToClick.click();
            animateKeypress(btnToClick);
        }
    } else if (key === 'Escape') {
        btnToClick = document.querySelector('.btn-clear');
        if (btnToClick) {
            btnToClick.click();
            animateKeypress(btnToClick);
        }
    } else if (key === '(' || key === ')') {
        btnToClick = document.querySelector('.btn-op[data-action="parenthesis"]');
        if (btnToClick) {
            btnToClick.click();
            animateKeypress(btnToClick);
        }
    }
});

function animateKeypress(btn) {
    btn.style.transform = 'scale(0.92)';
    setTimeout(() => {
        btn.style.transform = '';
    }, 100);
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadHistory();
    updateDisplay();
});
