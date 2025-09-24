import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { supabase } from '../supabaseClient'

function ARView({ mode, calibrado, pontoReferencia, pontos, onCreatePoint }) {
	const containerRef = useRef(null);
	const sceneRef = useRef(null);
	const rendererRef = useRef(null);
	const cameraRef = useRef(null);
	const reticleRef = useRef(null);
	const controllerRef = useRef(null);
	const hitTestSourceRef = useRef(null);
	const localReferenceSpaceRef = useRef(null);
	const loaderRef = useRef(new GLTFLoader());
	const selectableObjectsRef = useRef([]); // objetos que podem ser clicados
	const raycasterRef = useRef(new THREE.Raycaster());
	const tempMatrixRef = useRef(new THREE.Matrix4());
	const flipAnimationsRef = useRef([]); // animações ativas
	const lastTimestampRef = useRef(0);
	
	// Estados para o sistema de prêmios
	const [showPrizeModal, setShowPrizeModal] = useState(false);
	const [currentPrize, setCurrentPrize] = useState(null);
	const clickCounterRef = useRef(new Map()); // Map para contar cliques por objeto

	// Sistema de prêmios com probabilidades por raridade
	const prizeSystem = {
		// Prêmios Comuns (60% de chance total)
		comum: {
			probability: 0.60,
			prizes: [
				{ name: "Desconto de 5%", description: "5% de desconto na próxima compra", icon: "🎟️", rarity: "Comum" },
				{ name: "Brinde Simples", description: "Ganhe um brinde básico do evento", icon: "🎁", rarity: "Comum" },
				{ name: "Drink com Desconto", description: "20% de desconto em bebidas", icon: "🥤", rarity: "Comum" },
				{ name: "Mapa do Evento", description: "Mapa físico premium do evento", icon: "🗺️", rarity: "Comum" },
			]
		},
		// Prêmios Raros (25% de chance total)
		raro: {
			probability: 0.25,
			prizes: [
				{ name: "Desconto de 15%", description: "15% de desconto na próxima compra", icon: "🎫", rarity: "Raro" },
				{ name: "Brinde Especial", description: "Ganhe um brinde exclusivo do evento", icon: "🎁", rarity: "Raro" },
				{ name: "Drink Grátis", description: "Uma bebida cortesia no bar", icon: "🍹", rarity: "Raro" },
				{ name: "Foto Premium", description: "Sessão de fotos profissional gratuita", icon: "📸", rarity: "Raro" },
				{ name: "Mesa Reservada", description: "Mesa reservada na área premium", icon: "🪑", rarity: "Raro" },
			]
		},
		// Prêmios Épicos (12% de chance total)
		epico: {
			probability: 0.12,
			prizes: [
				{ name: "Desconto de 25%", description: "25% de desconto na próxima compra", icon: "💳", rarity: "Épico" },
				{ name: "Entrada VIP", description: "Acesso VIP para a próxima área", icon: "⭐", rarity: "Épico" },
				{ name: "Kit Exclusivo", description: "Kit de produtos exclusivos", icon: "📦", rarity: "Épico" },
				{ name: "Experiência Plus", description: "Upgrade para experiência premium", icon: "✨", rarity: "Épico" },
			]
		},
		// Prêmios Lendários (3% de chance total)
		lendario: {
			probability: 0.03,
			prizes: [
				{ name: "Desconto de 50%", description: "50% de desconto na próxima compra", icon: "💎", rarity: "Lendário" },
				{ name: "Acesso Backstage", description: "Visite o backstage do evento", icon: "🎭", rarity: "Lendário" },
				{ name: "Experiência VIP Completa", description: "Acesso total VIP + brindes exclusivos", icon: "👑", rarity: "Lendário" },
			]
		}
	};

	// Cores para cada raridade
	const rarityColors = {
		"Comum": "#95a5a6",
		"Raro": "#3498db",
		"Épico": "#9b59b6",
		"Lendário": "#f1c40f"
	};

	useEffect(() => {
		if (calibrado && containerRef.current) {
			initAR();
		}

		return () => {
			cleanup();
		};
	}, [calibrado, mode]);

	const initAR = () => {
		const container = containerRef.current;
		if (!container) return;

		// Scene
		const scene = new THREE.Scene();
		sceneRef.current = scene;

		// Camera
		const camera = new THREE.PerspectiveCamera(
			70,
			window.innerWidth / window.innerHeight,
			0.01,
			20
		);
		cameraRef.current = camera;

		// Lights
		const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
		light.position.set(0.5, 1, 0.25);
		scene.add(light);

		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
		directionalLight.position.set(1, 1, 1);
		scene.add(directionalLight);

		// Renderer
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.xr.enabled = true;
		rendererRef.current = renderer;

		container.appendChild(renderer.domElement);

		// AR Button
		const arButton = ARButton.createButton(renderer, {
			requiredFeatures: ["hit-test"],
		});
		container.appendChild(arButton);

		// Reticle (só para admin)
		if (mode === "admin") {
			const geometry = new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2);
			const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
			const reticle = new THREE.Mesh(geometry, material);
			reticle.matrixAutoUpdate = false;
			reticle.visible = false;
			reticleRef.current = reticle;
			scene.add(reticle);
		}

		// Controller - um único handler que faz ações diferentes conforme mode
		const controller = renderer.xr.getController(0);
		controller.addEventListener("select", onSelect);
		controllerRef.current = controller;
		scene.add(controller);

		// Event listeners
		renderer.xr.addEventListener("sessionstart", onSessionStart);
		renderer.xr.addEventListener("sessionend", onSessionEnd);
		window.addEventListener("resize", onWindowResize);

		animate();
	};

	const onSessionStart = () => {
		const renderer = rendererRef.current;
		if (!renderer) return;

		const session = renderer.xr.getSession();

		session.requestReferenceSpace("viewer").then((viewerReferenceSpace) => {
			session.requestHitTestSource({ space: viewerReferenceSpace }).then((source) => {
				hitTestSourceRef.current = source;
			});
		});

		session.requestReferenceSpace("local").then((refSpace) => {
			localReferenceSpaceRef.current = refSpace;

			if (calibrado && pontoReferencia) {
				if (!pontoReferencia.arPosition) {
					pontoReferencia.arPosition = new THREE.Vector3(0, 0, 0);
				}

				// Carregar pontos salvos
				setTimeout(() => {
					carregarPontosSalvos();
				}, 1000);
			}
		});
	};

	const onSessionEnd = () => {
		hitTestSourceRef.current = null;
		localReferenceSpaceRef.current = null;
		if (reticleRef.current) {
			reticleRef.current.visible = false;
		}
		limparObjetosAR();
		flipAnimationsRef.current = [];
		lastTimestampRef.current = 0;
		selectableObjectsRef.current = [];
		// Limpar contador de cliques
		clickCounterRef.current.clear();
	};

	// Função para gerar prêmio baseado em probabilidade
	const generatePrizeByProbability = () => {
		const random = Math.random();
		let cumulativeProbability = 0;

		// Verificar cada categoria de raridade em ordem (lendário -> épico -> raro -> comum)
		const rarityOrder = ['lendario', 'epico', 'raro', 'comum'];
		
		for (const rarity of rarityOrder) {
			cumulativeProbability += prizeSystem[rarity].probability;
			
			if (random <= cumulativeProbability) {
				// Selecionar um prêmio aleatório desta raridade
				const prizes = prizeSystem[rarity].prizes;
				const randomIndex = Math.floor(Math.random() * prizes.length);
				return prizes[randomIndex];
			}
		}

		// Fallback - retorna um prêmio comum caso algo dê errado
		const commonPrizes = prizeSystem.comum.prizes;
		return commonPrizes[Math.floor(Math.random() * commonPrizes.length)];
	};

	// Handler único para select — cria ponto no admin, dispara flip no visitante
	const onSelect = (event) => {
		// Se for admin, cria pontos
		if (mode === "admin") {
			if (!calibrado) {
				alert("Faça a calibração primeiro!");
				return;
			}
			if (!reticleRef.current || !reticleRef.current.visible) return;

			// Pega posição do retículo
			const position = new THREE.Vector3();
			position.setFromMatrixPosition(reticleRef.current.matrix);

			const posicaoRelativa = calcularPosicaoRelativa(position);

			// Carrega modelo 3D
			loaderRef.current.load(
				"/map_pointer_3d_icon.glb",
				(gltf) => {
					const model = gltf.scene;
					model.position.copy(position);
					model.position.y += 1;
					model.scale.set(0.1, 0.1, 0.1);

					model.userData = {
						carregado: true,
						dadosOriginais: posicaoRelativa,
					};

					// Cor aleatória
					const cor = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
					model.traverse((child) => {
						if (child.isMesh) {
							if (child.material) child.material = child.material.clone();
							child.material.color = cor;
						}
					});

					sceneRef.current.add(model);
					// adiciona ao selectable para consistência
					selectableObjectsRef.current.push(model);

					if (onCreatePoint) onCreatePoint(posicaoRelativa);
				},
				undefined,
				(error) => {
					console.error("Erro ao carregar modelo:", error);
					// Fallback para cubo simples
					criarCuboFallback(position, posicaoRelativa);
				}
			);
			return;
		}

		// Modo visitante: detectar interseção com objetos carregados e iniciar flip
		if (mode === "user") {
			const controller = controllerRef.current;
			const scene = sceneRef.current;
			if (!controller || !scene) return;

			// Raycast a partir do controller
			const raycaster = raycasterRef.current;
			const tempMatrix = tempMatrixRef.current;
			tempMatrix.identity().extractRotation(controller.matrixWorld);

			raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
			raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

			const intersects = raycaster.intersectObjects(selectableObjectsRef.current, true);
			if (intersects.length > 0) {
				// pegar o objeto
				let selected = intersects[0].object;
				let root = selected;
				while (root.parent && !root.userData?.carregado) {
					root = root.parent;
				}
				// se root não tiver flag, usar selected
				if (!root.userData) root = selected;

				// Incrementar contador de cliques para este objeto
				const objectId = root.uuid;
				const currentClicks = clickCounterRef.current.get(objectId) || 0;
				const newClickCount = currentClicks + 1;
				clickCounterRef.current.set(objectId, newClickCount);

				// Iniciar animação de flip (rotaciona em Y)
				startFlipAnimation(root, { axis: "y", degree: (2*Math.PI), duration: 600 });

				// Verificar se atingiu 3 cliques
				if (newClickCount >= 3) {
					// Feedback visual: piscar mudando cor
					const materials = Array.isArray(root.material) ? root.material : [root.material];

					materials.forEach((mat) => {
						let flashes = 0;
						const originalColor = mat.color.clone();
						const flashColor = new THREE.Color(0xffff00); // amarelo forte

						const interval = setInterval(() => {
							mat.color.copy(flashes % 2 === 0 ? flashColor : originalColor);
							flashes++;
							if (flashes > 5) { // 3 piscadas
								clearInterval(interval);
								mat.color.copy(originalColor);
							}
						}, 150);
					});

					// Resetar contador para este objeto
					clickCounterRef.current.set(objectId, 0);
					
					// Gerar prêmio baseado em probabilidade
					const prize = generatePrizeByProbability();
					setCurrentPrize(prize);
					
					// Mostrar modal após um pequeno delay para a animação terminar
					setTimeout(() => {
						setShowPrizeModal(true);
					}, 700);
				}
			}
		}
	};

	// inicia animação de flip: axis = 'x'|'y'|'z', degree em radianos, duration em ms
	const startFlipAnimation = (object3D, { axis = "y", degree = Math.PI, duration = 600 } = {}) => {
		if (!object3D) return;
		const start = object3D.rotation[axis];
		const target = start + degree;
		flipAnimationsRef.current.push({
			object: object3D,
			axis,
			start,
			target,
			elapsed: 0,
			duration,
		});
	};

	// easing (easeOutQuad)
	const easeOutQuad = (t) => {
		return t * (2 - t);
	};

	const criarCuboFallback = (position, posicaoRelativa) => {
		const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
		const material = new THREE.MeshLambertMaterial({
			color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
		});
		const cube = new THREE.Mesh(geometry, material);
		cube.position.copy(position);
		cube.position.y += 0.05;

		cube.userData = {
			carregado: true,
			dadosOriginais: posicaoRelativa,
		};

		sceneRef.current.add(cube);
		selectableObjectsRef.current.push(cube);

		if (onCreatePoint) {
			onCreatePoint(posicaoRelativa);
		}
	};

	// Função para buscar pontos no Supabase
	const carregarPontosSalvos = async () => {
		if (!calibrado || !pontoReferencia) return;

		try {
			// Buscar pontos do Supabase
			const { data, error } = await supabase
				.from("pontos")
				.select("*")
				.eq("qr_referencia", pontoReferencia.qrCode);

			if (error) {
				console.error("Erro ao carregar pontos do Supabase:", error.message);
				return;
			}

			console.log(`Carregando ${data.length} pontos do banco para modo ${mode}...`);

			data.forEach((ponto, index) => {
				const posicaoAbsoluta = new THREE.Vector3(
					ponto.pos_x,
					ponto.pos_y,
					ponto.pos_z
				);

				if (pontoReferencia.arPosition) {
					posicaoAbsoluta.add(pontoReferencia.arPosition.clone());
				}

				criarModeloCarregado(posicaoAbsoluta, ponto, index);
			});
		} catch (err) {
			console.error("Erro inesperado ao buscar pontos:", err);
		}
	};

	const criarModeloCarregado = (posicao, dadosPonto, index) => {
		loaderRef.current.load(
			"/map_pointer_3d_icon.glb",
			(gltf) => {
				const model = gltf.scene;
				model.position.copy(posicao);
				model.position.y += 1;
				model.scale.set(0.1, 0.1, 0.1);

				model.userData = {
					carregado: true,
					dadosOriginais: dadosPonto,
				};

				const cor = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);

				model.traverse((child) => {
					if (child.isMesh) {
						if (child.material) child.material = child.material.clone();
						child.material.color = cor;
					}
				});

				sceneRef.current.add(model);
				// adiciona ao array de selecionáveis
				if (Math.random() > 0.5) {
					selectableObjectsRef.current.push(model);
				}
			},
			undefined,
			(error) => {
				console.error("Erro ao carregar modelo:", error);
				// Fallback para cubo
				criarCuboCarregado(posicao, dadosPonto, index);
			}
		);
	};

	const criarCuboCarregado = (posicao, dadosPonto, index) => {
		const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
		const hue = (index * 0.1) % 1;
		const saturation = mode === "admin" ? 0.5 : 0.7;
		const lightness = mode === "admin" ? 0.4 : 0.6;
		const cor = new THREE.Color().setHSL(hue, saturation, lightness);

		const material = new THREE.MeshLambertMaterial({ color: cor });
		const cube = new THREE.Mesh(geometry, material);
		cube.position.copy(posicao);
		cube.position.y += 0.05;

		cube.userData = {
			carregado: true,
			dadosOriginais: dadosPonto,
		};

		sceneRef.current.add(cube);
		selectableObjectsRef.current.push(cube);
	};

	const calcularPosicaoRelativa = (posicaoAR) => {
		if (!pontoReferencia || !pontoReferencia.arPosition) {
			return posicaoAR.clone();
		}
		return posicaoAR.clone().sub(pontoReferencia.arPosition);
	};

	const limparObjetosAR = () => {
		if (!sceneRef.current) return;

		const objetosParaRemover = [];
		sceneRef.current.traverse((child) => {
			if (
				child.isMesh &&
				(child.geometry?.type === "BoxGeometry" || child.userData?.carregado)
			) {
				objetosParaRemover.push(child);
			}
		});

		objetosParaRemover.forEach((obj) => {
			if (obj.parent) obj.parent.remove(obj);
			if (obj.geometry) obj.geometry.dispose();
			if (obj.material) {
				// materiais podem ser arrays ou objetos
				if (Array.isArray(obj.material)) {
					obj.material.forEach((m) => m.dispose && m.dispose());
				} else {
					obj.material.dispose && obj.material.dispose();
				}
			}
		});

		// limpar arrays auxiliares
		selectableObjectsRef.current = [];
		flipAnimationsRef.current = [];
	};

	const onWindowResize = () => {
		const camera = cameraRef.current;
		const renderer = rendererRef.current;

		if (camera && renderer) {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		}
	};

	const animate = () => {
		const renderer = rendererRef.current;
		if (renderer) {
			renderer.setAnimationLoop(render);
		}
	};

	const render = (timestamp, frame) => {
		const renderer = rendererRef.current;
		const scene = sceneRef.current;
		const camera = cameraRef.current;
		const reticle = reticleRef.current;
		const hitTestSource = hitTestSourceRef.current;
		const localReferenceSpace = localReferenceSpaceRef.current;

		// calcular delta time (ms)
		const last = lastTimestampRef.current || timestamp;
		const deltaMs = timestamp - last;
		lastTimestampRef.current = timestamp;

		// Atualizar hit-test / reticle
		if (frame && hitTestSource && localReferenceSpace) {
			const hitTestResults = frame.getHitTestResults(hitTestSource);

			if (hitTestResults.length > 0) {
				const hit = hitTestResults[0];
				const pose = hit.getPose(localReferenceSpace);

				// Reticle só aparece no modo admin e se calibrado
				if (reticle) {
					reticle.visible = calibrado && mode === "admin";
					if (reticle.visible) {
						reticle.matrix.fromArray(pose.transform.matrix);
					}
				}
			} else {
				if (reticle) {
					reticle.visible = false;
				}
			}
		}

		// Atualizar animações de flip (se houver)
		if (flipAnimationsRef.current.length > 0) {
			// iterar e atualizar
			const toRemove = [];
			flipAnimationsRef.current.forEach((anim, idx) => {
				anim.elapsed += deltaMs;
				const t = Math.min(anim.elapsed / anim.duration, 1);
				const eased = easeOutQuad(t);
				const newRot = anim.start + (anim.target - anim.start) * eased;
				if (anim.object && anim.object.rotation) {
					anim.object.rotation[anim.axis] = newRot;
				}
				if (t >= 1) {
					toRemove.push(idx);
				}
			});
			// remover do final para não bagunçar índices
			for (let i = toRemove.length - 1; i >= 0; i--) {
				flipAnimationsRef.current.splice(toRemove[i], 1);
			}
		}

		if (renderer && scene && camera) {
			renderer.render(scene, camera);
		}
	};

	const cleanup = () => {
		if (rendererRef.current) {
			rendererRef.current.setAnimationLoop(null);

			if (rendererRef.current.xr.getSession && rendererRef.current.xr.getSession()) {
				rendererRef.current.xr.getSession().end();
			}
		}

		window.removeEventListener("resize", onWindowResize);

		limparObjetosAR();

		if (containerRef.current) {
			containerRef.current.innerHTML = "";
		}
	};

	// Fechar modal de prêmio
	const closePrizeModal = () => {
		setShowPrizeModal(false);
		setCurrentPrize(null);
	};

	return (
		<>
			<div
				ref={containerRef}
				style={{
					position: "fixed",
					top: 0,
					left: 0,
					width: "100%",
					height: "100%",
					zIndex: 1,
				}}
			/>

			{/* Modal de Prêmio Aprimorado */}
			{showPrizeModal && currentPrize && (
				<div 
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						width: "100%",
						height: "100%",
						backgroundColor: "rgba(0, 0, 0, 0.9)",
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						zIndex: 1000,
						padding: "20px"
					}}
				>
					<div 
						style={{
							backgroundColor: "#1e1e1e",
							border: `3px solid ${rarityColors[currentPrize.rarity]}`,
							borderRadius: "20px",
							padding: "35px",
							textAlign: "center",
							maxWidth: "420px",
							width: "100%",
							color: "#fff",
							boxShadow: `0 8px 32px ${rarityColors[currentPrize.rarity]}40`,
							position: "relative",
							overflow: "hidden"
						}}
					>
						{/* Efeito de brilho para prêmios épicos e lendários */}
						{(currentPrize.rarity === "Épico" || currentPrize.rarity === "Lendário") && (
							<div style={{
								position: "absolute",
								top: "-50%",
								left: "-50%",
								width: "200%",
								height: "200%",
								background: `conic-gradient(from 0deg, transparent, ${rarityColors[currentPrize.rarity]}30, transparent)`,
								animation: "rotate 3s linear infinite",
								pointerEvents: "none"
							}} />
						)}
						
						{/* Badge de Raridade */}
						<div style={{
							position: "absolute",
							top: "15px",
							right: "15px",
							backgroundColor: rarityColors[currentPrize.rarity],
							color: "#000",
							padding: "4px 12px",
							borderRadius: "20px",
							fontSize: "12px",
							fontWeight: "bold",
							textTransform: "uppercase",
							zIndex: 1
						}}>
							{currentPrize.rarity}
						</div>
						
						<div style={{ fontSize: "70px", marginBottom: "15px", zIndex: 1, position: "relative" }}>
							🎉
						</div>
						
						<h2 style={{ 
							color: rarityColors[currentPrize.rarity], 
							marginBottom: "15px",
							fontSize: "26px",
							zIndex: 1,
							position: "relative"
						}}>
							{currentPrize.rarity === "Lendário" ? "INCRÍVEL!" : 
							 currentPrize.rarity === "Épico" ? "FANTÁSTICO!" : 
							 currentPrize.rarity === "Raro" ? "PARABÉNS!" : "Você ganhou!"}
						</h2>
						
						<div style={{ 
							fontSize: "50px", 
							marginBottom: "20px",
							zIndex: 1,
							position: "relative"
						}}>
							{currentPrize.icon}
						</div>
						
						<h3 style={{ 
							color: "#fff", 
							marginBottom: "12px",
							fontSize: "22px",
							zIndex: 1,
							position: "relative"
						}}>
							{currentPrize.name}
						</h3>
						
						<p style={{ 
							color: "#a0a0a0", 
							marginBottom: "25px",
							lineHeight: "1.5",
							zIndex: 1,
							position: "relative"
						}}>
							{currentPrize.description}
						</p>

						{/* Informações de probabilidade */}
						<div style={{
							backgroundColor: "rgba(0, 0, 0, 0.3)",
							padding: "10px",
							borderRadius: "8px",
							marginBottom: "25px",
							fontSize: "14px",
							color: "#888",
							zIndex: 1,
							position: "relative"
						}}>
							{currentPrize.rarity === "Lendário" && "Chance: 3% - Extremamente raro! 💎"}
							{currentPrize.rarity === "Épico" && "Chance: 12% - Muito raro! ⭐"}
							{currentPrize.rarity === "Raro" && "Chance: 25% - Raro! 🔮"}
							{currentPrize.rarity === "Comum" && "Chance: 60% - Comum 📋"}
						</div>
						
						<button
							onClick={closePrizeModal}
							style={{
								backgroundColor: rarityColors[currentPrize.rarity],
								color: "#000",
								border: "none",
								padding: "14px 35px",
								borderRadius: "10px",
								fontSize: "16px",
								fontWeight: "bold",
								cursor: "pointer",
								transition: "all 0.3s ease",
								textTransform: "uppercase",
								zIndex: 1,
								position: "relative"
							}}
							onMouseOver={(e) => {
								e.target.style.transform = "scale(1.05)";
								e.target.style.boxShadow = `0 4px 20px ${rarityColors[currentPrize.rarity]}60`;
							}}
							onMouseOut={(e) => {
								e.target.style.transform = "scale(1)";
								e.target.style.boxShadow = "none";
							}}>Resgatar prêmio</button>
						</div>
					</div>
				)
			}
		</>
	)
}

export default ARView
