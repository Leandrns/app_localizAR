import { useState, useCallback } from "react";
import QRScanner from "./QRScanner";
import ARView from "./ARView";
import MarkerFilter from "./MarkerFilter";
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
	const [filteredMarkers, setFilteredMarkers] = useState([]);
	const [showMarkerFilter, setShowMarkerFilter] = useState(false);

	// Callback para atualizar filtros
	const handleFilterChange = useCallback((selectedMarkers) => {
		setFilteredMarkers(selectedMarkers);
	}, []);

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
                            <strong>{pontoReferencia.qrCode}</strong>
                        </div>
                    </div>
                    
                    <p className="instructions">
                        Tudo pronto! Clique no botão abaixo para entrar no modo de Realidade Aumentada.
                        <br /><br />
                        <small style={{ color: '#4ecdc4' }}>
                            💡 Use o filtro <i className="fa-solid fa-filter"></i> para escolher quais marcadores visualizar.
                        </small>
                    </p>

                    <div className="action-buttons">
                        <button className="botao btn-recalibrar" onClick={() => setShowQRScanner(true)}>
                            <i className="fa-solid fa-rotate-right"></i> Recalibrar
                        </button>
                        
                        {showAR && (
                            <button 
                                className="botao btn-filtro" 
                                onClick={() => setShowMarkerFilter(!showMarkerFilter)}
                                style={{
                                    backgroundColor: showMarkerFilter ? '#4ecdc4' : 'transparent',
                                    color: showMarkerFilter ? '#1e1e1e' : '#4ecdc4'
                                }}
                            >
                                <i className="fa-solid fa-filter"></i> Filtros
                            </button>
                        )}
					</div>
                </section>
            )}
		</main>

		{/* Filtro de Marcadores */}
		{showAR && calibrado && pontoReferencia && (
			<MarkerFilter
				pontoReferencia={pontoReferencia}
				onFilterChange={handleFilterChange}
				isVisible={showMarkerFilter}
				onToggleVisibility={() => setShowMarkerFilter(!showMarkerFilter)}
			/>
		)}

		{/* AR View */}
		{showAR && calibrado && (
			<ARView
				mode="user"
				calibrado={calibrado}
				pontoReferencia={pontoReferencia}
				pontos={pontos}
				filteredMarkers={filteredMarkers}
			/>
		)} 
	</div>
	);
}

export default UserScreen;