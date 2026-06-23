console.log("script.js 실행 시작...");
const { useState, useEffect, useRef, useCallback } = window.React;
const { createRoot } = window.ReactDOM;
const htm = window.htm;

const html = htm.bind(window.React.createElement);

// Constants
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const WASM_DIRECTORY = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm";

const SAMPLE_IMAGES = [
    { name: "인물 샘플 1", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=80" },
    { name: "인물 샘플 2", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1000&q=80" },
    { name: "인물 샘플 3", url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1000&q=80" }
];

const FONTS = [
    { name: "Hanken Grotesk (Modern)", value: "'Hanken Grotesk', sans-serif" },
    { name: "Montserrat (Bold)", value: "'Montserrat', sans-serif" },
    { name: "Playfair Display (Serif)", value: "'Playfair Display', serif" },
    { name: "Black Han Sans (Korean Bold)", value: "'Black Han Sans', sans-serif" },
    { name: "Noto Sans KR (Clean Korean)", value: "'Noto Sans KR', sans-serif" },
    { name: "Outfit (Tech)", value: "'Outfit', sans-serif" }
];

const BLEND_MODES = [
    { name: "Normal", value: "normal" },
    { name: "Overlay", value: "overlay" },
    { name: "Multiply", value: "multiply" },
    { name: "Screen", value: "screen" },
    { name: "Hard Light", value: "hard-light" },
    { name: "Soft Light", value: "soft-light" },
    { name: "Difference", value: "difference" }
];

// Helper: Download file with progress tracking
async function fetchModelWithProgress(url, onProgress) {
    // Check if the model is cached in Cache Storage first
    const cache = await caches.open('nuggi-cache-v7');
    const cachedResponse = await cache.match(url);
    
    if (cachedResponse) {
        onProgress(100, 100);
        return await cachedResponse.blob();
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 5600000; // fallback if no length
    
    let loaded = 0;
    const reader = response.body.getReader();
    const chunks = [];
    
    while(true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        onProgress(loaded, total);
    }
    
    const blob = new Blob(chunks);
    
    // Cache the downloaded blob
    try {
        const responseToCache = new Response(blob);
        await cache.put(url, responseToCache);
    } catch (err) {
        console.warn('Failed to cache model:', err);
    }

    return blob;
}

function App() {
    // MediaPipe & AI Model States
    const [modelLoaded, setModelLoaded] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingStep, setLoadingStep] = useState("AI 엔진 리소스 초기화 중...");
    const segmenterRef = useRef(null);

    // Image States
    const [imageLoaded, setImageLoaded] = useState(false);
    const [originalImage, setOriginalImage] = useState(null); // { el, width, height, src }
    const [maskData, setMaskData] = useState(null); // { width, height, array }
    const [foregroundSrc, setForegroundSrc] = useState(null);

    // Editing States
    const [activeLayer, setActiveLayer] = useState("text"); // 'foreground', 'text', 'background'
    const [zoom, setZoom] = useState(100); // percentage
    const [tool, setTool] = useState("select"); // 'select', 'hand'
    const [showHelp, setShowHelp] = useState(true);
    const [toastMessage, setToastMessage] = useState("");

    // Text Properties
    const [textState, setTextState] = useState({
        text: "CREATIVE",
        fontFamily: "'Hanken Grotesk', sans-serif",
        fontWeight: "800",
        fontSize: 160,
        fillColor: "#ffffff",
        opacity: 90,
        blendMode: "overlay",
        strokeColor: "#000000",
        strokeWidth: 0,
        shadowColor: "rgba(0,0,0,0.4)",
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowOffsetY: 5,
        letterSpacing: 2,
        lineHeight: 1.1,
        x: 50, // Percentage (centered)
        y: 55, // Percentage
        rotation: 0,
        flipX: false,
        flipY: false
    });

    // Adjustment States
    const [bgBlur, setBgBlur] = useState(0); // px
    const [bgBrightness, setBgBrightness] = useState(100); // %
    const [bgContrast, setBgContrast] = useState(100); // %
    const [fgBrightness, setFgBrightness] = useState(100); // %
    const [maskFeather, setMaskFeather] = useState(2); // px

    // History (Undo/Redo)
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Layout Refs
    const containerRef = useRef(null);
    const textRef = useRef(null);
    const viewportRef = useRef(null);
    const fileInputRef = useRef(null);
    const dragStartRef = useRef(null);

    // 1. Initialize MediaPipe
    useEffect(() => {
        async function initAI() {
            try {
                setLoadingStep("WASM 라이브러리 준비 중...");
                setLoadingProgress(10);
                
                // Dynamically import tasks-vision
                const mp = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs");
                const FilesetResolver = mp.FilesetResolver;
                const ImageSegmenter = mp.ImageSegmenter;
                
                setLoadingProgress(25);
                setLoadingStep("Selfie Segmenter 모델 로드 중...");

                const modelBlob = await fetchModelWithProgress(MODEL_URL, (loaded, total) => {
                    const pct = Math.round((loaded / total) * 60) + 25; // Map to 25%-85%
                    setLoadingProgress(pct);
                    setLoadingStep(`AI 모델 파일 다운로드 중... (${Math.round((loaded/total)*100)}%)`);
                });

                setLoadingProgress(90);
                setLoadingStep("AI 인퍼런스 엔진 빌드 중...");

                const modelUrl = URL.createObjectURL(modelBlob);
                const vision = await FilesetResolver.forVisionTasks(WASM_DIRECTORY);
                
                const segmenter = await ImageSegmenter.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: modelUrl,
                        delegate: "GPU"
                    },
                    runningMode: "IMAGE",
                    outputCategoryMask: true,
                    outputConfidenceMasks: false
                });

                segmenterRef.current = segmenter;
                setModelLoaded(true);
                setLoadingProgress(100);
                showToast("100% 로컬 AI 엔진 로드 완료!");
            } catch (err) {
                console.error("AI Initialization failed:", err);
                setLoadingStep("에러 발생: AI 모델을 로드할 수 없습니다.");
            }
        }
        initAI();
    }, []);

    // Helper: Toast alerts
    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(""), 3000);
    };

    // 2. Push state to history for undo/redo
    const saveToHistory = useCallback((newState) => {
        const stateToSave = newState || { textState, bgBlur, bgBrightness, bgContrast, fgBrightness, maskFeather };
        const histCopy = history.slice(0, historyIndex + 1);
        histCopy.push(JSON.parse(JSON.stringify(stateToSave)));
        setHistory(histCopy);
        setHistoryIndex(histCopy.length - 1);
    }, [textState, bgBlur, bgBrightness, bgContrast, fgBrightness, maskFeather, history, historyIndex]);

    const handleUndo = () => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            setHistoryIndex(prevIndex);
            applyHistoryState(history[prevIndex]);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            setHistoryIndex(nextIndex);
            applyHistoryState(history[nextIndex]);
        }
    };

    const applyHistoryState = (hState) => {
        setTextState(hState.textState);
        setBgBlur(hState.bgBlur);
        setBgBrightness(hState.bgBrightness);
        setBgContrast(hState.bgContrast);
        setFgBrightness(hState.fgBrightness);
        setMaskFeather(hState.maskFeather);
    };

    // 3. Segment Image & Generate Foreground Cutout
    const processImageSegmentation = useCallback((imgElement, width, height) => {
        if (!segmenterRef.current) {
            console.warn("segmenterRef.current가 정의되지 않았습니다!");
            return;
        }
        
        console.log("processImageSegmentation 시작! 크기:", width, "x", height);
        setLoadingStep("인물 배경 제거 중 (누끼 따는 중)...");
        setLoadingProgress(50);
        
        // Let UI update
        setTimeout(() => {
            try {
                console.log("MediaPipe segment() 호출 중...");
                segmenterRef.current.segment(imgElement, (result) => {
                    console.log("MediaPipe segment() 완료! 결과 마스크 획득.");
                    const maskArray = result.categoryMask.getAsUint8Array();
                    const maskW = result.categoryMask.width;
                    const maskH = result.categoryMask.height;
                    
                    console.log("마스크 수신 크기:", maskW, "x", maskH, "배열 길이:", maskArray.length);
                    
                    // Debug unique mask values to verify GPU normalization
                    const uniqueVals = new Set(maskArray);
                    console.log("마스크 배열의 고유한 값 리스트:", Array.from(uniqueVals));
                    
                    // Count pixel indices to verify model detection (check > 0 to support both CPU 1 and GPU 255 values)
                    let personPixels = 0;
                    for (let i = 0; i < maskArray.length; i++) {
                        if (maskArray[i] > 0) personPixels++;
                    }
                    console.log("인물 감지 픽셀 수:", personPixels, "비율:", Math.round((personPixels / maskArray.length) * 100), "%");
                    
                    setMaskData({ width: maskW, height: maskH, array: maskArray });
                    generateForegroundCutout(imgElement, maskW, maskH, maskArray, maskFeather);
                });
            } catch (err) {
                console.error("Segmentation error:", err);
                showToast("배경 분리 처리에 실패했습니다.");
            }
        }, 100);
    }, [maskFeather]);

    // Re-generate foreground when feather changes
    useEffect(() => {
        if (originalImage && maskData) {
            generateForegroundCutout(originalImage.el, maskData.width, maskData.height, maskData.array, maskFeather);
        }
    }, [maskFeather]);

    const generateForegroundCutout = (imgElement, mW, mH, mArray, feather) => {
        console.log("generateForegroundCutout 시작... 크기:", mW, "x", mH, "페더:", feather);
        const tempMaskCanvas = document.createElement("canvas");
        tempMaskCanvas.width = mW;
        tempMaskCanvas.height = mH;
        const mCtx = tempMaskCanvas.getContext("2d");
        
        const mImgData = mCtx.createImageData(mW, mH);
        for (let i = 0; i < mArray.length; i++) {
            const val = mArray[i] > 0 ? 255 : 0; // Capture all non-background pixels (1 or 255)
            mImgData.data[i * 4] = val;
            mImgData.data[i * 4 + 1] = val;
            mImgData.data[i * 4 + 2] = val;
            mImgData.data[i * 4 + 3] = val;
        }
        mCtx.putImageData(mImgData, 0, 0);

        // Create feathered/blended foreground
        const fgCanvas = document.createElement("canvas");
        fgCanvas.width = imgElement.naturalWidth || imgElement.width;
        fgCanvas.height = imgElement.naturalHeight || imgElement.height;
        const fgCtx = fgCanvas.getContext("2d");

        if (feather > 0) {
            fgCtx.filter = `blur(${feather}px)`;
            fgCtx.drawImage(tempMaskCanvas, 0, 0, fgCanvas.width, fgCanvas.height);
            fgCtx.filter = "none";
            fgCtx.globalCompositeOperation = "source-in";
            fgCtx.drawImage(imgElement, 0, 0);
        } else {
            fgCtx.drawImage(tempMaskCanvas, 0, 0, fgCanvas.width, fgCanvas.height);
            fgCtx.globalCompositeOperation = "source-in";
            fgCtx.drawImage(imgElement, 0, 0);
        }
        
        if (foregroundSrc && foregroundSrc.startsWith("blob:")) {
            URL.revokeObjectURL(foregroundSrc);
        }
        
        console.log("fgCanvas를 DataURL로 변환 중... 크기:", fgCanvas.width, "x", fgCanvas.height);
        try {
            const dataUrl = fgCanvas.toDataURL("image/png");
            console.log("fgCanvas DataURL 생성 완료. 길이:", dataUrl.length);
            setForegroundSrc(dataUrl);
            setImageLoaded(true);
            setLoadingProgress(100);
            showToast("배경 분리 완료!");
            
            // Auto fit zoom on load
            fitToScreen(imgElement.width, imgElement.height);
        } catch (err) {
            console.error("DataURL 변환 중 에러 발생:", err);
            showToast("이미지 변환 중 에러 발생");
        }
    };

    // 4. File Upload Handlers
    const loadUploadedFile = (file) => {
        if (!file) return;
        
        setLoadingProgress(20);
        setLoadingStep("이미지 로드 중...");
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const imgData = {
                    el: img,
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height,
                    aspect: (img.naturalWidth || img.width) / (img.naturalHeight || img.height),
                    src: e.target.result
                };
                setOriginalImage(imgData);
                processImageSegmentation(img, imgData.width, imgData.height);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        loadUploadedFile(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        loadUploadedFile(file);
    };

    const loadSample = (sampleUrl) => {
        setLoadingProgress(20);
        setLoadingStep("샘플 이미지 다운로드 중...");
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const imgData = {
                el: img,
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
                aspect: (img.naturalWidth || img.width) / (img.naturalHeight || img.height),
                src: sampleUrl
            };
            setOriginalImage(imgData);
            processImageSegmentation(img, imgData.width, imgData.height);
        };
        img.src = sampleUrl;
    };

    // 5. Interactive Zooming
    const fitToScreen = (w, h) => {
        if (!viewportRef.current) return;
        const viewW = viewportRef.current.clientWidth - 80;
        const viewH = viewportRef.current.clientHeight - 80;
        
        const zoomW = (viewW / w) * 100;
        const zoomH = (viewH / h) * 100;
        const fitZoom = Math.min(zoomW, zoomH, 100);
        setZoom(Math.round(fitZoom));
    };

    // 6. Text Drag and Drop Repositioning
    const handleTextMouseDown = (e) => {
        if (tool !== "select") return;
        e.preventDefault();
        e.stopPropagation();

        const containerRect = containerRef.current.getBoundingClientRect();
        
        // Support mouse or touch start
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;

        dragStartRef.current = {
            startX: clientX,
            startY: clientY,
            initialX: textState.x,
            initialY: textState.y
        };

        const handleMouseMove = (moveEvent) => {
            if (!dragStartRef.current) return;
            const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
            const currentY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);
            
            if (currentX === undefined || currentY === undefined) return;

            const dx = currentX - dragStartRef.current.startX;
            const dy = currentY - dragStartRef.current.startY;
            
            // Convert pixels moved to percentage of container
            const dxPct = (dx / containerRect.width) * 100;
            const dyPct = (dy / containerRect.height) * 100;

            setTextState(prev => ({
                ...prev,
                x: Math.min(Math.max(dragStartRef.current.initialX + dxPct, -20), 120),
                y: Math.min(Math.max(dragStartRef.current.initialY + dyPct, -20), 120)
            }));
        };

        const handleMouseUp = () => {
            dragStartRef.current = null;
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            window.removeEventListener("touchmove", handleMouseMove);
            window.removeEventListener("touchend", handleMouseUp);
            saveToHistory();
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        window.addEventListener("touchmove", handleMouseMove, { passive: false });
        window.addEventListener("touchend", handleMouseUp);
    };

    // Keyboard controls for text nudge (precision)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (activeLayer !== "text") return;
            
            const step = e.shiftKey ? 2 : 0.5; // shift for larger movements
            let dx = 0;
            let dy = 0;

            if (e.key === "ArrowLeft") dx = -step;
            else if (e.key === "ArrowRight") dx = step;
            else if (e.key === "ArrowUp") dy = -step;
            else if (e.key === "ArrowDown") dy = step;

            if (dx !== 0 || dy !== 0) {
                e.preventDefault();
                setTextState(prev => ({
                    ...prev,
                    x: Math.min(Math.max(prev.x + dx, -20), 120),
                    y: Math.min(Math.max(prev.y + dy, -20), 120)
                }));
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeLayer]);

    // Initial state saving to history
    useEffect(() => {
        if (imageLoaded) {
            setHistory([]);
            setHistoryIndex(-1);
            saveToHistory({ textState, bgBlur, bgBrightness, bgContrast, fgBrightness, maskFeather });
        }
    }, [imageLoaded]);

    // 7. Render Text Preview Bounds & styles
    const getPreviewStyle = () => {
        if (!originalImage || !containerRef.current) return {};
        
        // Calculate factor based on active scaling in editor
        const containerRect = containerRef.current.getBoundingClientRect();
        const originalWidth = originalImage.width;
        const scaleFactor = containerRect.width / originalWidth;

        return {
            position: "absolute",
            left: `${textState.x}%`,
            top: `${textState.y}%`,
            transform: `translate(-50%, -50%) rotate(${textState.rotation}deg) scale(${textState.flipX ? -1 : 1}, ${textState.flipY ? -1 : 1})`,
            fontSize: `${textState.fontSize * scaleFactor}px`,
            fontFamily: textState.fontFamily,
            fontWeight: textState.fontWeight,
            color: textState.fillColor,
            opacity: textState.opacity / 100,
            mixBlendMode: textState.blendMode,
            textAlign: textState.textAlign,
            letterSpacing: `${textState.letterSpacing * scaleFactor}px`,
            lineHeight: textState.lineHeight,
            cursor: tool === "select" ? "move" : "grab",
            userSelect: "none",
            whiteSpace: "pre-line",
            WebkitTextStroke: textState.strokeWidth > 0 ? `${textState.strokeWidth * scaleFactor}px ${textState.strokeColor}` : "none",
            textShadow: textState.shadowBlur > 0 ? `${textState.shadowOffsetX * scaleFactor}px ${textState.shadowOffsetY * scaleFactor}px ${textState.shadowBlur * scaleFactor}px ${textState.shadowColor}` : "none",
            zIndex: 2
        };
    };

    // 8. High-Res Export Rendering
    const handleExport = () => {
        if (!originalImage) return;

        showToast("고해상도 이미지 렌더링 중...");
        
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = originalImage.width;
        exportCanvas.height = originalImage.height;
        const ctx = exportCanvas.getContext("2d");

        // Step 1: Draw Layer 1 (Background Plate)
        ctx.save();
        let filters = [];
        if (bgBlur > 0) filters.push(`blur(${bgBlur}px)`);
        if (bgBrightness !== 100) filters.push(`brightness(${bgBrightness}%)`);
        if (bgContrast !== 100) filters.push(`contrast(${bgContrast}%)`);
        
        if (filters.length > 0) ctx.filter = filters.join(" ");
        ctx.drawImage(originalImage.el, 0, 0);
        ctx.restore();

        // Step 2: Draw Layer 2 (Middle Text)
        ctx.save();
        
        const xPos = (textState.x / 100) * exportCanvas.width;
        const yPos = (textState.y / 100) * exportCanvas.height;
        
        // Translate and rotate canvas
        ctx.translate(xPos, yPos);
        ctx.rotate((textState.rotation * Math.PI) / 180);
        ctx.scale(textState.flipX ? -1 : 1, textState.flipY ? -1 : 1);
        
        // Text configuration
        ctx.font = `normal ${textState.fontWeight} ${textState.fontSize}px ${textState.fontFamily}`;
        ctx.textAlign = textState.textAlign;
        ctx.textBaseline = "middle";
        ctx.fillStyle = textState.fillColor;
        ctx.globalAlpha = textState.opacity / 100;
        ctx.globalCompositeOperation = textState.blendMode === "normal" ? "source-over" : textState.blendMode;

        // Apply shadows
        if (textState.shadowBlur > 0) {
            ctx.shadowColor = textState.shadowColor;
            ctx.shadowBlur = textState.shadowBlur;
            ctx.shadowOffsetX = textState.shadowOffsetX;
            ctx.shadowOffsetY = textState.shadowOffsetY;
        }

        // Handle letter spacing (Canvas API supports letter spacing in modern environments)
        if (ctx.letterSpacing !== undefined) {
            ctx.letterSpacing = `${textState.letterSpacing}px`;
        }

        // Draw multi-line text
        const lines = textState.text.split("\n");
        const lineSpacing = textState.fontSize * textState.lineHeight;
        const startY = -((lines.length - 1) * lineSpacing) / 2;

        lines.forEach((line, index) => {
            const lineY = startY + index * lineSpacing;
            
            // Draw stroke if configured
            if (textState.strokeWidth > 0) {
                ctx.save();
                ctx.strokeStyle = textState.strokeColor;
                ctx.lineWidth = textState.strokeWidth;
                ctx.lineJoin = "round";
                ctx.miterLimit = 2;
                ctx.strokeText(line, 0, lineY);
                ctx.restore();
            }
            
            ctx.fillText(line, 0, lineY);
        });
        
        ctx.restore();

        // Step 3: Draw Layer 3 (Top Foreground Mask)
        ctx.save();
        if (fgBrightness !== 100) {
            ctx.filter = `brightness(${fgBrightness}%)`;
        }
        
        const fgImg = new Image();
        fgImg.onload = () => {
            ctx.drawImage(fgImg, 0, 0);
            ctx.restore();
            
            // Trigger browser download
            exportCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `LensAI_TextBehind_${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast("다운로드 완료!");
            }, "image/png");
        };
        fgImg.src = foregroundSrc;
    };

    // Main Render UI
    return html`
        <div class="app-container">
            <!-- Top Header -->
            <header class="header-bar">
                <div class="logo-section">
                    <a href="#" class="logo-group">
                        <span class="material-symbols-outlined logo-icon">blur_on</span>
                        <span class="logo-text">LensAI</span>
                    </a>
                    <nav class="nav-menu">
                        <span class="nav-item">File</span>
                        <span class="nav-item">Edit</span>
                        <span class="nav-item">View</span>
                        <span class="nav-item">Help</span>
                    </nav>
                </div>
                
                <div class="header-controls">
                    <div class="status-badge">
                        <span class="status-dot"></span>
                        100% Local Processing
                    </div>
                    <button class="header-icon-btn" onClick=${() => setShowHelp(!showHelp)} title="도움말 토글">
                        <span class="material-symbols-outlined">help</span>
                    </button>
                    <div class="user-profile">
                        <span class="material-symbols-outlined" style=${{ fontSize: "16px", color: "white" }}>person</span>
                    </div>
                </div>
            </header>

            <!-- Loading Spinner during AI Model Initialization -->
            ${!modelLoaded && html`
                <div class="ai-loader">
                    <div class="ai-loader-content">
                        <div class="spinner-outer">
                            <div class="spinner-inner"></div>
                        </div>
                        <p class="loader-text">${loadingStep}</p>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style=${{ width: `${loadingProgress}%` }}></div>
                        </div>
                        <p class="loader-sub">최초 1회에는 모델 캐싱이 포함되어 최대 10~30초가 소요될 수 있습니다.</p>
                    </div>
                </div>
            `}

            <!-- Main Workspace Container -->
            <div class="main-workspace">
                
                <!-- Left Sidebar: Layer Z-Index View -->
                <aside class="left-sidebar">
                    <h3 class="panel-title">Z-Index View</h3>
                    <div class="layer-stack">
                        <div class=${`layer-item ${activeLayer === 'foreground' ? 'active' : ''}`} onClick=${() => setActiveLayer('foreground')}>
                            <span class="material-symbols-outlined layer-icon">portrait</span>
                            <div class="layer-details">
                                <span class="layer-name">Foreground (Mask)</span>
                                <span class="layer-type">인물 전경 레이어</span>
                            </div>
                        </div>
                        
                        <div class=${`layer-item ${activeLayer === 'text' ? 'active' : ''}`} onClick=${() => setActiveLayer('text')}>
                            <span class="material-symbols-outlined layer-icon">title</span>
                            <div class="layer-details">
                                <span class="layer-name">Text Layer</span>
                                <span class="layer-type">사용자 텍스트 레이어</span>
                            </div>
                        </div>
                        
                        <div class=${`layer-item ${activeLayer === 'background' ? 'active' : ''}`} onClick=${() => setActiveLayer('background')}>
                            <span class="material-symbols-outlined layer-icon">image</span>
                            <div class="layer-details">
                                <span class="layer-name">Background Plate</span>
                                <span class="layer-type">오리지널 배경 이미지</span>
                            </div>
                        </div>
                    </div>
                </aside>

                <!-- Central Workspace Viewport -->
                <main class="viewport-area" ref=${viewportRef} onDragOver=${(e) => e.preventDefault()} onDrop=${handleDrop}>
                    
                    ${!originalImage ? html`
                        <!-- Dropzone Upload State -->
                        <div class="dropzone" onClick=${() => fileInputRef.current.click()}>
                            <div class="upload-icon-box">
                                <span class="material-symbols-outlined" style=${{ fontSize: "36px" }}>cloud_upload</span>
                            </div>
                            <h3 class="upload-title">작업할 이미지 업로드</h3>
                            <p class="upload-desc">여기에 사진을 드래그 앤 드롭 하거나<br/>클릭하여 파일을 선택하세요.</p>
                            
                            <div class="privacy-notice">
                                <span class="material-symbols-outlined" style=${{ fontSize: "16px" }}>verified_user</span>
                                안전 보장: 이미지는 서버로 전송되지 않고 로컬에서만 처리됩니다.
                            </div>
                            
                            <div class="sample-row" onClick=${(e) => e.stopPropagation()}>
                                ${SAMPLE_IMAGES.map(sample => html`
                                    <button class="sample-btn" onClick=${() => loadSample(sample.url)}>
                                        ${sample.name}
                                    </button>
                                `)}
                            </div>
                            <input type="file" ref=${fileInputRef} onChange=${handleFileChange} style=${{ display: "none" }} accept="image/*" />
                        </div>
                    ` : html`
                        <!-- Interactive Editor Layers -->
                        <div class="canvas-wrapper" ref=${containerRef} style=${{
                            width: `${originalImage.aspect >= 1 ? '760px' : 'auto'}`,
                            height: `${originalImage.aspect < 1 ? '600px' : 'auto'}`,
                            aspectRatio: originalImage.aspect,
                            transform: `scale(${zoom / 100})`,
                            isolation: "isolate"
                        }}>
                            <!-- Layer 1: Background Plate -->
                            <img src=${originalImage.src} class="editor-bg" style=${{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                pointerEvents: "none",
                                filter: `blur(${bgBlur}px) brightness(${bgBrightness}%) contrast(${bgContrast}%)`
                            }} />

                            <!-- Layer 2: Text Layer (DOM Rendered for dragging) -->
                            <div 
                                ref=${textRef}
                                style=${getPreviewStyle()}
                                onMouseDown=${handleTextMouseDown}
                                onTouchStart=${handleTextMouseDown}
                            >
                                ${textState.text}
                            </div>

                            <!-- Layer 3: Foreground (Cutout with feathering/contrast adjustments) -->
                            ${foregroundSrc && html`
                                <img src=${foregroundSrc} 
                                    class="editor-fg" 
                                    style=${{
                                        position: "absolute",
                                        inset: 0,
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        pointerEvents: "none",
                                        zIndex: 3,
                                        filter: `brightness(${fgBrightness}%)`
                                    }}
                                    onLoad=${() => console.log("Foreground cutout image loaded successfully!")}
                                    onError=${(err) => console.error("Foreground cutout image failed to load!", err)}
                                />
                            `}
                        </div>
                    `}

                    <!-- Live Zoom Toolbar -->
                    ${originalImage && html`
                        <div class="zoom-toolbar">
                            <button class="zoom-btn" onClick=${() => setZoom(Math.max(10, zoom - 10))} title="축소">
                                <span class="material-symbols-outlined">zoom_out</span>
                            </button>
                            <span class="zoom-pct">${zoom}%</span>
                            <button class="zoom-btn" onClick=${() => setZoom(Math.min(300, zoom + 10))} title="확대">
                                <span class="material-symbols-outlined">zoom_in</span>
                            </button>
                            <span class="toolbar-divider"></span>
                            <button class=${`zoom-btn ${tool === 'select' ? 'active' : ''}`} onClick=${() => setTool('select')} title="선택 도구 (드래그)">
                                <span class="material-symbols-outlined">near_me</span>
                            </button>
                            <button class="zoom-btn" onClick=${() => fitToScreen(originalImage.width, originalImage.height)} title="화면에 맞춤">
                                <span class="material-symbols-outlined">fit_screen</span>
                            </button>
                            <span class="toolbar-divider"></span>
                            <button class="zoom-btn" onClick=${() => {
                                URL.revokeObjectURL(originalImage.src);
                                setOriginalImage(null);
                                setForegroundSrc(null);
                            }} title="새 이미지">
                                <span class="material-symbols-outlined">refresh</span>
                            </button>
                        </div>
                    `}

                    <!-- Interactive Guide Panel -->
                    ${showHelp && html`
                        <div class="help-overlay">
                            <h4>💡 작업 가이드 & 단축키</h4>
                            <div class="help-item"><span>텍스트 드래그</span><span class="help-key">마우스 드래그</span></div>
                            <div class="help-item"><span>텍스트 미세이동</span><span class="help-key">방향키 (← → ↑ ↓)</span></div>
                            <div class="help-item"><span>빠른 이동</span><span class="help-key">Shift + 방향키</span></div>
                            <div class="help-item"><span>레이어 선택</span><span class="help-key">왼쪽 Z-Index 탭</span></div>
                            <div style=${{ borderTop: "1px solid var(--border-color)", margin: "4px 0" }}></div>
                            <div style=${{ fontSize: "0.7rem", lineHeight: "1.4" }}>
                                <strong>Text Behind Image</strong> 효과는 AI 전경 추출 레이어와 원본 배경 사이에 텍스트를 배치하여 작동합니다. 오른쪽 패널에서 스타일을 지정하고 끌어서 배치해 보세요!
                            </div>
                        </div>
                    `}
                </main>

                <!-- Right Sidebar: Properties & Tools -->
                <aside class="right-sidebar">
                    <div class="sidebar-scrollable">
                        <div class="section-header">
                            <h3 class="panel-title" style=${{ margin: 0 }}>Properties</h3>
                            <span class="material-symbols-outlined" style=${{ fontSize: "18px", color: "var(--text-muted)" }}>tune</span>
                        </div>

                        <!-- 1. Text Properties -->
                        <div class="property-group">
                            <label class="property-label">Content (텍스트 내용)</label>
                            <textarea 
                                class="text-input-area" 
                                value=${textState.text} 
                                onChange=${(e) => {
                                    setTextState(prev => ({ ...prev, text: e.target.value }));
                                    saveToHistory();
                                }}
                                disabled=${!originalImage}
                                placeholder="글자를 입력하세요..."
                            ></textarea>
                        </div>

                        <!-- Typography -->
                        <div class="property-group">
                            <label class="property-label">Typography (글씨체)</label>
                            <select 
                                class="prop-select" 
                                value=${textState.fontFamily} 
                                onChange=${(e) => {
                                    setTextState(prev => ({ ...prev, fontFamily: e.target.value }));
                                    saveToHistory();
                                }}
                                disabled=${!originalImage}
                            >
                                ${FONTS.map(f => html`<option value=${f.value}>${f.name}</option>`)}
                            </select>
                        </div>

                        <div class="property-group inline-row">
                            <div class="inline-col">
                                <label class="property-label">Font Size</label>
                                <div class="input-with-badge">
                                    <input 
                                        type="number" 
                                        class="prop-input" 
                                        value=${textState.fontSize} 
                                        onChange=${(e) => {
                                            setTextState(prev => ({ ...prev, fontSize: parseInt(e.target.value) || 20 }));
                                            saveToHistory();
                                        }}
                                        disabled=${!originalImage}
                                    />
                                    <span class="input-badge">PX</span>
                                </div>
                            </div>
                            <div class="inline-col">
                                <label class="property-label">Weight</label>
                                <select 
                                    class="prop-select" 
                                    value=${textState.fontWeight} 
                                    onChange=${(e) => {
                                        setTextState(prev => ({ ...prev, fontWeight: e.target.value }));
                                        saveToHistory();
                                    }}
                                    disabled=${!originalImage}
                                >
                                    <option value="100">Thin</option>
                                    <option value="300">Light</option>
                                    <option value="500">Regular</option>
                                    <option value="700">Bold</option>
                                    <option value="800">Extra Bold</option>
                                    <option value="900">Black</option>
                                </select>
                            </div>
                        </div>

                        <!-- Color & Opacity -->
                        <div class="property-group inline-row">
                            <div class="inline-col">
                                <label class="property-label">Fill Color</label>
                                <div class="color-picker-wrapper">
                                    <div class="color-preview-btn" style=${{ backgroundColor: textState.fillColor }}>
                                        <input 
                                            type="color" 
                                            class="color-input-hidden" 
                                            value=${textState.fillColor} 
                                            onChange=${(e) => {
                                                setTextState(prev => ({ ...prev, fillColor: e.target.value }));
                                                saveToHistory();
                                            }}
                                            disabled=${!originalImage}
                                        />
                                    </div>
                                    <input 
                                        type="text" 
                                        class="color-hex" 
                                        value=${textState.fillColor} 
                                        onChange=${(e) => {
                                            setTextState(prev => ({ ...prev, fillColor: e.target.value }));
                                            saveToHistory();
                                        }}
                                        disabled=${!originalImage}
                                    />
                                </div>
                            </div>
                            <div class="inline-col">
                                <label class="property-label">Blend Mode</label>
                                <select 
                                    class="prop-select" 
                                    value=${textState.blendMode} 
                                    onChange=${(e) => {
                                        setTextState(prev => ({ ...prev, blendMode: e.target.value }));
                                        saveToHistory();
                                    }}
                                    disabled=${!originalImage}
                                >
                                    ${BLEND_MODES.map(b => html`<option value=${b.value}>${b.name}</option>`)}
                                </select>
                            </div>
                        </div>

                        <!-- Opacity Slider -->
                        <div class="property-group slider-group">
                            <div class="slider-info">
                                <span>Opacity (불투명도)</span>
                                <span class="slider-value">${textState.opacity}%</span>
                            </div>
                            <input 
                                type="range" 
                                class="custom-range" 
                                min="0" 
                                max="100" 
                                value=${textState.opacity} 
                                onChange=${(e) => {
                                    setTextState(prev => ({ ...prev, opacity: parseInt(e.target.value) }));
                                    saveToHistory();
                                }}
                                disabled=${!originalImage}
                            />
                        </div>

                        <!-- Stroke Config -->
                        <div class="property-group inline-row">
                            <div class="inline-col">
                                <label class="property-label">Stroke Width</label>
                                <div class="input-with-badge">
                                    <input 
                                        type="number" 
                                        class="prop-input" 
                                        min="0"
                                        max="50"
                                        value=${textState.strokeWidth} 
                                        onChange=${(e) => {
                                            setTextState(prev => ({ ...prev, strokeWidth: parseInt(e.target.value) || 0 }));
                                            saveToHistory();
                                        }}
                                        disabled=${!originalImage}
                                    />
                                    <span class="input-badge">PX</span>
                                </div>
                            </div>
                            <div class="inline-col">
                                <label class="property-label">Stroke Color</label>
                                <div class="color-picker-wrapper">
                                    <div class="color-preview-btn" style=${{ backgroundColor: textState.strokeColor }}>
                                        <input 
                                            type="color" 
                                            class="color-input-hidden" 
                                            value=${textState.strokeColor} 
                                            onChange=${(e) => {
                                                setTextState(prev => ({ ...prev, strokeColor: e.target.value }));
                                                saveToHistory();
                                            }}
                                            disabled=${!originalImage}
                                        />
                                    </div>
                                    <input 
                                        type="text" 
                                        class="color-hex" 
                                        value=${textState.strokeColor} 
                                        onChange=${(e) => {
                                            setTextState(prev => ({ ...prev, strokeColor: e.target.value }));
                                            saveToHistory();
                                        }}
                                        disabled=${!originalImage}
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- Rotation Slider -->
                        <div class="property-group slider-group">
                            <div class="slider-info">
                                <span>Rotation (회전)</span>
                                <span class="slider-value">${textState.rotation}°</span>
                            </div>
                            <input 
                                type="range" 
                                class="custom-range" 
                                min="0" 
                                max="360" 
                                value=${textState.rotation} 
                                onChange=${(e) => {
                                    setTextState(prev => ({ ...prev, rotation: parseInt(e.target.value) }));
                                    saveToHistory();
                                }}
                                disabled=${!originalImage}
                            />
                        </div>

                        <!-- Horizontal & Vertical flip -->
                        <div class="property-group">
                            <label class="property-label">Transform Shortcuts</label>
                            <div class="icon-grid">
                                <button class="icon-action-btn" onClick=${() => {
                                    setTextState(prev => ({ ...prev, flipX: !prev.flipX }));
                                    saveToHistory();
                                }} disabled=${!originalImage} title="좌우 반전">
                                    <span class="material-symbols-outlined">flip</span>
                                </button>
                                <button class="icon-action-btn" onClick=${() => {
                                    setTextState(prev => ({ ...prev, flipY: !prev.flipY }));
                                    saveToHistory();
                                }} disabled=${!originalImage} title="상하 반전">
                                    <span class="material-symbols-outlined">flip_to_front</span>
                                </button>
                                <button class="icon-action-btn" onClick=${() => {
                                    setTextState(prev => ({ ...prev, x: 50, y: 50, rotation: 0 }));
                                    saveToHistory();
                                }} disabled=${!originalImage} title="중앙 정렬">
                                    <span class="material-symbols-outlined">center_focus_strong</span>
                                </button>
                                <button class="icon-action-btn" onClick=${() => {
                                    setTextState(prev => ({ ...prev, fontSize: 180, letterSpacing: 2, lineHeight: 1.1 }));
                                    saveToHistory();
                                }} disabled=${!originalImage} title="텍스트 스타일 리셋">
                                    <span class="material-symbols-outlined">settings_backup_restore</span>
                                </button>
                            </div>
                        </div>

                        <!-- Background Layer Adjustments (Blur & Brightness) -->
                        <div style=${{ borderTop: "1px solid var(--border-color)", margin: "25px 0 20px 0" }}></div>
                        <h3 class="panel-title" style=${{ marginBottom: "15px" }}>Layer Options</h3>

                        <div class="property-group slider-group">
                            <div class="slider-info">
                                <span>Background Blur (배경 흐림)</span>
                                <span class="slider-value">${bgBlur}px</span>
                            </div>
                            <input 
                                type="range" 
                                class="custom-range" 
                                min="0" 
                                max="20" 
                                value=${bgBlur} 
                                onChange=${(e) => {
                                    setBgBlur(parseInt(e.target.value));
                                    saveToHistory();
                                }}
                                disabled=${!originalImage}
                            />
                        </div>

                        <div class="property-group slider-group">
                            <div class="slider-info">
                                <span>Background Brightness (배경 밝기)</span>
                                <span class="slider-value">${bgBrightness}%</span>
                            </div>
                            <input 
                                type="range" 
                                class="custom-range" 
                                min="30" 
                                max="150" 
                                value=${bgBrightness} 
                                onChange=${(e) => {
                                    setBgBrightness(parseInt(e.target.value));
                                    saveToHistory();
                                }}
                                disabled=${!originalImage}
                            />
                        </div>

                        <div class="property-group slider-group">
                            <div class="slider-info">
                                <span>Foreground Brightness (인물 밝기)</span>
                                <span class="slider-value">${fgBrightness}%</span>
                            </div>
                            <input 
                                type="range" 
                                class="custom-range" 
                                min="30" 
                                max="150" 
                                value=${fgBrightness} 
                                onChange=${(e) => {
                                    setFgBrightness(parseInt(e.target.value));
                                    saveToHistory();
                                }}
                                disabled=${!originalImage}
                            />
                        </div>

                        <div class="property-group slider-group">
                            <div class="slider-info">
                                <span>Mask Edge Feather (경계선 부드럽게)</span>
                                <span class="slider-value">${maskFeather}px</span>
                            </div>
                            <input 
                                type="range" 
                                class="custom-range" 
                                min="0" 
                                max="10" 
                                value=${maskFeather} 
                                onChange=${(e) => {
                                    setMaskFeather(parseInt(e.target.value));
                                    saveToHistory();
                                }}
                                disabled=${!originalImage}
                            />
                        </div>
                    </div>

                    <!-- Sticky Bottom Controls: Undo, Redo, Export -->
                    <div class="sidebar-footer">
                        <div class="undo-redo-row">
                            <button 
                                class="footer-btn-half" 
                                onClick=${handleUndo} 
                                disabled=${historyIndex <= 0 || !originalImage}
                                title="실행 취소"
                            >
                                <span class="material-symbols-outlined" style=${{ fontSize: "16px" }}>undo</span>
                                Undo
                            </button>
                            <button 
                                class="footer-btn-half" 
                                onClick=${handleRedo} 
                                disabled=${historyIndex >= history.length - 1 || !originalImage}
                                title="다시 실행"
                            >
                                <span class="material-symbols-outlined" style=${{ fontSize: "16px" }}>redo</span>
                                Redo
                            </button>
                        </div>
                        
                        <button 
                            class="export-btn" 
                            onClick=${handleExport} 
                            disabled=${!originalImage}
                        >
                            <span class="material-symbols-outlined">download</span>
                            Export Image
                        </button>
                    </div>
                </aside>
            </div>

            <!-- Toast Messages -->
            <div class=${`toast-msg ${toastMessage ? 'show' : ''}`}>
                <span class="material-symbols-outlined" style=${{ color: "var(--accent)" }}>info</span>
                ${toastMessage}
            </div>
        </div>
    `;
}

// Mount React App
const rootElement = document.getElementById("root");
const root = createRoot(rootElement);
root.render(html`<${App} />`);
