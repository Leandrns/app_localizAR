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

	// Lista de prêmios possíveis
	const prizes = [
		{ name: "Desconto de 10%", description: "10% de desconto na próxima compra", icon: "🎟️" },
		{ name: "Brinde Especial", description: "Ganhe um brinde exclusivo do evento", icon: "🎁" },
		{ name: "Entrada VIP", description: "Acesso VIP para a próxima área", icon: "⭐" },
		{ name: "Drink Grátis", description: "Uma bebida cortesia no bar", icon: "🍹" },
		{ name: "Foto Premium", description: "Sessão de fotos profissional gratuita", icon: "📸" },
		{ name: "Sorteio Duplo", description: "Participe do sorteio com chance dupla", icon: "🍀" },
		{ name: "Acesso Backstage", description: "Visite o backstage do evento", icon: "🎭" },
		{ name: "Mesa Reservada", description: "Mesa reservada na área premium", icon: "🪑" },
		{ name: "Kit Exclusivo", description: "Kit de produtos exclusivos", icon: "📦" },
		{ name: "Experiência Plus", description: "Upgrade para experiência premium", icon: "✨" }
	];

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

	// Função para gerar prêmio aleatório
	const generateRandomPrize = () => {
		const randomIndex = Math.floor(Math.random() * prizes.length);
		return prizes[randomIndex];
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
					// Resetar contador para este objeto
					clickCounterRef.current.set(objectId, 0);
					
					// Gerar prêmio aleatório
					const prize = generateRandomPrize();
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
				selectableObjectsRef.current.push(model);
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

			{/* Modal de Prêmio */}
			{showPrizeModal && currentPrize && (
				<div 
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						width: "100%",
						height: "100%",
						backgroundColor: "rgba(0, 0, 0, 0.8)",
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
							border: "2px solid #4ecdc4",
							borderRadius: "16px",
							padding: "30px",
							textAlign: "center",
							maxWidth: "400px",
							width: "100%",
							color: "#fff",
							boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)"
						}}
					>
						<div style={{ fontSize: "60px", marginBottom: "15px" }}>
							🎉
						</div>
						
						<h2 style={{ 
							color: "#4ecdc4", 
							marginBottom: "10px",
							fontSize: "24px"
						}}>
							Parabéns!
						</h2>
						
						<div style={{ 
							fontSize: "40px", 
							marginBottom: "15px" 
						}}>
							{currentPrize.icon}
						</div>
						
						<h3 style={{ 
							color: "#fff", 
							marginBottom: "10px",
							fontSize: "20px"
						}}>
							{currentPrize.name}
						</h3>
						
						<p style={{ 
							color: "#a0a0a0", 
							marginBottom: "25px",
							lineHeight: "1.4"
						}}>
							{currentPrize.description}
						</p>
						
						<button
							onClick={closePrizeModal}
							style={{
								backgroundColor: "#4ecdc4",
								color: "#1e1e1e",
								border: "none",
								padding: "12px 30px",
								borderRadius: "8px",
								fontSize: "16px",
								fontWeight: "bold",
								cursor: "pointer",
								transition: "all 0.2s ease"
							}}
							onMouseOver={(e) => {
								e.target.style.backgroundColor = "#45b7aa";
								e.target.style.transform = "scale(1.05)";
							}}
							onMouseOut={(e) => {
								e.target.style.backgroundColor = "#4ecdc4";
								e.target.style.transform = "scale(1)";
							}}
						>
							Resgatar Prêmio
						</button>
						
						<p style={{ 
							fontSize: "12px", 
							color: "#666", 
							marginTop: "15px",
							marginBottom: "0"
						}}>
							Mostre esta tela no balcão de atendimento
						</p>
					</div>
				</div>
			)}
		</>
	);
}

export default ARView;
