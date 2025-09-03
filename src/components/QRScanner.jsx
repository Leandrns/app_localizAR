import { useRef, useEffect, useState } from "react";
import jsQR from "jsqr";

function QRScanner({ onQRDetected, onCancel }) {
	const videoRef = useRef(null);
	const canvasRef = useRef(null);
	const animationRef = useRef(null);

	const [isScanning, setIsScanning] = useState(false);
	const [videoReady, setVideoReady] = useState(false);

	useEffect(() => {
		startScanning();

		return () => {
			stopScanning();
		};
	}, []);

	const startScanning = async () => {
		try {
			const mediaStream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "environment" },
			});

			setIsScanning(true);

			if (videoRef.current) {
				videoRef.current.srcObject = mediaStream;

				videoRef.current.onloadedmetadata = async () => {
					setVideoReady(true);

					try {
						await videoRef.current.play();
						scanQRCode();
					} catch (playError) {
						console.error("Erro ao reproduzir vídeo:", playError);
						setTimeout(async () => {
							try {
								if (videoRef.current && isScanning) {
									await videoRef.current.play();
									scanQRCode();
								}
							} catch (retryError) {
								console.error("Erro na segunda tentativa:", retryError);
							}
						}, 100);
					}
				};
			}
		} catch (error) {
			console.error("Erro ao acessar câmera:", error);
			alert("Não foi possível acessar a câmera");
			onCancel();
		}
	};

	const stopScanning = () => {
		setIsScanning(false);
		setVideoReady(false);

		if (animationRef.current) {
			cancelAnimationFrame(animationRef.current);
			animationRef.current = null;
		}

		if (videoRef.current?.srcObject) {
			videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
			videoRef.current.srcObject = null;
		}
	};

	const scanQRCode = () => {
		const video = videoRef.current;
		const canvas = canvasRef.current;
		const context = canvas.getContext("2d");

		const tick = () => {
			try {
				if (video.readyState === video.HAVE_ENOUGH_DATA) {
					canvas.width = video.videoWidth;
					canvas.height = video.videoHeight;

					context.drawImage(video, 0, 0, canvas.width, canvas.height);
					const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

					const code = jsQR(imageData.data, imageData.width, imageData.height, {
						inversionAttempts: "dontInvert",
					});

					if (code) {
						console.log("✅ QR Code detectado:", code.data);
						stopScanning();
						onQRDetected(code.data);
						return;
					}
				}
			} catch (error) {
				console.error("❌ Erro ao processar frame:", error);
			}

			animationRef.current = requestAnimationFrame(tick);
		};

		tick();
	};

	const handleCancel = () => {
		stopScanning();
		onCancel();
	};

	return (
		<div id="qr-scanner" style={{ position: "relative" }}>
			<div id="qr-instructions">
				<h3>Calibração do Sistema</h3>
				<p>Aponte a câmera para o QR Code do evento.</p>
				<p>Este QR deve estar no ponto de entrada ou referência do local.</p>
				{!videoReady && isScanning && (
					<p style={{ color: "#ffa500" }}>🔄 Iniciando câmera...</p>
				)}
				{videoReady && (
					<p style={{ color: "#00ff00" }}>✅ Câmera ativa - procurando QR Code...</p>
				)}
				<p style={{ fontSize: "14px", opacity: 0.8 }}>
					Dica: Mantenha o QR Code bem iluminado e centralizado
				</p>
			</div>

			<video
				ref={videoRef}
				id="qr-video"
				autoPlay
				muted
				playsInline
				style={{
					width: "80%",
					maxWidth: "400px",
					borderRadius: "8px",
					display: "block",
					background: "#000",
					border: videoReady ? "2px solid #00ff00" : "2px solid #666",
				}}
			/>

			<canvas
				ref={canvasRef}
				style={{
					display: "none",
				}}
			/>

			<div style={{ marginTop: "10px" }}>
				<button id="cancel-qr" className="btn" onClick={handleCancel}>
					Cancelar
				</button>
			</div>
		</div>
	);
}

export default QRScanner;
