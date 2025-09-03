import { useRef, useEffect } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function ARView({ mode, calibrado, pontoReferencia, pontos, onCreatePoint }) {
	const containerRef = useRef(null);
	const sceneRef = useRef(null);
	const rendererRef = useRef(null);
	const cameraRef = useRef(null);
	const reticleRef = useRef(null);
	const controllerRef = useRef(null);
	const hitTestSourceRef = useRef(null);
	const localReferenceSpaceRef = useRef(null);
	const pontosCarregadosRef = useRef([]);
	const loaderRef = useRef(new GLTFLoader());

	useEffect(() => {
		const posicao = {x:0,y:0,z:0}

		onCreatePoint(posicao)

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

				// Cor aleatória
				const cor = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
				model.traverse((child) => {
					if (child.isMesh) {
						child.material.color = cor;
					}
				});

				sceneRef.current.add(model);

				model.userData = {
					carregado: true,
					dadosOriginais: posicaoRelativa,
				};

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

	const carregarPontosSalvos = () => {
		if (!calibrado || !pontoReferencia) return;

		const pontosDoEvento = pontos.filter(
			(ponto) => ponto.qrReferencia === pontoReferencia.qrCode
		);

		console.log(
			`Carregando ${pontosDoEvento.length} pontos salvos para modo ${mode}...`
		);

		pontosDoEvento.forEach((ponto, index) => {
			const posicaoAbsoluta = new THREE.Vector3(
				ponto.posicaoRelativa.x,
				ponto.posicaoRelativa.y,
				ponto.posicaoRelativa.z
			);

			if (pontoReferencia.arPosition) {
				posicaoAbsoluta.add(pontoReferencia.arPosition);
			}

			criarModeloCarregado(posicaoAbsoluta, ponto, index);
		});
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

				// Cores diferentes para admin vs usuário
				const hue = (index * 0.1) % 1;
				const saturation = mode === "admin" ? 0.5 : 0.7;
				const lightness = mode === "admin" ? 0.4 : 0.6;
				const cor = new THREE.Color().setHSL(hue, saturation, lightness);

				model.traverse((child) => {
					if (child.isMesh) {
						child.material.color = cor;
					}
				});

				sceneRef.current.add(model);
				pontosCarregadosRef.current.push(model);
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
		pontosCarregadosRef.current.push(cube);
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

		pontosCarregadosRef.current = [];
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

		limparObjetosAR();

		if (containerRef.current) {
			containerRef.current.innerHTML = "";
		}
	};

	return (
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
	);
}

export default ARView;
