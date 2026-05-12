
import React, { useState, useRef, useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';

interface ScannerComponentProps {
    onScanSuccess: (value: string) => void;
    onClose: () => void;
}

// Definição de tipos para a API Nativa BarcodeDetector (Chrome/Android)
declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string, format: string }>>;
  static getSupportedFormats(): Promise<string[]>;
}

const ScannerComponent: React.FC<ScannerComponentProps> = ({ onScanSuccess, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [manualCode, setManualCode] = useState('');
    const [detectedCode, setDetectedCode] = useState<string | null>(null); // Feedback Visual
    
    // Hardware Controls
    const [hasTorch, setHasTorch] = useState(false);
    const [isTorchOn, setIsTorchOn] = useState(false);
    const [zoomCapability, setZoomCapability] = useState<{min: number, max: number, step: number} | null>(null);
    const [currentZoom, setCurrentZoom] = useState(1);
    
    // Internal State
    const streamRef = useRef<MediaStream | null>(null);
    const scanningRef = useRef(true);
    const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);

    const playBeep = () => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            const context = audioContextRef.current;
            if (context.state === 'suspended') context.resume();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.connect(gain);
            gain.connect(context.destination);
            gain.gain.value = 0.1;
            oscillator.frequency.value = 1200;
            oscillator.type = 'sine';
            oscillator.start(context.currentTime);
            oscillator.stop(context.currentTime + 0.1);
        } catch (e) { console.warn("Beep failed", e); }
    };

    const stopAllTracks = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
            });
            streamRef.current = null;
        }
    };

    const startCamera = async (fallbackLevel = 0) => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setError("Seu navegador não suporta acesso à câmera ou o acesso está bloqueado. Use o Chrome ou Safari diretamente e certifique-se de estar usando HTTPS.");
            setLoading(false);
            return;
        }

        try {
            // Limpa qualquer conexão anterior antes de tentar abrir uma nova
            stopAllTracks();
            
            // Pequeno delay entre tentativas ajuda o hardware a 'resetar'
            // Aumentamos o delay para 800ms se for erro de hardware
            if (fallbackLevel > 0) {
                setLoading(true);
                await new Promise(r => setTimeout(r, 800));
                try {
                    await navigator.mediaDevices.enumerateDevices();
                } catch (e) {
                    console.warn("enumerateDevices failed", e);
                }
            }

            setLoading(true);
            setError(null);
            
            // Tiered fallback strategy for constraints
            let constraints: MediaStreamConstraints;
            if (fallbackLevel === 0) {
                // Tier 1: High Resolution (FHD) - Crucial for dense NFC-e QR Codes
                constraints = {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    }
                };
            } else if (fallbackLevel === 1) {
                // Tier 2: Low Resolution
                constraints = {
                    video: { 
                        facingMode: 'environment',
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    }
                };
            } else if (fallbackLevel === 2) {
                // Tier 3: Environmental mode only, no resolution constraints
                constraints = {
                    video: { facingMode: 'environment' }
                };
            } else {
                // Tier 4: Total fallback - any camera
                constraints = { video: true };
            }

            console.log(`Tentando câmera (Nível ${fallbackLevel})`, constraints);
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                
                await new Promise<void>((resolve, reject) => {
                    if (!videoRef.current) return reject();
                    videoRef.current.onloadedmetadata = () => resolve();
                    videoRef.current.onerror = (e) => reject(e);
                    // Aumentamos o timeout para 6 segundos
                    const t = setTimeout(() => reject(new Error("Timeout loading metadata")), 6000);
                    // Clear timeout on success
                    videoRef.current.addEventListener('loadedmetadata', () => clearTimeout(t), { once: true });
                });

                setLoading(false);
                checkCapabilities(stream); 
                startScanningLoop();       
                await videoRef.current.play();
            }
        } catch (err: any) {
            console.error(`Erro nível ${fallbackLevel}:`, err);
            
            const isNotReadable = err.name === 'NotReadableError' || err.name === 'TrackStartError' || err.message?.includes('Could not start video source');
            const isConstraintError = err.name === 'OverconstrainedError';
            const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';

            // Se for erro de hardware ou constraints, tenta o próximo nível de fallback
            if ((isNotReadable || isConstraintError) && fallbackLevel < 3) {
                console.log(`Hardware ocupado ou constraints inválidas. Tentando fallback nível ${fallbackLevel + 1}...`);
                setTimeout(() => startCamera(fallbackLevel + 1), 500);
                return;
            }
            
            if (isPermissionDenied) {
                setError("Acesso à câmera foi negado. Por favor, autorização nas configurações do seu celular/navegador.");
            } else if (isNotReadable) {
                if (isInsideIframe()) {
                    setError("O Google Chrome bloqueou a câmera pois este site está dentro de um 'iframe'. Clique no botão azul abaixo para abrir em uma nova aba e resolver o problema.");
                } else {
                    setError("A câmera está ocupada ou o sistema não permitiu o acesso. Feche todos os apps que usam a câmera (como Instagram ou WhatsApp) e tente novamente.");
                }
            } else {
                setError("Ocorreu um erro ao iniciar a câmera. Tente recarregar a página ou abrir em uma nova aba.");
            }
            setLoading(false);
        }
    };

    const isInsideIframe = () => {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    };

    // --- INICIALIZAÇÃO DA CÂMERA ---
    useEffect(() => {
        startCamera();

        return () => {
            scanningRef.current = false;
            stopAllTracks();
            if (zxingReaderRef.current) {
                zxingReaderRef.current.reset();
            }
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

    // --- VERIFICAR CAPACIDADES (ZOOM / TORCH) ---
    const checkCapabilities = (stream: MediaStream) => {
        const track = stream.getVideoTracks()[0];
        const capabilities = (track.getCapabilities && track.getCapabilities()) || {};
        
        // Zoom
        if ('zoom' in capabilities) {
            const zoomCap = (capabilities as any).zoom;
            setZoomCapability({
                min: zoomCap.min,
                max: zoomCap.max,
                step: zoomCap.step
            });
            // Define zoom inicial como mínimo (geralmente 1x) para evitar perda de nitidez em QR Codes densos
            const initialZoom = zoomCap.min;
            setCurrentZoom(initialZoom);
            applyZoom(initialZoom, track);
        }

        // Torch
        if ('torch' in capabilities) {
            setHasTorch(true);
        }
    };

    // --- APLICAÇÃO DE ZOOM ---
    const applyZoom = async (value: number, track?: MediaStreamTrack) => {
        const t = track || streamRef.current?.getVideoTracks()[0];
        if (t) {
            try {
                const capabilities = t.getCapabilities ? t.getCapabilities() : {};
                const advanced: any = { zoom: value };
                if (capabilities && 'focusMode' in capabilities) {
                    advanced.focusMode = 'continuous';
                }
                
                await t.applyConstraints({
                    advanced: [advanced]
                } as any);
            } catch (e) {
                console.warn("Constraint não aplicada:", e);
            }
        }
    };

    const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setCurrentZoom(val);
        applyZoom(val);
    };

    const toggleTorch = async () => {
        const track = streamRef.current?.getVideoTracks()[0];
        if (track) {
            try {
                await track.applyConstraints({
                    advanced: [{ torch: !isTorchOn }]
                } as any);
                setIsTorchOn(!isTorchOn);
            } catch (e) {
                console.warn("Torch falhou", e);
            }
        }
    };

    // --- TENTATIVA DE RE-FOCO (TAP TO FOCUS) ---
    const handleTapToFocus = async () => {
        const track = streamRef.current?.getVideoTracks()[0];
        if (!track) return;
        
        // Truque: reaplicar constraints as vezes força a câmera a refocar
        try {
            const currentConstraints = track.getConstraints();
            await track.applyConstraints({
                ...currentConstraints,
                advanced: [{ focusMode: 'continuous' }]
            } as any);
            // Feedback visual
            const focusBox = document.getElementById('focus-feedback');
            if(focusBox) {
                focusBox.style.opacity = '1';
                setTimeout(() => { focusBox.style.opacity = '0'; }, 500);
            }
        } catch (e) {
            console.log("Manual focus trigger not supported");
        }
    };

    // --- LOOP DE ESCANEAMENTO HÍBRIDO ---
    const startScanningLoop = async () => {
        // 1. Verifica se tem suporte a BarcodeDetector (Nativo Android/Chrome - ULTRA RÁPIDO)
        if ('BarcodeDetector' in window) {
            console.log("Usando API Nativa BarcodeDetector");
            const formats = await BarcodeDetector.getSupportedFormats();
            const detector = new BarcodeDetector({ formats });
            
            const detectLoop = async () => {
                if (!scanningRef.current || !videoRef.current) return;
                
                try {
                    if (videoRef.current.readyState === 4) {
                        const barcodes = await detector.detect(videoRef.current);
                        if (barcodes.length > 0) {
                            const code = barcodes[0].rawValue;
                            handleDetection(code);
                            return;
                        }
                    }
                } catch (e) {
                    console.error("Erro na detecção nativa", e);
                }
                requestAnimationFrame(detectLoop);
            };
            detectLoop();
        } 
        // 2. Fallback para iOS/Outros (ZXing)
        else {
            console.log("Usando Fallback ZXing");
            const codeReader = new BrowserMultiFormatReader();
            zxingReaderRef.current = codeReader;
            
            codeReader.decodeFromVideoDevice(
                undefined, 
                videoRef.current!, 
                (result, err) => {
                    if (result && scanningRef.current) {
                        handleDetection(result.getText());
                    }
                }
            );
        }
    };

    const handleDetection = (code: string) => {
        if (!scanningRef.current) return;
        scanningRef.current = false; // Stop scanning immediately
        setDetectedCode(code); // Show detected code
        playBeep();
        
        // Pause video to show we captured frame
        if(videoRef.current) videoRef.current.pause();

        // Delay to allow user to see the code
        setTimeout(() => {
            onScanSuccess(code);
        }, 800);
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (manualCode.trim().length > 0) {
            onScanSuccess(manualCode);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setLoading(true);
            const image = new Image();
            const url = URL.createObjectURL(file);
            image.src = url;
            await new Promise((resolve) => { image.onload = resolve; });

            // Try to detect using BarcodeDetector if available
            if ('BarcodeDetector' in window) {
                const formats = await (window as any).BarcodeDetector.getSupportedFormats();
                const detector = new (window as any).BarcodeDetector({ formats });
                const barcodes = await detector.detect(image);
                if (barcodes.length > 0) {
                    onScanSuccess(barcodes[0].rawValue);
                    return;
                }
            }

            // Fallback to ZXing for the static image
            const codeReader = new BrowserMultiFormatReader();
            const result = await codeReader.decodeFromImageElement(image);
            if (result) {
                onScanSuccess(result.getText());
            } else {
                setError("Não foi possível detectar um código nesta imagem. Tente uma foto mais nítida e de perto.");
            }
        } catch (err) {
            console.error("Photo detection error:", err);
            setError("Erro ao processar a foto. Tente novamente.");
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col">
            <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handlePhotoCapture} 
            />
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/90 to-transparent">
                <button onClick={onClose} className="text-white p-2 rounded-full bg-white/10 backdrop-blur-sm active:bg-white/30">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <span className="text-white font-bold tracking-wide drop-shadow-md">Escanear Código</span>
                <div className="flex gap-2">
                    {hasTorch && (
                        <button onClick={toggleTorch} className={`p-2 rounded-full backdrop-blur-sm transition-all border ${isTorchOn ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-black/40 text-white border-white/30'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill={isTorchOn ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Viewport */}
            <div className="relative flex-grow bg-black overflow-hidden flex items-center justify-center" onClick={handleTapToFocus}>
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center z-30">
                        <div className="w-12 h-12 border-4 border-white/30 border-t-red-500 rounded-full animate-spin"></div>
                    </div>
                )}
                
                {detectedCode && (
                    <div className="absolute z-40 inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl transform animate-bounce">
                            <p className="text-gray-500 text-sm text-center mb-1">Código Detectado</p>
                            <p className="text-3xl font-mono font-bold text-black tracking-widest">{detectedCode}</p>
                        </div>
                    </div>
                )}

                {error ? (
                    <div className="text-white text-center p-8 flex flex-col items-center">
                        <p className="text-4xl mb-4">☹️</p>
                        <p className="mb-6 font-medium">{error}</p>
                        
                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            {isInsideIframe() && (
                                <button 
                                    onClick={() => window.open(window.location.href, '_blank')}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-5 px-6 rounded-2xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] flex flex-col items-center justify-center gap-1 animate-pulse border-2 border-white/20"
                                >
                                    <div className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                        </svg>
                                        <span className="text-lg uppercase">Abrir em Nova Aba</span>
                                    </div>
                                    <span className="text-[10px] opacity-80 uppercase tracking-tighter font-normal text-center leading-tight px-4">
                                        Esta é a solução definitiva quando a câmera falha no preview
                                    </span>
                                </button>
                            )}

                            <button 
                                onClick={() => { setError(null); setLoading(true); startCamera(0); }}
                                className="bg-white hover:bg-gray-100 text-black font-bold py-3 px-6 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                Tentar Novamente
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-red-600/40 hover:bg-red-600/60 text-white font-bold py-3 px-2 rounded-xl transition-all flex items-center justify-center gap-1 text-sm shadow-md"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                    </svg>
                                    Galeria
                                </button>
                                <button 
                                    onClick={() => window.location.reload()}
                                    className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-2 rounded-xl transition-all flex items-center justify-center gap-1 text-sm border border-white/10"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                    Recarregar
                                </button>
                            </div>

                            <button 
                                onClick={onClose}
                                className="text-white/40 hover:text-white text-xs font-medium py-3 transition-all mt-2 underline"
                            >
                                Voltar para a Início
                            </button>
                        </div>
                        
                        <div className="mt-8 p-4 bg-white/10 rounded-2xl max-w-xs">
                          {isInsideIframe() ? (
                            <p className="text-xs text-yellow-300 font-bold mb-2">⚠️ DETECTADO: NAVEGADOR EM IFRAME</p>
                          ) : null}
                          <p className="text-xs text-white/50 leading-relaxed">
                            O Google Chrome no Android pode bloquear a câmera se o site estiver sendo exibido dentro de outro aplicativo. 
                            <span className="text-white ml-1">Usar o botão "Abrir em Nova Aba" resolve este problema.</span>
                          </p>
                        </div>
                    </div>
                ) : (
                    <video 
                        ref={videoRef} 
                        className="w-full h-full object-cover" 
                        playsInline 
                        muted 
                        autoPlay 
                    />
                )}

                {/* Visual Overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                    {/* Darker Background */}
                    <div className="absolute inset-0 border-[50px] border-black/50"></div>
                    
                    {/* Focus Box */}
                    <div className="relative w-64 h-64 border-2 border-white/70 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse" style={{ top: '50%', transform: 'translateY(-50%)' }}></div>
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-red-500"></div>
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-red-500"></div>
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-red-500"></div>
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-red-500"></div>
                        
                        {/* Scan Line */}
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,1)] animate-scan-line"></div>
                    </div>
                    
                    {/* Tip */}
                    <div className="mt-8 bg-black/60 px-4 py-2 rounded-full backdrop-blur-sm">
                        <p className="text-white text-xs font-medium">
                            Aproxime para focar • Afaste para ler
                        </p>
                    </div>

                    {/* Focus Feedback Animation */}
                    <div id="focus-feedback" className="absolute w-16 h-16 border-2 border-yellow-400 rounded-full opacity-0 transition-opacity duration-300 pointer-events-none"></div>
                </div>

                {/* Zoom Slider - CRITICAL FOR FOCUS */}
                {zoomCapability && (
                    <div className="absolute bottom-40 left-1/2 transform -translate-x-1/2 w-64 z-20 bg-black/40 px-4 py-3 rounded-full backdrop-blur-md border border-white/10" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between text-white text-xs font-bold mb-1 px-1">
                            <span>1x</span>
                            <span>ZOOM</span>
                            <span>{zoomCapability.max.toFixed(1)}x</span>
                        </div>
                        <input 
                            type="range" 
                            min={zoomCapability.min} 
                            max={zoomCapability.max} 
                            step={0.1} 
                            value={currentZoom}
                            onChange={handleZoomChange}
                            className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                )}
            </div>

            {/* Manual Entry */}
            <div className="bg-black p-4 pb-8 z-20">
                <form onSubmit={handleManualSubmit} className="flex gap-2 max-w-md mx-auto">
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">⌨️</span>
                        <input 
                            type="number" 
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            placeholder="Digitar código..."
                            className="w-full pl-10 pr-4 py-3 bg-white/90 text-black rounded-xl focus:outline-none font-mono text-lg shadow-lg"
                        />
                    </div>
                    <button 
                        type="submit"
                        className="bg-red-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg hover:bg-red-600 active:scale-95 transition-transform"
                    >
                        OK
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ScannerComponent;
