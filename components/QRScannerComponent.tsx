import React, { useEffect, useState, useRef } from 'react';
import QrScanner from 'qr-scanner';

interface QRScannerComponentProps {
    onScanSuccess: (value: string) => void;
    onClose: () => void;
}

const QRScannerComponent: React.FC<QRScannerComponentProps> = ({ onScanSuccess, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const scannerRef = useRef<QrScanner | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasTorch, setHasTorch] = useState(false);
    const [isTorchOn, setIsTorchOn] = useState(false);
    const [manualCode, setManualCode] = useState('');
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
        
        // Stop scanner to prevent multiple detections
        if (scannerRef.current) {
            try {
                scannerRef.current.stop();
            } catch (e) {
                console.warn("Error stopping scanner on detection:", e);
            }
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

                // Instancia o QrScanner da Nimiq
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
                        // Configurações ideais para focar códigos densos
                        calculateScanRegion: (video) => {
                            // Aumenta o tamanho da área de escaneamento para ler QR codes densos ou distantes
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

                // Inicia o leitor
                await qrScanner.start();
                
                if (isUnmounted) {
                    qrScanner.destroy();
                    return;
                }

                setLoading(false);

                // Verifica se suporta Lanterna (Flash)
                const hasFlash = await qrScanner.hasFlash();
                if (!isUnmounted) {
                    setHasTorch(hasFlash);
                }

                // Configura Zoom se disponível no track de vídeo
                const stream = videoElement.srcObject as MediaStream;
                if (stream) {
                    const track = stream.getVideoTracks()[0];
                    if (track) {
                        const capabilities = (track.getCapabilities && track.getCapabilities()) || {};
                        if ('zoom' in capabilities) {
                            const zoomCap = (capabilities as any).zoom;
                            setZoomSupported(true);
                            setZoomMinMax({ min: zoomCap.min || 1, max: zoomCap.max || 5 });
                            // Inicia com um leve zoom de 1.8x para melhorar detecção de NFC-e densas
                            const startZoom = Math.min(zoomCap.max || 5, Math.max(zoomCap.min || 1, 1.8));
                            setCurrentZoom(startZoom);
                            try {
                                await track.applyConstraints({ advanced: [{ zoom: startZoom }] } as any);
                            } catch (e) {
                                console.warn("Failed to apply initial zoom:", e);
                            }
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

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (manualCode.trim().length > 0) {
            handleDetection(manualCode.trim());
        }
    };

    const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setLoading(true);
            // QrScanner permite escanear um arquivo de imagem diretamente!
            const result = await QrScanner.scanImage(file, {
                returnDetailedScanResult: true
            });
            
            if (result && result.data) {
                handleDetection(result.data);
            } else {
                setError("Nenhum QR Code legível foi detectado nesta imagem. Tente tirar uma foto mais nítida de perto.");
            }
        } catch (err) {
            console.error("Erro ao escanear imagem estática:", err);
            setError("Não foi possível detectar um QR Code nesta foto. Certifique-se de que a imagem está bem focada e iluminada.");
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col font-sans select-none">
            <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handlePhotoCapture} 
            />

            {/* Top Bar - Glassmorphism style */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-30 bg-gradient-to-b from-black/90 to-transparent">
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
                        Leitor QR Super-Foco
                    </span>
                    <span className="text-[10px] text-emerald-400 font-bold tracking-wider uppercase animate-pulse">
                        Modo WebAssembly Ativo
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
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-955 z-30 gap-4">
                        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
                        <p className="text-gray-400 text-xs font-bold tracking-widest uppercase">Iniciando Câmera Ultra-Foco...</p>
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

                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 border border-white/10"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-emerald-400">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                </svg>
                                Escolher da Galeria
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

                {/* Laser/Sci-fi visual scanner target */}
                {!loading && !error && !detectedCode && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                        {/* Custom visual target frame */}
                        <div className="relative w-72 h-72 border border-white/20 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] overflow-hidden">
                            {/* Scanning neon laser effect */}
                            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-scan-laser"></div>
                            
                            {/* Target corners */}
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl"></div>
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl"></div>
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl"></div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl"></div>
                        </div>

                        <div className="mt-8 bg-zinc-900/90 border border-emerald-500/20 px-5 py-3 rounded-2xl backdrop-blur-md shadow-xl text-center max-w-[280px]">
                            <p className="text-yellow-400 font-extrabold text-xs mb-1 uppercase tracking-widest animate-pulse">
                                Câmera Auto-Foco
                            </p>
                            <p className="text-gray-300 text-[11px] font-medium leading-relaxed">
                                Aproxime ou afaste a câmera da nota fiscal lentamente para obter foco automático instantâneo.
                            </p>
                        </div>
                    </div>
                )}

                {/* Zoom Controller - Standard premium slider */}
                {zoomSupported && !loading && !error && !detectedCode && (
                    <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 w-64 z-20 bg-zinc-900/80 px-4 py-3 rounded-full backdrop-blur-md border border-white/10" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between text-white text-[10px] font-black tracking-widest mb-1.5 px-1">
                            <span>1.0x</span>
                            <span className="text-emerald-400 uppercase">AJUSTE DE ZOOM</span>
                            <span>{zoomMinMax.max.toFixed(1)}x</span>
                        </div>
                        <input 
                            type="range" 
                            min={zoomMinMax.min} 
                            max={zoomMinMax.max} 
                            step={0.1} 
                            value={currentZoom}
                            onChange={handleZoomChange}
                            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                    </div>
                )}
            </div>

            {/* Bottom Panel - Options & Manual Entry */}
            <div className="bg-zinc-950 p-4 pb-8 z-20 border-t border-white/5 flex flex-col gap-4">
                <div className="flex gap-2 max-w-md mx-auto w-full justify-center">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-zinc-900 border border-white/10 text-white font-bold py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2 text-sm shadow-md active:scale-95 transition-all w-1/2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-emerald-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                        </svg>
                        Escanear Foto
                    </button>
                    
                    <button 
                        onClick={onClose}
                        className="bg-zinc-900 border border-white/10 text-white/70 font-medium py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2 text-sm w-1/2"
                    >
                        Cancelar
                    </button>
                </div>

                <form onSubmit={handleManualSubmit} className="flex gap-2 max-w-md mx-auto w-full">
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">⌨️</span>
                        <input 
                            type="text" 
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            placeholder="Digitar código manualmente..."
                            className="w-full pl-10 pr-4 py-3.5 bg-zinc-900 border border-white/10 text-white placeholder-gray-500 rounded-2xl focus:outline-none focus:border-emerald-500/50 font-mono text-sm transition-all shadow-inner"
                        />
                    </div>
                    <button 
                        type="submit"
                        className="bg-emerald-500 text-black font-black px-6 py-3.5 rounded-2xl shadow-lg hover:bg-emerald-400 active:scale-95 transition-all text-sm uppercase tracking-wider"
                    >
                        OK
                    </button>
                </form>
            </div>

            {/* Custom animations styled in CSS in JS */}
            <style>{`
                @keyframes scanlaser {
                    0% { top: 0%; opacity: 0.1; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0.1; }
                }
                .animate-scan-laser {
                    animation: scanlaser 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }
                /* Custom styles to hide qr-scanner's overlay if highlightScanRegion is enabled */
                .qr-scanner-highlight {
                    border: none !important;
                    box-shadow: none !important;
                }
                .qr-scanner-outline {
                    stroke: #34d399 !important;
                    stroke-width: 4px !important;
                }
            `}</style>
        </div>
    );
};

export default QRScannerComponent;
