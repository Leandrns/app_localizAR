import { useState, useEffect } from "react";
import QRScanner from "./QRScanner";
import ARView from "./ARView";
import "../styles/admin.css";
import { supabase } from '../supabaseClient'

function AdminScreen({
	calibrado,
	setCalirado,
	pontoReferencia,
	setPontoReferencia,
	qntdPontos,
	setQntdPontos,
	getQtndPontos,
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

			setQntdPontos(getQtndPontos(pontoReferencia.qrCode))
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

	// MODIFICAR a função handleCreatePoint existente:
const handleCreatePoint = async (dadosPonto) => {
    const novoPonto = {
        id: generateId(),
        posicaoRelativa: dadosPonto,
        qrReferencia: pontoReferencia.qrCode,
        timestamp: Date.now(),
        criadoPor: "admin",
        nome: dadosPonto.nome || 'Ponto sem nome' // ✅ ADICIONAR esta linha
    };

    updatePontos(novoPonto);
    setPontosCreated((prev) => prev + 1);

    // MODIFICAR insert do Supabase:
    const { error } = await supabase.from("pontos").insert({
        id: novoPonto.id,
        pos_x: dadosPonto.x,
        pos_y: dadosPonto.y,
        pos_z: dadosPonto.z,
        qr_referencia: novoPonto.qrReferencia,
        created_by: novoPonto.criadoPor,
        nome: dadosPonto.nome // ✅ ADICIONAR esta linha
    });

    if (error) {
        console.error("Erro ao salvar ponto no Supabase:", error.message);
    } else {
        console.log(`✅ Ponto "${dadosPonto.nome}" salvo no Supabase`);
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
    <div className="admin-container">
        <main className="admin-card">
            <header className="admin-card-header">
                <h2><i className="fa-solid fa-wrench"></i> Modo Administrador</h2>
                <button className="btn-icon" onClick={onGoHome} title="Voltar">
                    <i className="fa-solid fa-arrow-left"></i> Voltar
                </button>
            </header>

            {!calibrado ? (
                //NÃO CALIBRADO
                <section className="admin-card-body calibration-needed">
                    <div className="status-badge nao-calibrado">
                        <i className="fa-solid fa-qrcode"></i> Calibração Necessária
                    </div>
                    <p className="instructions">
                        Para começar, aponte a câmera para o QR Code do evento para calibrar a posição.
                    </p>
                    <button className="btn-calibrar-admin" onClick={() => setShowQRScanner(true)}>
                        Calibrar com QR Code
                    </button>
                </section>

            ) : (
				// CALIBRADO
                <section className="admin-card-body calibration-done">
                    <div className="status-badge calibrado">
                        <i className="fa-solid fa-check"></i> Sistema Calibrado
                    </div>

                    <div className="info-group">
                        <div className="info-item">
                            <span>Evento</span>
                            <strong>{pontoReferencia.qrCode}</strong>
                        </div>
                        <div className="info-item">
                            <span>Pontos Criados</span>
                            {qntdPontos}
                        </div>
                    </div>
                    
                    <p className="instructions">
                        Tudo pronto! Clique no botão Start AR para entrar no modo de Realidade Aumentada.
                    </p>

                    <div className="action-buttons">
                        <button className="botao btn-recalibrar" onClick={() => setShowQRScanner(true)}>
                            <i className="fa-solid fa-rotate-right"></i> Recalibrar
                        </button>
                    </div> 
                </section>
            )}
        </main>
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
