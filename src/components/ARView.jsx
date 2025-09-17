import { useRef, useEffect } from "react";
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
	
	// Novos refs para interação
	const raycasterRef = useRef(new THREE.Raycaster());
	const pointerRef = useRef(new THREE.Vector2());
	const interactiveObjectsRef = useRef([]);
	const animatingObjectsRef = useRef(new Set());

	useEffect(() => {
		carregarPontosSalvos();

		if (calibrado && containerRef.current) {
			initAR();
		}

		return () => {
			cleanup();
		};
	}, [calibrado]);

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

		// Controller
		const controller = renderer.xr.getController(0);
		controller.addEventListener("select", onSelect);
		controllerRef.current = controller;
		scene.add(controller);

		// Event listeners
		renderer.xr.addEventListener("sessionstart", onSessionStart);
		renderer.xr.addEventListener("sessionend", onSessionEnd);
		window.addEventListener("resize", onWindowResize);
		
		// Adicionar event listeners para interação apenas no modo visitante
		if (mode === "user") {
			container.addEventListener("click", onContainerClick);
			container.addEventListener("touchend", onContainerClick);
		}

		animate();
	};

	// Nova função para lidar com cliques/toques no container
	const onContainerClick = (event) => {
		if (mode !== "user") return;
		if (!cameraRef.current || !sceneRef.current) return;
		if (animatingObjectsRef.current.size > 0) return; // Evita cliques durante animações

		event.preventDefault();

		// Calcular posição normalizada do ponteiro
		const rect = containerRef.current.getBoundingClientRect();
		let clientX, clientY;

		if (event.type === "touchend" && event.changedTouches) {
			clientX = event.changedTouches[0].clientX;
			clientY = event.changedTouches[0].clientY;
		} else {
			clientX = event.clientX;
			clientY = event.clientY;
		}

		pointerRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		pointerRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

		// Raycasting para detectar objetos interativos
		raycasterRef.current.setFromCamera(pointerRef.current, cameraRef.current);
		const intersects = raycasterRef.current.intersectObjects(interactiveObjectsRef.current, true);

		if (intersects.length > 0) {
			const clickedObject = intersects[0].object;
			
			// Encontrar o objeto pai (modelo completo)
			let targetObject = clickedObject;
			while (targetObject.parent && !targetObject.userData.isInteractiveMarker) {
				targetObject = targetObject.parent;
			}

			if (targetObject.userData.isInteractiveMarker) {
				animateFlip(targetObject);
			}
		}
	};

	// Nova função para animar o flip
	const animateFlip = (object) => {
		if (animatingObjectsRef.current.has(object)) return;
		
		animatingObjectsRef.current.add(object);
		
		const originalRotation = object.rotation.y;
		const targetRotation = originalRotation + Math.PI; // Rotação de 180 graus
		const duration = 800; // Duração em ms
		const startTime = performance.now();

		// Função de easing para suavizar a animação
		const easeInOutQuad = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

		const animate = (currentTime) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const easedProgress = easeInOutQuad(progress);

			object.rotation.y = originalRotation + (targetRotation - originalRotation) * easedProgress;

			// Adicionar um pequeno efeito de escala durante a rotação
			const scaleEffect = 1 + Math.sin(progress * Math.PI) * 0.1;
			object.scale.setScalar(0.1 * scaleEffect);

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				// Resetar escala e remover da lista de animação
				object.scale.setScalar(0.1);
				animatingObjectsRef.current.delete(object);
				
				// Feedback visual opcional - brilho temporário
				addGlowEffect(object);
			}
		};

		requestAnimationFrame(animate);
	};

	// Nova função para adicionar efeito de brilho após o flip
	const addGlowEffect = (object) => {
		const originalColor = new THREE.Color();
		const glowColor = new THREE.Color(0xffffff);
		
		object.traverse((child) => {
			if (child.isMesh && child.material) {
				originalColor.copy(child.material.color);
				
				// Animar para branco e voltar
				const glowDuration = 300;
				const startTime = performance.now();
				
				const animateGlow = (currentTime) => {
					const elapsed = currentTime - startTime;
					const progress = Math.min(elapsed / glowDuration, 1);
					
					// Efeito de pulso: 0 -> 1 -> 0
					const intensity = Math.sin(progress * Math.PI);
					
					child.material.color.lerpColors(originalColor, glowColor, intensity * 0.5);
					
					if (progress < 1) {
						requestAnimationFrame(animateGlow);
					} else {
						child.material.color.copy(originalColor);
					}
				};
				
				requestAnimationFrame(animateGlow);
			}
		});
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
	};

	const onSelect = () => {
		if (mode !== "admin") return;
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
						child.material.color = cor;
					}
				});

				sceneRef.current.add(model);

				onCreatePoint(posicaoRelativa);
			},
			undefined,
			(error) => {
				console.error("Erro ao carregar modelo:", error);
				// Fallback para cubo simples
				criarCuboFallback(position, posicaoRelativa);
			}
		);
	};

	const criarCuboFallback = (position, posicaoRelativa) => {
		const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
		const material = new THREE.MeshLambertMaterial({
			color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
		});
		const cube = new THREE.Mesh(geometry, material);
		cube.position.copy(position);
		cube.position.y += 0.05;

		sceneRef.current.add(cube);

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
					isInteractiveMarker: mode === "user" // Marca como interativo apenas no modo visitante
				};

				const cor = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);

				model.traverse((child) => {
					if (child.isMesh) {
						child.material.color = cor;
					}
				});

				sceneRef.current.add(model);
				
				// Adicionar à lista de objetos interativos apenas no modo visitante
				if (mode === "user") {
					interactiveObjectsRef.current.push(model);
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
			isInteractiveMarker: mode === "user"
		};

		sceneRef.current.add(cube);
		
		// Adicionar à lista de objetos interativos apenas no modo visitante
		if (mode === "user") {
			interactiveObjectsRef.current.push(cube);
		}
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
			sceneRef.current.remove(obj);
			if (obj.geometry) obj.geometry.dispose();
			if (obj.material) obj.material.dispose();
		});
		
		// Limpar listas de objetos interativos
		interactiveObjectsRef.current = [];
		animatingObjectsRef.current.clear();
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

		if (renderer && scene && camera) {
			renderer.render(scene, camera);
		}
	};

	const cleanup = () => {
		if (rendererRef.current) {
			rendererRef.current.setAnimationLoop(null);

			if (rendererRef.current.xr.getSession()) {
				rendererRef.current.xr.getSession().end();
			}
		}

		window.removeEventListener("resize", onWindowResize);
		
		// Remover event listeners de interação
		if (containerRef.current) {
			containerRef.current.removeEventListener("click", onContainerClick);
			containerRef.current.removeEventListener("touchend", onContainerClick);
		}

		limparObjetosAR();

		if (containerRef.current) {
			containerRef.current.innerHTML = "";
		}
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
			
			{/* Instrução visual apenas no modo visitante */}
			{mode === "user" && calibrado && (
				<div
					style={{
						position: "fixed",
						bottom: "20px",
						left: "50%",
						transform: "translateX(-50%)",
						background: "rgba(0, 0, 0, 0.8)",
						color: "#4ecdc4",
						padding: "10px 20px",
						borderRadius: "25px",
						fontSize: "14px",
						zIndex: 10,
						border: "1px solid #4ecdc4",
						backdropFilter: "blur(10px)",
						textAlign: "center",
						animation: "pulse 2s infinite",
					}}
				>
					<style>
						{`
							@keyframes pulse {
								0%, 100% { opacity: 0.7; }
								50% { opacity: 1; }
							}
						`}
					</style>
					👆 Toque nos marcadores para vê-los girar!
				</div>
			)}
		</>
	);
}

export default ARView;
