import { useState } from "react";
import QRScanner from "./QRScanner";
import ARView from "./ARView";
import "../styles/user.css";

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
    <div className="user-container">
        <main className="user-card">
            <header className="user-card-header">
                <h2><i className="fa-solid fa-map-marker-alt"></i> Modo Visitante</h2>
                <button className="btn-icon" onClick={onGoHome} title="Voltar">
                    <i className="fa-solid fa-arrow-left"></i> Voltar
                </button>
            </header>

            {!calibrado ? (
                // --- ESTADO NÃO CALIBRADO ---
                <section className="user-card-body calibration-needed">
                    <div className="status-badge nao-calibrado">
                        <i className="fa-solid fa-qrcode"></i> Calibração Necessária
                    </div>
                    <p className="instructions">
                        Para começar, aponte a câmera para o QR Code do evento para calibrar sua posição.
                    </p>
                    <button className="botao btn-calibrar-user" onClick={() => setShowQRScanner(true)}>
                        Calibrar com QR Code
                    </button>
                </section>

            ) : (
                // --- ESTADO CALIBRADO ---
                <section className="user-card-body calibration-done">
                    <div className="status-badge calibrado">
                        <i className="fa-solid fa-check"></i> Sistema Calibrado
                    </div>

                    <div className="info-group">
                        <div className="info-item">
                            <span>Bem-vindo(a) ao evento</span>
                            {pontoReferencia.qrCode}
                        </div>
                    </div>
                    
                    <p className="instructions">
                        Tudo pronto! Clique no botão abaixo para entrar no modo de Realidade Aumentada.
                    </p>

                    <div className="action-buttons">
                        <button className="botao btn-recalibrar" onClick={() => setShowQRScanner(true)}>
                            <i className="fa-solid fa-rotate-right"></i> Recalibrar
                        </button> 
					</div>
                </section>
            )}
			</main>
			{/* <div id="user-stats">
				<strong>📊 Estatísticas</strong>
				<br />
				<div>Pontos disponíveis: {stats.totalPontos}</div>
				<div>Eventos: {stats.totalEventos}</div>
				<div>Evento atual: {stats.eventoAtual}</div>
			</div>
			*/}

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
