import { useState } from "react";
import HomeScreen from "./components/HomeScreen";
import AdminScreen from "./components/AdminScreen";
import UserScreen from "./components/UserScreen";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { supabase } from './supabaseClient'
import "./App.css";

function App() {
	const [currentMode, setCurrentMode] = useState("home");
	const [calibrado, setCalirado] = useState(false);
	const [pontoReferencia, setPontoReferencia] = useState(null);
	const [pontos, setPontos] = useLocalStorage("pontos", []);
	const [qntdPontos, setQntdPontos] = useState(0);

	async function getQtndPontos(qrReferencia) {
		const { count, error } = await supabase
			.from("pontos")
			.select("*", { count: 'exact', head: true })
			.eq("qr_referencia", qrReferencia)

		if (error) {
			console.log("Erro ao encontrar pontos: ", error.message)
			return;
		}

		return count;
	}

	const resetSystem = () => {
		setCalirado(false);
		setPontoReferencia(null);
		setCurrentMode("home");
	};

	const updatePontos = (novoPonto) => {
        if (Array.isArray(novoPonto)) {
            setPontos(novoPonto)
        } else {
            setPontos((prev) => [...prev, novoPonto]);
        }
	};

	return (
		<div className="app">
			{currentMode === "home" && (
				<HomeScreen pontos={pontos} onModeChange={setCurrentMode} />
			)}

			{currentMode === "admin" && (
				<AdminScreen
					calibrado={calibrado}
					setCalirado={setCalirado}
					pontoReferencia={pontoReferencia}
					setPontoReferencia={setPontoReferencia}
					qntdPontos={qntdPontos}
					setQntdPontos={setQntdPontos}
					getQtndPontos={getQtndPontos}
					pontos={pontos}
					updatePontos={updatePontos}
					onGoHome={resetSystem}
				/>
			)}

			{currentMode === "user" && (
				<UserScreen
					calibrado={calibrado}
					setCalirado={setCalirado}
					pontoReferencia={pontoReferencia}
					setPontoReferencia={setPontoReferencia}
					qntdPontos={qntdPontos}
					setQntdPontos={setQntdPontos}
					getQtndPontos={getQtndPontos}
					pontos={pontos}
					onGoHome={resetSystem}
				/>
			)}
		</div>
	);
}

export default App;
