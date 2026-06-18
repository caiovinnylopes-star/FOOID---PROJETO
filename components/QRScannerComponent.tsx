import React, { useEffect, useState, useRef } from 'react';
import QrScanner from 'qr-scanner';

interface QRScannerComponentProps {
    onScanSuccess: (value: string) => void;
    onClose: () => void;
    mode?: 'barcode' | 'qrcode' | 'nfce';
}

const QRScannerComponent: React.FC<QRScannerComponentProps> = ({ onScanSuccess, onClose, mode }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const scannerRef = useRef<QrScanner | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [hasTorch, setHasTorch] = useState(false);
    const [isTorchOn, setIsTorchOn] = useState(false);
    const [detectedCode, setDetectedCode] = useState<string | null>(null);
    
    // Zoom State
    const [zoomSupported, setZoomSupported] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(1);
    const [zoomMax, setZoomMax] = useState(1);

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
        }, 500);
    };

    useEffect(() => {
        let isUnmounted = false;
        const videoElement = videoRef.current;
        if (!videoElement) return;

        const initializeScanner = async () => {
            try {
                const qrScanner = new QrScanner(
                    videoElement,
                    (result) => {
                        if (isUnmounted) return;
                        const code = typeof result === 'object' ? result.data : result;
                        if (code) handleDetection(code);
                    },
                    {
                        preferredCamera: 'environment',
                        highlightScanRegion: false,
                        highlightCodeOutline: true, // Draws the native-looking yellow outline on the barcode/QR
                        maxScansPerSecond: 15,
                        calculateScanRegion: (video) => {
                            const smallestDimension = Math.min(video.videoWidth, video.videoHeight);
                            const scanRegionSize = Math.round(smallestDimension * 0.9);
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

                const hasFlash = await qrScanner.hasFlash();
                if (!isUnmounted) setHasTorch(hasFlash);

                const stream = videoElement.srcObject as MediaStream;
                if (stream) {
                    const track = stream.getVideoTracks()[0];
                    if (track) {
                        const capabilities = (track.getCapabilities && track.getCapabilities()) || {};
                        if ('zoom' in capabilities) {
                            const zoomCap = (capabilities as any).zoom;
                            setZoomSupported(true);
                            setZoomMax(zoomCap.max || 1);
                        }
                    }
                }
            } catch (err: any) {
                if (!isUnmounted) {
                    setError("Não foi possível acessar a câmera.");
                }
            }
        };

        initializeScanner();

        return () => {
            isUnmounted = true;
            if (scannerRef.current) {
                try { scannerRef.current.destroy(); } catch (e) {}
            }
        };
    }, []);

    const toggleTorch = async () => {
        if (!scannerRef.current) return;
        try {
            if (scannerRef.current.isFlashOn()) {
                await scannerRef.current.turnFlashOff();
                setIsTorchOn(false);
            } else {
                await scannerRef.current.turnFlashOn();
                setIsTorchOn(true);
            }
        } catch (e) {}
    };

    const handleZoomChange = async (value: number) => {
        if (value > zoomMax) value = zoomMax;
        setCurrentZoom(value);
        
        const videoElement = videoRef.current;
        if (videoElement) {
            const stream = videoElement.srcObject as MediaStream;
            if (stream) {
                const track = stream.getVideoTracks()[0];
                if (track) {
                    try {
                        await track.applyConstraints({ advanced: [{ zoom: value }] } as any);
                    } catch (e) {}
                }
            }
        }
    };

    // Zoom options: 1x, 2x, 3x... depending on max zoom
    const zoomLevels = [1, 2, 3].filter(z => z <= Math.max(3, Math.floor(zoomMax)));
    // Se o maxZoom for alto (ex: 8), podemos querer mostrar [1, 2, 3] e talvez [1, 2, max] mas para ficar limpo:
    const displayZooms = zoomLevels.length > 1 ? zoomLevels : [];

    return (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col font-sans select-none">
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-30">
                <button 
                    onClick={onClose} 
                    className="text-white p-2.5 rounded-full bg-black/40 backdrop-blur-md active:bg-black/60 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                
                {hasTorch && (
                    <button 
                        onClick={toggleTorch} 
                        className={`p-2.5 rounded-full backdrop-blur-md transition-colors ${isTorchOn ? 'bg-white text-black' : 'bg-black/40 text-white'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill={isTorchOn ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Camera Viewport */}
            <div className="relative flex-grow bg-black overflow-hidden flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                
                {/* Overlay Feedback de Sucesso */}
                {detectedCode && (
                    <div className="absolute z-40 inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
                        <div className="bg-white text-black px-6 py-3 rounded-full font-bold shadow-2xl animate-bounce">
                            Código Lido!
                        </div>
                    </div>
                )}
                
                {/* Subtle targeting square (opcional, pode ser removido, mas ajuda a guiar o usuário levemente sem ser poluído) */}
                {!detectedCode && !error && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                        <div className="w-64 h-64 border-[3px] border-white/50 rounded-[2rem] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"></div>
                        <p className="mt-8 text-white/80 font-bold tracking-widest uppercase text-xs">Aponte para o QR Code</p>
                    </div>
                )}

                {/* Overlay de Erro */}
                {error && (
                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center text-white bg-black p-8 text-center">
                        <p className="mb-6 font-medium text-lg">{error}</p>
                        <button onClick={onClose} className="px-8 py-3 bg-white text-black font-bold rounded-full">Fechar Câmera</button>
                    </div>
                )}

                {/* Native-style Zoom Controls no rodapé */}
                {zoomSupported && displayZooms.length > 0 && !detectedCode && !error && (
                    <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex items-center gap-3 z-20 bg-black/30 p-2 rounded-full backdrop-blur-md">
                        {displayZooms.map(level => (
                            <button
                                key={level}
                                onClick={() => handleZoomChange(level)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${currentZoom === level ? 'bg-white text-black' : 'bg-transparent text-white'}`}
                            >
                                {level === 1 && currentZoom !== 1 ? '1x' : level}
                                {level !== 1 && currentZoom === level && 'x'}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            
            <style>{`
                /* Oculta os itens nativos de UI do qr-scanner para não sobrepor nosso design nativo e limpo */
                .scan-region-highlight {
                    display: none !important;
                }
                .code-outline-highlight {
                    stroke: #FFD700 !important;
                    stroke-width: 4 !important;
                    stroke-dasharray: none !important;
                }
            `}</style>
        </div>
    );
};

export default QRScannerComponent;
