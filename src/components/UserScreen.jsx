import { useState } from "react";
import QRScanner from "./QRScanner";
import ARView from "./ARView";
import { createClient } from "@supabase/supabase-js";
import "../styles/user.css";

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

	// ✅ ADICIONAR estes novos estados:
	const [pontosDisponiveis, setPontosDisponiveis] = useState([]);
	const [filtroSelecionado, setFiltroSelecionado] = useState('todos');
	const [showDropdown, setShowDropdown] = useState(false);

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

	useEffect(() => {
    const buscarNomesPontos = async () => {
        if (!calibrado || !pontoReferencia) return;

        try {
            const { data, error } = await supabase
                .from("pontos")
                .select("nome")
                .eq("qr_referencia", pontoReferencia.qrCode);

            if (!error && data) {
                const nomesUnicos = [...new Set(data.map(p => p.nome))];
                setPontosDisponiveis(nomesUnicos);
                console.log(`Found ${nomesUnicos.length} unique point names:`, nomesUnicos);
            }
        } catch (err) {
            console.error("Erro ao buscar nomes:", err);
        }
    };

    buscarNomesPontos();
}, [calibrado, pontoReferencia]);

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
        ←
    </button>
</header>

{/* ✅ ADICIONAR este dropdown AQUI: */}
{calibrado && pontosDisponiveis.length > 0 && (
    <div style={{
        position: 'fixed', top: '80px', right: '20px', zIndex: 5,
        minWidth: '200px'
    }}>
        <button 
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
                width: '100%', padding: '10px 15px',
                background: 'rgba(78, 205, 196, 0.2)',
                border: '2px solid #4ecdc4', borderRadius: '8px',
                color: '#4ecdc4', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontFamily: 'Lexend', fontSize: '14px'
            }}
        >
            <span>
                {filtroSelecionado === 'todos' ? '🗺️ Todos os Pontos' : `📍 ${filtroSelecionado}`}
            </span>
            <span>{showDropdown ? '▲' : '▼'}</span>
        </button>
        
        {showDropdown && (
            <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: 'rgba(30, 30, 30, 0.95)', 
                border: '2px solid #4ecdc4', borderRadius: '8px',
                marginTop: '5px', maxHeight: '200px', overflowY: 'auto',
                backdropFilter: 'blur(10px)'
            }}>
                <div 
                    onClick={() => {
                        setFiltroSelecionado('todos');
                        setShowDropdown(false);
                    }}
                    style={{
                        padding: '10px 15px', cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        fontFamily: 'Lexend', fontSize: '14px'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(78, 205, 196, 0.2)'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                    🗺️ Mostrar Todos
                </div>
                
                {pontosDisponiveis.map((nome, index) => (
                    <div 
                        key={index}
                        onClick={() => {
                            setFiltroSelecionado(nome);
                            setShowDropdown(false);
                        }}
                        style={{
                            padding: '10px 15px', cursor: 'pointer',
                            borderBottom: index < pontosDisponiveis.length - 1 ? 
                                       '1px solid rgba(255,255,255,0.1)' : 'none',
                            fontFamily: 'Lexend', fontSize: '14px'
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(78, 205, 196, 0.2)'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        📍 {nome}
                    </div>
                ))}
            </div>
        )}
    </div>
)}
			</main>
			{showAR && calibrado && (
				<ARView
					mode="user"
					calibrado={calibrado}
					pontoReferencia={pontoReferencia}
					pontos={pontos}
					filtroAtivo={filtroSelecionado} 
				/>
			)} 
		</div>
			
	);
}

export default UserScreen;
