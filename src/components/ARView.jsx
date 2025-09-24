import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { supabase } from '../supabaseClient';

function ARView({ mode, calibrado, pontoReferencia, pontos, onCreatePoint, filtroAtivo }) {
	
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

	const [showNameModal, setShowNameModal] = useState(false);
	const [pendingPoint, setPendingPoint] = useState(null);
	const [pointName, setPointName] = useState('');

	useEffect(() => {
		if (calibrado && containerRef.current) {
			initAR();
		}

		return () => {
			cleanup();
		};
	}, [calibrado, mode]);

	// ✅ useEffect para recarregar pontos quando filtro mudar (só no modo user)
	useEffect(() => {
		if (mode === "user" && calibrado && pontoReferencia && sceneRef.current) {
			console.log(`🔄 Aplicando filtro: ${filtroAtivo || 'todos'}`);
			// ✅ Delay para garantir que a sessão AR esteja ativa
			setTimeout(() => {
				carregarPontosSalvos();
			}, 500);
		}
	}, [filtroAtivo, mode, calibrado, pontoReferencia]);

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

		// Controller - diferentes ações para admin e visitante
		const controller = renderer.xr.getController(0);
		controller.addEventListener("select", onSelect);
		controllerRef.current = controller;
		scene.add(controller);

		// ✅ Event listener para toques na tela (modo visitante)
		if (mode === "user") {
			const handleTouchStart = (event) => onTouchStart(event);
			renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false });
			renderer.domElement.addEventListener('click', handleTouchStart, { passive: false });
			
			// ✅ Armazenar referência para cleanup
			renderer.domElement._touchHandler = handleTouchStart;
		}

		// Event listeners
		renderer.xr.addEventListener("sessionstart", onSessionStart);
		renderer.xr.addEventListener("sessionend", onSessionEnd);
		window.addEventListener("resize", onWindowResize);

		animate();
	};

	const onSessionStart = () => {
		console.log("🚀 Sessão AR iniciada");
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
			console.log("📍 Reference space local obtido");

			if (calibrado && pontoReferencia) {
				if (!pontoReferencia.arPosition) {
					pontoReferencia.arPosition = new THREE.Vector3(0, 0, 0);
				}

				// ✅ Carregar pontos salvos com delay maior para garantir estabilidade
				console.log(`⏱️ Carregando pontos em 2 segundos para modo: ${mode}`);
				setTimeout(() => {
					carregarPontosSalvos();
				}, 2000);
			}
		});
	};

	const onSessionEnd = () => {
		console.log("🛑 Sessão AR finalizada");
		hitTestSourceRef.current = null;
		localReferenceSpaceRef.current = null;
		if (reticleRef.current) {
			reticleRef.current.visible = false;
		}
		limparObjetosAR();
		flipAnimationsRef.current = [];
		lastTimestampRef.current = 0;
		selectableObjectsRef.current = [];
		
		// ✅ Remover event listeners usando referência armazenada
		const renderer = rendererRef.current;
		if (renderer && renderer.domElement && renderer.domElement._touchHandler) {
			renderer.domElement.removeEventListener('touchstart', renderer.domElement._touchHandler, { passive: false });
			renderer.domElement.removeEventListener('click', renderer.domElement._touchHandler, { passive: false });
			delete renderer.domElement._touchHandler;
		}
	};

	// ✅ Handler para toques na tela (modo visitante) 
	const onTouchStart = (event) => {
		if (mode !== "user" || showNameModal) return;
		
		event.preventDefault();
		
		// Pegar coordenadas do toque
		let clientX, clientY;
		if (event.type === 'touchstart' && event.touches && event.touches.length > 0) {
			clientX = event.touches[0].clientX;
			clientY = event.touches[0].clientY;
		} else if (event.type === 'click') {
			clientX = event.clientX;
			clientY = event.clientY;
		} else {
			return; // Evento inválido
		}
		
		// Converter para coordenadas normalizadas (-1 a 1)
		const mouse = new THREE.Vector2();
		mouse.x = (clientX / window.innerWidth) * 2 - 1;
		mouse.y = -(clientY / window.innerHeight) * 2 + 1;
		
		// Fazer raycast
		const raycaster = raycasterRef.current;
		const camera = cameraRef.current;
		
		if (raycaster && camera && selectableObjectsRef.current.length > 0) {
			raycaster.setFromCamera(mouse, camera);
			const intersects = raycaster.intersectObjects(selectableObjectsRef.current, true);
			
			if (intersects.length > 0) {
				// ✅ Encontrou objeto - fazer girar
				let targetObject = intersects[0].object;
				
				// Se clicou em um child, pegar o parent (modelo GLTF)
				while (targetObject.parent && !targetObject.userData.carregado && targetObject.parent !== sceneRef.current) {
					targetObject = targetObject.parent;
				}
				
				if (targetObject.userData.carregado) {
					console.log(`🎯 Clicou no ponto: ${targetObject.userData.dadosOriginais.nome || 'Sem nome'}`);
					startFlipAnimation(targetObject, { axis: "y", degree: Math.PI * 2, duration: 800 });
				}
			}
		}
	};

	// Handler para select (criar ponto no admin)
	const onSelect = () => {
		if (mode !== "admin") return;
		if (!calibrado) {
			alert("Faça a calibração primeiro!");
			return;
		}
		if (!reticleRef.current || !reticleRef.current.visible) return;

		const position = new THREE.Vector3();
		position.setFromMatrixPosition(reticleRef.current.matrix);
		const posicaoRelativa = calcularPosicaoRelativa(position);

		// Solicitar nome imediatamente
		const nomeDoPonto = prompt("Digite o nome do marcador:");
		if (!nomeDoPonto || !nomeDoPonto.trim()) return;

		// Criar modelo 3D com nome
		loaderRef.current.load(
			"/map_pointer_3d_icon.glb",
			(gltf) => {
				const model = gltf.scene;
				model.position.copy(position);
				model.position.y += 1;
				model.scale.set(0.1, 0.1, 0.1);

				model.userData = {
					carregado: true,
					dadosOriginais: { ...posicaoRelativa, nome: nomeDoPonto.trim() },
					nome: nomeDoPonto.trim()
				};

				const cor = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
				model.traverse((child) => {
					if (child.isMesh) {
						if (child.material) child.material = child.material.clone();
						child.material.color = cor;
					}
				});

				sceneRef.current.add(model);
				selectableObjectsRef.current.push(model);

				// Salvar no Supabase
				if (onCreatePoint) {
					onCreatePoint({ ...posicaoRelativa, nome: nomeDoPonto.trim() });
				}
			},
			undefined,
			(error) => {
				console.error("Erro ao carregar modelo:", error);
			}
		);
	};

	// ✅ Função de animação de rotação corrigida
	const startFlipAnimation = (object3D, { axis = "y", degree = Math.PI * 2, duration = 800 } = {}) => {
		if (!object3D || !object3D.rotation) {
			console.log("❌ Objeto inválido para animação");
			return;
		}
		
		// ✅ Verificar se já está animando este objeto
		const existingAnim = flipAnimationsRef.current.find(anim => anim.object === object3D);
		if (existingAnim) {
			console.log("⚠️ Objeto já está animando, ignorando...");
			return;
		}
		
		const start = object3D.rotation[axis];
		const target = start + degree;
		
		console.log(`🔄 Iniciando animação: ${axis} de ${start.toFixed(2)} para ${target.toFixed(2)}`);
		
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

	// ✅ Função para buscar pontos no Supabase - CORRIGIDA
	const carregarPontosSalvos = async () => {
		if (!calibrado || !pontoReferencia) {
			console.log("❌ Não calibrado ou sem ponto de referência");
			return;
		}

		console.log(`🔍 Carregando pontos para QR: ${pontoReferencia.qrCode}, Filtro: ${filtroAtivo || 'todos'}`);

		try {
			// ✅ Aplicar filtro se selecionado
			let query = supabase
				.from("pontos")
				.select("*")
				.eq("qr_referencia", pontoReferencia.qrCode);

			if (filtroAtivo && filtroAtivo !== 'todos') {
				query = query.eq("nome", filtroAtivo);
			}

			const { data, error } = await query;

			if (error) {
				console.error("❌ Erro ao carregar pontos do Supabase:", error.message);
				return;
			}

			if (!data || data.length === 0) {
				console.log("📭 Nenhum ponto encontrado no banco");
				return;
			}

			// ✅ Limpar pontos anteriores antes de carregar novos
			limparObjetosAR();

			console.log(`📍 Carregando ${data.length} pontos ${filtroAtivo === 'todos' ? '' : 'filtrados '}do banco para modo ${mode}...`);

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
			console.error("❌ Erro inesperado ao buscar pontos:", err);
		}
	};

	const criarModeloCarregado = (posicao, dadosPonto, index) => {
		console.log(`🎨 Criando modelo para: ${dadosPonto.nome || 'Sem nome'}`);
		
		loaderRef.current.load(
			"/map_pointer_3d_icon.glb",
			(gltf) => {
				const model = gltf.scene.clone(); // ✅ Clone para evitar conflitos
				model.position.copy(posicao);
				model.position.y += 1;
				model.scale.set(0.1, 0.1, 0.1);

				model.userData = {
					carregado: true,
					dadosOriginais: dadosPonto,
					nome: dadosPonto.nome || 'Sem nome'
				};

				// ✅ Cores mais distintas
				const hue = (index * 0.15) % 1;
				const cor = new THREE.Color().setHSL(hue, 0.8, 0.6);

				model.traverse((child) => {
					if (child.isMesh) {
						if (child.material) {
							child.material = child.material.clone();
							child.material.color = cor;
						}
					}
				});

				sceneRef.current.add(model);
				// ✅ Adicionar ao array de selecionáveis
				selectableObjectsRef.current.push(model);
				
				console.log(`✅ Modelo criado para: ${dadosPonto.nome} - Total objetos: ${selectableObjectsRef.current.length}`);
			},
			undefined,
			(error) => {
				console.error("❌ Erro ao carregar modelo:", error);
				// Fallback para cubo
				criarCuboCarregado(posicao, dadosPonto, index);
			}
		);
	};

	const criarCuboCarregado = (posicao, dadosPonto, index) => {
		console.log(`📦 Criando cubo fallback para: ${dadosPonto.nome || 'Sem nome'}`);
		
		const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
		const hue = (index * 0.15) % 1;
		const cor = new THREE.Color().setHSL(hue, 0.8, 0.6);

		const material = new THREE.MeshLambertMaterial({ color: cor });
		const cube = new THREE.Mesh(geometry, material);
		cube.position.copy(posicao);
		cube.position.y += 0.05;

		cube.userData = {
			carregado: true,
			dadosOriginais: dadosPonto,
			nome: dadosPonto.nome || 'Sem nome'
		};

		sceneRef.current.add(cube);
		selectableObjectsRef.current.push(cube);
		
		console.log(`✅ Cubo criado para: ${dadosPonto.nome} - Total objetos: ${selectableObjectsRef.current.length}`);
	};

	const calcularPosicaoRelativa = (posicaoAR) => {
		if (!pontoReferencia || !pontoReferencia.arPosition) {
			return posicaoAR.clone();
		}
		return posicaoAR.clone().sub(pontoReferencia.arPosition);
	};

	const limparObjetosAR = () => {
		if (!sceneRef.current) return;

		console.log("🧹 Limpando objetos AR...");

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
		
		console.log(`✅ ${objetosParaRemover.length} objetos removidos`);
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

		// ✅ Atualizar animações de flip - CORRIGIDO
		if (flipAnimationsRef.current.length > 0) {
			const toRemove = [];
			flipAnimationsRef.current.forEach((anim, idx) => {
				if (!anim.object || !anim.object.rotation) {
					toRemove.push(idx);
					return;
				}
				
				anim.elapsed += deltaMs;
				const t = Math.min(anim.elapsed / anim.duration, 1);
				const eased = easeOutQuad(t);
				const newRot = anim.start + (anim.target - anim.start) * eased;
				
				anim.object.rotation[anim.axis] = newRot;
				
				if (t >= 1) {
					console.log(`✅ Animação concluída para objeto: ${anim.object.userData.nome || 'Sem nome'}`);
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
		console.log("🧹 Fazendo cleanup do ARView");
		
		if (rendererRef.current) {
			rendererRef.current.setAnimationLoop(null);

			if (rendererRef.current.xr.getSession && rendererRef.current.xr.getSession()) {
				rendererRef.current.xr.getSession().end();
			}
		}

		window.removeEventListener("resize", onWindowResize);

		// ✅ Remover event listeners usando referência armazenada
		if (rendererRef.current && rendererRef.current.domElement && rendererRef.current.domElement._touchHandler) {
			rendererRef.current.domElement.removeEventListener('touchstart', rendererRef.current.domElement._touchHandler, { passive: false });
			rendererRef.current.domElement.removeEventListener('click', rendererRef.current.domElement._touchHandler, { passive: false });
			delete rendererRef.current.domElement._touchHandler;
		}

		limparObjetosAR();

		if (containerRef.current) {
			containerRef.current.innerHTML = "";
		}
	};

	// ✅ Reset completo do modal
	const handleCreateNamedPoint = () => {
		if (!pointName.trim() || !pendingPoint) return;

		const { position, posicaoRelativa } = pendingPoint;

		// Carregar modelo 3D (mesmo código existente, mas com nome)
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
					nome: pointName.trim()
				};

				const cor = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
				model.traverse((child) => {
					if (child.isMesh) {
						if (child.material) child.material = child.material.clone();
						child.material.color = cor;
					}
				});

				sceneRef.current.add(model);

				// ✅ Passar nome junto
				if (onCreatePoint) {
					onCreatePoint({...posicaoRelativa, nome: pointName.trim()});
				}
			},
			undefined,
			(error) => {
				console.error("Erro ao carregar modelo:", error);
				criarCuboFallback(position, posicaoRelativa);
			}
		);

		// ✅ Reset completo do modal
		resetModal();
	};

	// ✅ Função para resetar modal completamente
	const resetModal = () => {
		setShowNameModal(false);
		setPendingPoint(null);
		setPointName('');
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
			
			{/* ✅ Modal para nome do ponto */}
			{showNameModal && (
				<div style={{
					position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
					background: 'rgba(0,0,0,0.8)', display: 'flex',
					alignItems: 'center', justifyContent: 'center', zIndex: 1000
				}}>
					<div style={{
						background: '#1a1a1a', padding: '25px', borderRadius: '15px',
						border: '2px solid #05d545', maxWidth: '400px', width: '90%'
					}}>
						<h3 style={{color: '#05d545', marginBottom: '15px', textAlign: 'center'}}>
							🏷️ Nome do Ponto
						</h3>
						<input 
							type="text"
							value={pointName}
							onChange={(e) => setPointName(e.target.value)}
							placeholder="Ex: Entrada Principal, Food Court..."
							style={{
								width: '100%', padding: '12px', marginBottom: '15px',
								background: 'rgba(255,255,255,0.1)', border: '2px solid #333',
								borderRadius: '8px', color: '#fff', fontSize: '16px',
								fontFamily: 'Lexend'
							}}
							autoFocus
							onKeyPress={(e) => e.key === 'Enter' && handleCreateNamedPoint()}
						/>
						<div style={{display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
							<button onClick={resetModal} 
									style={{padding: '10px 20px', background: '#666', 
										   border: 'none', borderRadius: '8px', color: '#fff',
										   cursor: 'pointer', fontFamily: 'Lexend'}}>
								Cancelar
							</button>
							<button onClick={handleCreateNamedPoint}
									disabled={!pointName.trim()}
									style={{
										padding: '10px 20px', 
										background: pointName.trim() ? '#05d545' : '#333',
										border: 'none', borderRadius: '8px', 
										color: pointName.trim() ? '#000' : '#666',
										fontWeight: 'bold', cursor: pointName.trim() ? 'pointer' : 'not-allowed',
										fontFamily: 'Lexend'
									}}>
								Criar Ponto
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

export default ARView;