import { useState, useEffect } from "react";
import QRScanner from "./QRScanner";
import ARView from "./ARView";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
	"https://sgpthwvonmqnlfuxupul.supabase.co",
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncHRod3Zvbm1xbmxmdXh1cHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4NDU0NTgsImV4cCI6MjA3MjQyMTQ1OH0.t0zz2ZJOFhWU6LsSdWZLXEgnk7dEB2x_gsCjNVPYZ3Y"
);

function AdminScreen({
	calibrado,
	setCalirado,
	pontoReferencia,
	setPontoReferencia,
	pontos,
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

	const handleCreatePoint = async (posicaoRelativa) => {
		const novoPonto = {
			id: generateId(),
			posicaoRelativa: posicaoRelativa,
			qrReferencia: pontoReferencia.qrCode,
			timestamp: Date.now(),
			criadoPor: "admin",
		};

		updatePontos(novoPonto);
		setPontosCreated((prev) => prev + 1);

		// Salva no Supabase
		const { error } = await supabase.from("pontos").insert({
			id: novoPonto.id,
			pos_x: posicaoRelativa.x,
			pos_y: posicaoRelativa.y,
			pos_z: posicaoRelativa.z,
			qr_referencia: novoPonto.qrReferencia,
			created_by: novoPonto.criadoPor,
		});

		if (error) {
			console.error("Erro ao salvar ponto no Supabase:", error.message);
		} else {
			console.log("✅ Ponto salvo no Supabase");
		}
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
