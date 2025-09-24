import { useRef, useEffect } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { supabase } from '../supabaseClient'

function ARView({ mode, calibrado, pontoReferencia, pontos, onCreatePoint, filtroMarcador, marcadoresDisponiveis, setFiltroAtivo }) {
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
	const todosObjetosRef = useRef([]);

	useEffect(() => {
		if (calibrado && containerRef.current) {
			initAR();
		}

		return () => {
			cleanup();
		};
	}, [calibrado, mode]);


	useEffect(() => {
		if (!todosObjetosRef.current) return;

		todosObjetosRef.current.forEach((obj) => {
			if (filtroMarcador) {
				const shouldShow = obj.userData?.dadosOriginais?.id === filtroMarcador.id;
				obj.visible = shouldShow;
				destacarObjeto(obj, shouldShow);
			} else {
				obj.visible = true;
				destacarObjeto(obj, false);
			}
		});
		aplicarFiltroVisualizacao();
	}, [filtroMarcador]);


	const aplicarFiltroVisualizacao = () => {
		todosObjetosRef.current.forEach((obj) => {
			if (filtroMarcador) {
				// Se há filtro ativo, mostra apenas o objeto correspondente
				const shouldShow = obj.userData?.dadosOriginais?.id === filtroMarcador.id;
				obj.visible = shouldShow;
				destacarObjeto(obj, shouldShow);

			} else {
				// Se não há filtro, mostra todos os objetos
				obj.visible = true;
				destacarObjeto(obj, false);
			}
		});

	};

	// NOVA FUNÇÃO: Destaca/remove destaque de um objeto
	const destacarObjeto = (objeto, destacar) => {
		objeto.traverse((child) => {
			if (child.isMesh && child.material) {
				if (destacar) {
					// Aplica cor de destaque (amarelo/dourado)
					child.material.color.setHex(0xffdd44);
					child.material.emissive.setHex(0x442200);
				} else {
					// Restaura cor original (se havia uma cor armazenada)
					if (child.userData?.corOriginal) {
						child.material.color.copy(child.userData.corOriginal);
						child.material.emissive.setHex(0x000000);
					}
				}
			}
		});
	};

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

				// Limpar objetos antigos antes de carregar
				setTimeout(() => {
					limparObjetosAR();
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
		todosObjetosRef.current = [];
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

				// Iniciar animação de flip (rotaciona em X)
				startFlipAnimation(root, { axis: "y", degree: (2 * Math.PI), duration: 600 });
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

			setTimeout(() => {
				aplicarFiltroVisualizacao();
			}, 500);


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
					dadosOriginais: {
						id: dadosPonto.id,
						nome: dadosPonto.nome,
						pos_x: dadosPonto.pos_x,
						pos_y: dadosPonto.pos_y,
						pos_z: dadosPonto.pos_z
					}
				};

				const cor = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);

				model.traverse((child) => {
					if (child.isMesh) {
						if (child.material) child.material = child.material.clone();
						child.material.color = cor;
						child.userData = { corOriginal: cor.clone() };
					}
				});

				sceneRef.current.add(model);
				// adiciona ao array de selecionáveis
				selectableObjectsRef.current.push(model);
				if (!todosObjetosRef.current.includes(model)) {
					todosObjetosRef.current.push(model);
				}
				if (filtroMarcador) {
					const shouldShow = model.userData?.dadosOriginais?.id === filtroMarcador.id;
					model.visible = shouldShow;
					destacarObjeto(model, shouldShow);
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

		if (!todosObjetosRef.current.includes(cube)) {
			todosObjetosRef.current.push(cube);
		}
		if (filtroMarcador) {
			const shouldShow = cube.userData?.dadosOriginais?.id === filtroMarcador.id;
			cube.visible = shouldShow;
			destacarObjeto(cube, shouldShow);
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
		>
			{mode === "user" && marcadoresDisponiveis?.length > 0 && (
				<div className="filtro-overlay" style={{
					position: "absolute",
					top: "10px",
					left: "10px",
					zIndex: 10,
					background: "rgba(0,0,0,0.5)",
					padding: "8px",
					borderRadius: "8px"
				}}>
					<button onClick={() => setFiltroAtivo(null)}>
						Mostrar todos
					</button>
					{marcadoresDisponiveis.map((m) => (
						<button
							key={m.id}
							className={filtroMarcador?.id === m.id ? "ativo" : ""}
							onClick={() => setFiltroAtivo(m)}
						>
							{m.nome}
						</button>
					))}
				</div>
			)}
		</div>
	);
}


export default ARView;
