import { useState, useEffect } from "react";
import QRScanner from "./QRScanner";
import ARView from "./ARView";

function AdminScreen({
	calibrado,
	setCalirado,
	pontoReferencia,
	setPontoReferencia,
	pontos,
    setPontos,
	updatePontos,
	onGoHome,
}) {
	const [showQRScanner, setShowQRScanner] = useState(false);
	const [pontosCreated, setPontosCreated] = useState(0);
	const [showAR, setShowAR] = useState(false);

	useEffect(() => {
		if (calibrado && pontoReferencia) {
			const pontosDoEvento = pontos.filter(
				(p) => p.qrReferencia === pontoReferencia.qrCode
			);
			setPontosCreated(pontosDoEvento.length);
		}
	}, [pontos, pontoReferencia, calibrado]);

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

			alert(
				`Calibração realizada!\nEvento: ${qrData}\nEntre no modo AR para criar pontos.\nCONTINUE APONTANDO O CELULAR PARA O QR CODE PARA CLICAR EM START AR`
			);

			// Inicializar AR automaticamente
			setTimeout(() => {
				setShowAR(true);
			}, 500);
		} else {
			alert("QR Code inválido. Use um QR Code válido.");
		}
	};

	const handleCreatePoint = (posicaoRelativa) => {
		const novoPonto = {
			id: generateId(),
			posicaoRelativa: posicaoRelativa,
			qrReferencia: pontoReferencia.qrCode,
			timestamp: Date.now(),
			tipo: "cubo",
			criadoPor: "admin",
		};

		setPontos((pontosAntigos) => {
			const novosPontos = [...pontosAntigos, novoPonto];
			updatePontos(novosPontos);
			return novosPontos;
		});
		setPontosCreated((prev) => prev + 1);
	};

	const handleClearAll = () => {
		if (confirm("Tem certeza que deseja limpar TODOS os pontos salvos?")) {
			updatePontos([]);
			setPontosCreated(0);
			alert("Todos os pontos foram removidos!");
		}
	};

	const generateId = () => {
		return Date.now().toString(36) + Math.random().toString(36);
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
		<div id="admin-screen">
			<button className="btn btn-back" onClick={onGoHome}>
				← Voltar
			</button>

			<div id="info" className="admin-header">
				<strong>🔧 Modo Administrador</strong>
				<br />
				<div className={calibrado ? "status-calibrado" : "status-nao-calibrado"}>
					{calibrado ? "✅ Sistema Calibrado" : "❌ Não calibrado"}
				</div>
				<button className="btn" onClick={() => setShowQRScanner(true)}>
					{calibrado ? "Recalibrar" : "Calibrar com QR Code"}
				</button>
				<br />
				<div id="instructions">
					{calibrado && pontoReferencia ? (
						<>
							<strong>QR:</strong> {pontoReferencia.qrCode}
							<br />
							Toque no retículo para criar novos pontos
						</>
					) : (
						<>
							1. Primeiro, faça a calibração
							<br />
							2. Depois toque no retículo para criar cubos
						</>
					)}
				</div>
			</div>

			<div id="status">
				<div id="points-count">Pontos criados: {pontosCreated}</div>
				<button
					className="btn"
					style={{ background: "#dc3545", marginTop: "10px" }}
					onClick={handleClearAll}
				>
					🗑️ Limpar Todos
				</button>
			</div>

			{showAR && calibrado && (
				<ARView
					mode="admin"
					calibrado={calibrado}
					pontoReferencia={pontoReferencia}
					pontos={pontos}
					onCreatePoint={handleCreatePoint}
				/>
			)}
		</div>
	);
}

export default AdminScreen;
