import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerComponentProps {
    onScanSuccess: (value: string) => void;
    onClose: () => void;
}

const QRScannerComponent: React.FC<QRScannerComponentProps> = ({ onScanSuccess, onClose }) => {
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);

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

    useEffect(() => {
        let isUnmounted = false;
        const html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = html5QrCode;

        const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false,
        };

        html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                if (!isUnmounted) {
                    playBeep();
                    html5QrCode.stop().catch(console.error);
                    onScanSuccess(decodedText);
                }
            },
            (errorMessage) => {
                // Ignore parse errors, they happen continuously until a code is found
            }
        ).catch((err) => {
            console.error("Erro ao iniciar QR scanner:", err);
            setError("Não foi possível iniciar a câmera para ler QR Code. Tente novamente ou dê permissão de câmera.");
        });

        return () => {
            isUnmounted = true;
            if (scannerRef.current) {
                try {
                    scannerRef.current.stop().then(() => {
                        scannerRef.current?.clear();
                    }).catch(console.warn);
                } catch (e) {
                    console.warn(e);
                }
            }
        };
    }, [onScanSuccess]);

    return (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col">
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/90 to-transparent">
                <button onClick={onClose} className="text-white p-2 rounded-full bg-white/10 backdrop-blur-sm active:bg-white/30">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <span className="text-white font-bold tracking-wide drop-shadow-md">Leitor Especializado QR</span>
                <div className="w-10"></div> {/* Spacer for balance */}
            </div>

            <div className="relative flex-grow flex flex-col items-center justify-center bg-black">
                {error ? (
                    <div className="p-6 bg-white/10 rounded-2xl max-w-sm text-center">
                        <p className="text-red-400 font-bold mb-2">Erro</p>
                        <p className="text-white text-sm">{error}</p>
                        <button onClick={onClose} className="mt-4 px-6 py-2 bg-red-600 text-white rounded-xl font-bold">Voltar</button>
                    </div>
                ) : (
                    <div className="w-full max-w-md overflow-hidden relative">
                        <div id="qr-reader" className="w-full"></div>
                        <div className="mt-8 px-6 text-center">
                            <p className="text-yellow-400 font-bold text-sm mb-2 uppercase tracking-wider animate-pulse">
                                Alinhe o QR Code no quadrado
                            </p>
                            <p className="text-gray-300 text-xs">
                                Este leitor foi otimizado exclusivamente para focar e reconhecer QR Codes com alta precisão.
                            </p>
                        </div>
                    </div>
                )}
            </div>
            <style>{`
                /* Esconde o overlay padrão feio da biblioteca */
                #qr-reader__dashboard_section_csr span, 
                #qr-reader__dashboard_section_csr button {
                    display: none !important;
                }
                #qr-reader {
                    border: none !important;
                }
                #qr-reader video {
                    border-radius: 1rem;
                    object-fit: cover;
                }
            `}</style>
        </div>
    );
};

export default QRScannerComponent;
