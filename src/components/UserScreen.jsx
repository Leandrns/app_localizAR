import { useState, useMemo } from "react";
import QRScanner from "./QRScanner";
import ARView from "./ARView";

function UserScreen({
	calibrado,
	setCalirado,
	pontoReferencia,
	setPontoReferencia,
	pontos,
	onGoHome,
}) {
	const [showQRScanner, setShowQRScanner] = useState(false);
	const [showAR, setShowAR] = useState(false);

	const stats = useMemo(() => {
		const eventos = [...new Set(pontos.map((p) => p.qrReferencia))];
		const pontosDoEvento = pontoReferencia
			? pontos.filter((p) => p.qrReferencia === pontoReferencia.qrCode)
			: [];

		return {
			totalPontos: pontos.length,
			totalEventos: eventos.length,
			pontosEvento: pontosDoEvento.length,
			eventoAtual: pontoReferencia ? pontoReferencia.qrCode : "Nenhum",
		};
	}, [pontos, pontoReferencia]);

	const handleQRDetected = (qrData) => {
		if (qrData.length > 3) {
			const novoPontoReferencia = {
				qrCode: qrData,
				timestamp: Date.now(),
				gps: null,
				arPosition: null,
			};

			setPontoReferencia(novoPontoReferencia);
			setCalirado(true);
			setShowQRScanner(false);

			const pontosDoEvento = pontos.filter((p) => p.qrReferencia === qrData);
			alert(
				`Calibração realizada!\nEvento: ${qrData}\nPontos disponíveis: ${pontosDoEvento.length}\nEntre no modo AR para visualizar.`
			);

			// Inicializar AR automaticamente
			setTimeout(() => {
				setShowAR(true);
			}, 500);
		} else {
			alert("QR Code inválido. Use um QR Code válido.");
		}
	};

	if (showQRScanner) {
		return (
			<QRScanner
				onQRDetected={handleQRDetected}
				onCancel={() => setShowQRScanner(false)}
			/>
		);
	}

	return (
		<div id="user-screen">
			<button className="btn btn-back" onClick={onGoHome}>
				← Voltar
			</button>

			<div id="info" className="user-header">
				<strong>👥 Modo Visitante</strong>
				<br />
				<div className={calibrado ? "status-calibrado" : "status-nao-calibrado"}>
					{calibrado ? "✅ Sistema Calibrado" : "❌ Não calibrado"}
				</div>
				<button className="btn" onClick={() => setShowQRScanner(true)}>
					{calibrado ? "Recalibrar" : "Calibrar com QR Code"}
				</button>
				<br />
				<br />
				<div id="user-instructions">
					{calibrado && pontoReferencia ? (
						<>
							<strong>Evento:</strong> {pontoReferencia.qrCode}
							<br />
							<strong>Pontos disponíveis:</strong> {stats.pontosEvento}
							<br />
							Entre no AR para visualizar
						</>
					) : (
						<>
							1. Calibre com o QR Code do evento
							<br />
							2. Entre no AR para ver os pontos
						</>
					)}
				</div>
			</div>

			<div id="user-stats">
				<strong>📊 Estatísticas</strong>
				<br />
				<div>Pontos disponíveis: {stats.totalPontos}</div>
				<div>Eventos: {stats.totalEventos}</div>
				<div>Evento atual: {stats.eventoAtual}</div>
			</div>

			{showAR && calibrado && (
				<ARView
					mode="user"
					calibrado={calibrado}
					pontoReferencia={pontoReferencia}
					pontos={pontos}
				/>
			)}
		</div>
	);
}

export default UserScreen;
