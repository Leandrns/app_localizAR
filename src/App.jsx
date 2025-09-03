import { useState } from "react";
import HomeScreen from "./components/HomeScreen";
import AdminScreen from "./components/AdminScreen";
import UserScreen from "./components/UserScreen";
import { useLocalStorage } from "./hooks/useLocalStorage";
import "./App.css";

function App() {
	const [currentMode, setCurrentMode] = useState("home");
	const [calibrado, setCalirado] = useState(false);
	const [pontoReferencia, setPontoReferencia] = useState(null);
	const [pontos, setPontos] = useLocalStorage("pontos", []);

	const resetSystem = () => {
		setCalirado(false);
		setPontoReferencia(null);
		setCurrentMode("home");
	};

	const updatePontos = (novoPonto) => {
		setPontos((prev) => [...prev, novoPonto]);
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
					pontos={pontos}
                    setPontos={setPontos}
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
					pontos={pontos}
					onGoHome={resetSystem}
				/>
			)}
		</div>
	);
}

export default App;
