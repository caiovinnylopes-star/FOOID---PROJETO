import React, { useEffect, useState, useRef } from 'react';
import QrScanner from 'qr-scanner';

interface QRScannerComponentProps {
    onScanSuccess: (value: string) => void;
    onPhotoCapture?: (file: File) => void;
    onClose: () => void;
}

const QRScannerComponent: React.FC<QRScannerComponentProps> = ({ onScanSuccess, onPhotoCapture, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const scannerRef = useRef<QrScanner | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasTorch, setHasTorch] = useState(false);
    const [isTorchOn, setIsTorchOn] = useState(false);
    const [detectedCode, setDetectedCode] = useState<string | null>(null);
    
    // Zoom State
    const [zoomSupported, setZoomSupported] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(1);
    const [zoomMinMax, setZoomMinMax] = useState({ min: 1, max: 5 });

    const playBeep = () => {
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.connect(gain);
            gain.connect(context.destination);
            gain.gain.value = 0.1;
            oscillator.frequency.value = 1200;
            oscillator.type = 'sine';
            oscillator.start(context.currentTime);
            oscillator.stop(context.currentTime + 0.1);
        } catch (e) {
            console.warn("Beep failed", e);
        }
    };

    const handleDetection = (code: string) => {
        playBeep();
        setDetectedCode(code);
        
        if (scannerRef.current) {
            try { scannerRef.current.stop(); } catch (e) {}
        }
        
        if (videoRef.current) {
            videoRef.current.pause();
        }

        setTimeout(() => {
            onScanSuccess(code);
        }, 800);
    };

    useEffect(() => {
        let isUnmounted = false;
        const videoElement = videoRef.current;
        if (!videoElement) return;

        const initializeScanner = async () => {
            try {
                setLoading(true);
                setError(null);

                const qrScanner = new QrScanner(
                    videoElement,
                    (result) => {
                        if (isUnmounted) return;
                        const code = typeof result === 'object' ? result.data : result;
                        if (code) {
                            handleDetection(code);
                        }
                    },
                    {
                        preferredCamera: 'environment',
                        highlightScanRegion: true,
                        highlightCodeOutline: true,
                        maxScansPerSecond: 15,
                        calculateScanRegion: (video) => {
                            const smallestDimension = Math.min(video.videoWidth, video.videoHeight);
                            const scanRegionSize = Math.round(smallestDimension * 0.75);
                            return {
                                x: Math.round((video.videoWidth - scanRegionSize) / 2),
                                y: Math.round((video.videoHeight - scanRegionSize) / 2),
                                width: scanRegionSize,
                                height: scanRegionSize,
                            };
                        }
                    }
                );

                scannerRef.current = qrScanner;

                await qrScanner.start();
                
                if (isUnmounted) {
                    qrScanner.destroy();
                    return;
                }

                setLoading(false);

                const hasFlash = await qrScanner.hasFlash();
                if (!isUnmounted) {
                    setHasTorch(hasFlash);
                }

                const stream = videoElement.srcObject as MediaStream;
                if (stream) {
                    const track = stream.getVideoTracks()[0];
                    if (track) {
                        const capabilities = (track.getCapabilities && track.getCapabilities()) || {};
                        if ('zoom' in capabilities) {
                            const zoomCap = (capabilities as any).zoom;
                            setZoomSupported(true);
                            setZoomMinMax({ min: zoomCap.min || 1, max: zoomCap.max || 5 });
                            const startZoom = zoomCap.min || 1;
                            setCurrentZoom(startZoom);
                        }
                    }
                }

            } catch (err: any) {
                console.error("Falha ao inicializar qr-scanner:", err);
                if (!isUnmounted) {
                    setError("Não foi possível acessar a câmera. Certifique-se de dar as permissões necessárias ou tente recarregar.");
                    setLoading(false);
                }
            }
        };

        initializeScanner();

        return () => {
            isUnmounted = true;
            if (scannerRef.current) {
                try {
                    scannerRef.current.destroy();
                } catch (e) {
                    console.warn("Error destroying scanner:", e);
                }
            }
        };
    }, []);

    const toggleTorch = async () => {
        if (!scannerRef.current) return;
        try {
            const isFlashOn = scannerRef.current.isFlashOn();
            if (isFlashOn) {
                await scannerRef.current.turnFlashOff();
                setIsTorchOn(false);
            } else {
                await scannerRef.current.turnFlashOn();
                setIsTorchOn(true);
            }
        } catch (e) {
            console.warn("Failed to toggle flash:", e);
        }
    };

    const handleZoomChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value);
        setCurrentZoom(value);
        
        const videoElement = videoRef.current;
        if (videoElement) {
            const stream = videoElement.srcObject as MediaStream;
            if (stream) {
                const track = stream.getVideoTracks()[0];
                if (track) {
                    try {
                        await track.applyConstraints({ advanced: [{ zoom: value }] } as any);
                    } catch (e) {
                        console.warn("Failed to apply zoom:", e);
                    }
                }
            }
        }
    };

    const captureFrame = () => {
        if (!videoRef.current || !canvasRef.current || !onPhotoCapture) return;
        
        playBeep();
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
                    
                    if (scannerRef.current) {
                        try { scannerRef.current.stop(); } catch (e) {}
                    }
                    video.pause();
                    
                    onPhotoCapture(file);
                    onClose();
                }
            }, 'image/jpeg', 0.95);
        }
    };

    const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onPhotoCapture) return;
        
        if (scannerRef.current) {
            try { scannerRef.current.stop(); } catch (e) {}
        }
        
        onPhotoCapture(file);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col font-sans select-none">
            <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleGallerySelect} 
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Top Bar - Glassmorphism style */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-30 bg-gradient-to-b from-black/90 to-transparent pt-safe">
                <button 
                    onClick={onClose} 
                    className="text-white p-2.5 rounded-full bg-white/10 backdrop-blur-md active:bg-white/30 transition-colors border border-white/10"
                    aria-label="Fechar"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                
                <div className="flex flex-col items-center">
                    <span className="text-white font-black tracking-widest text-sm uppercase drop-shadow-md">
                        Leitor Inteligente
                    </span>
                    <span className="text-[10px] text-emerald-400 font-bold tracking-wider uppercase animate-pulse">
                        Auto-Foco IA
                    </span>
                </div>

                <div className="flex gap-2">
                    {hasTorch && (
                        <button 
                            onClick={toggleTorch} 
                            className={`p-2.5 rounded-full backdrop-blur-md transition-all border ${
                                isTorchOn 
                                    ? 'bg-yellow-400 text-black border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]' 
                                    : 'bg-black/40 text-white border-white/20 hover:bg-white/10'
                            }`}
                            aria-label="Lanterna"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill={isTorchOn ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Camera Viewport */}
            <div className="relative flex-grow bg-black overflow-hidden flex items-center justify-center">
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-30 gap-4">
                        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
                        <p className="text-gray-400 text-xs font-bold tracking-widest uppercase">Iniciando Câmera...</p>
                    </div>
                )}
                
                {detectedCode && (
                    <div className="absolute z-40 inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
                        <div className="bg-zinc-900 border border-emerald-500/30 p-6 rounded-3xl shadow-2xl transform scale-100 transition-all max-w-xs text-center flex flex-col items-center gap-3">
                            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6 text-emerald-400">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-1">Detectado com Sucesso</p>
                                <p className="text-white font-mono text-sm break-all font-bold px-2 py-1 bg-black/40 rounded-lg">{detectedCode}</p>
                            </div>
                        </div>
                    </div>
                )}

                {error ? (
                    <div className="text-white text-center p-8 flex flex-col items-center max-w-sm z-30">
                        <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-red-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                        </div>
                        <p className="font-bold text-lg mb-2">Erro de Acesso</p>
                        <p className="mb-6 text-gray-400 text-sm leading-relaxed">{error}</p>
                        
                        <div className="flex flex-col gap-3 w-full">
                            <button 
                                onClick={() => window.location.reload()}
                                className="bg-emerald-500 text-black font-black py-3 px-6 rounded-2xl transition-all shadow-lg hover:bg-emerald-400 active:scale-95 flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                Recarregar Página
                            </button>
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

                {/* Custom Overlay for Camera UI */}
                {!loading && !error && !detectedCode && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col justify-end">
                        
                        {/* Zoom Controller */}
                        {zoomSupported && (
                            <div className="pointer-events-auto absolute bottom-36 left-1/2 transform -translate-x-1/2 w-48 z-20 bg-black/50 px-4 py-2 rounded-full backdrop-blur-md border border-white/20">
                                <input 
                                    type="range" 
                                    min={zoomMinMax.min} 
                                    max={zoomMinMax.max} 
                                    step={0.1} 
                                    value={currentZoom}
                                    onChange={handleZoomChange}
                                    className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-white"
                                />
                            </div>
                        )}

                        {/* Native Camera Style Bottom Bar */}
                        <div className="w-full bg-gradient-to-t from-black via-black/80 to-transparent pt-16 pb-10 px-8 flex justify-between items-center pointer-events-auto pb-safe">
                            
                            {/* Gallery Button */}
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-14 h-14 bg-zinc-800/80 rounded-full border border-zinc-600 flex items-center justify-center active:scale-90 transition-transform"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-white">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                            </button>

                            {/* Capture Button */}
                            {onPhotoCapture && (
                                <button 
                                    onClick={captureFrame}
                                    className="w-20 h-20 bg-transparent border-4 border-white rounded-full flex items-center justify-center p-1 active:scale-90 transition-transform"
                                >
                                    <div className="w-full h-full bg-white rounded-full"></div>
                                </button>
                            )}

                            {/* Spacer to keep Capture Button centered */}
                            <div className="w-14 h-14"></div>
                            
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .qr-scanner-highlight {
                    border: none !important;
                    box-shadow: none !important;
                }
                .qr-scanner-outline {
                    stroke: #facc15 !important;
                    stroke-width: 5px !important;
                }
            `}</style>
        </div>
    );
};

export default QRScannerComponent;

