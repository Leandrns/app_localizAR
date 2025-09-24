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
	
	// Refs para o sistema de prêmios 3D
	const clickCounterRef = useRef(new Map()); // Map para contar cliques por objeto
	const prizeDisplayRef = useRef(null); // Painel 3D do prêmio
	const prizeAnimationRef = useRef(null); // Animação do painel
	const fontLoaderRef = useRef(null);

	// Lista de prêmios possíveis
	const prizes = [
		{ name: "Desconto de 10%", description: "10% de desconto na proxima compra", emoji: "🎟️" },
		{ name: "Brinde Especial", description: "Ganhe um brinde exclusivo do evento", emoji: "🎁" },
		{ name: "Entrada VIP", description: "Acesso VIP para a proxima area", emoji: "⭐" },
		{ name: "Drink Gratis", description: "Uma bebida cortesia no bar", emoji: "🍹" },
		{ name: "Foto Premium", description: "Sessao de fotos profissional gratuita", emoji: "📸" },
		{ name: "Sorteio Duplo", description: "Participe do sorteio com chance dupla", emoji: "🍀" },
		{ name: "Acesso Backstage", description: "Visite o backstage do evento", emoji: "🎭" },
		{ name: "Mesa Reservada", description: "Mesa reservada na area premium", emoji: "🪑" },
		{ name: "Kit Exclusivo", description: "Kit de produtos exclusivos", emoji: "📦" },
		{ name: "Experiencia Plus", description: "Upgrade para experiencia premium", emoji: "✨" }
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
		// Limpar contador de cliques e painel de prêmio
		clickCounterRef.current.clear();
		if (prizeDisplayRef.current) {
			sceneRef.current.remove(prizeDisplayRef.current);
			prizeDisplayRef.current = null;
		}
		prizeAnimationRef.current = null;
	};

	// Função para gerar prêmio aleatório
	const generateRandomPrize = () => {
		const randomIndex = Math.floor(Math.random() * prizes.length);
		return prizes[randomIndex];
	};

	// Criar painel 3D de prêmio
	const create3DPrizePanel = (prize) => {
		const group = new THREE.Group();

		// Painel de fundo
		const panelGeometry = new THREE.PlaneGeometry(2, 1.2);
		const panelMaterial = new THREE.MeshBasicMaterial({
			color: 0x1e1e1e,
			transparent: true,
			opacity: 0.9
		});
		const panel = new THREE.Mesh(panelGeometry, panelMaterial);
		group.add(panel);

		// Borda do painel
		const borderGeometry = new THREE.RingGeometry(0.95, 1, 32);
		const borderMaterial = new THREE.MeshBasicMaterial({
			color: 0x4ecdc4,
			transparent: true,
			opacity: 0.8
		});
		const border = new THREE.Mesh(borderGeometry, borderMaterial);
		border.position.z = 0.01;
		group.add(border);

		// Canvas para texto
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');
		canvas.width = 512;
		canvas.height = 256;

		// Fundo do canvas
		context.fillStyle = 'rgba(30, 30, 30, 0)';
		context.fillRect(0, 0, canvas.width, canvas.height);

		// Emoji de celebração
		context.font = '48px Arial';
		context.textAlign = 'center';
		context.fillText('🎉', canvas.width/2, 50);

		// Título "Parabéns!"
		context.font = 'bold 32px Arial';
		context.fillStyle = '#4ecdc4';
		context.fillText('Parabéns!', canvas.width/2, 90);

		// Emoji do prêmio
		context.font = '40px Arial';
		context.fillText(prize.emoji, canvas.width/2, 130);

		// Nome do prêmio
		context.font = 'bold 24px Arial';
		context.fillStyle = '#ffffff';
		context.fillText(prize.name, canvas.width/2, 160);

		// Descrição do prêmio (quebrar texto se necessário)
		context.font = '16px Arial';
		context.fillStyle = '#a0a0a0';
		
		const words = prize.description.split(' ');
		let line = '';
		let lines = [];
		
		for (let n = 0; n < words.length; n++) {
			const testLine = line + words[n] + ' ';
			const metrics = context.measureText(testLine);
			if (metrics.width > 400 && n > 0) {
				lines.push(line);
				line = words[n] + ' ';
			} else {
				line = testLine;
			}
		}
		lines.push(line);

		for (let i = 0; i < lines.length; i++) {
			context.fillText(lines[i], canvas.width/2, 190 + (i * 20));
		}

		// Instrução
		context.font = '12px Arial';
		context.fillStyle = '#666666';
		context.fillText('Mostre esta tela no balcão', canvas.width/2, 240);

		// Criar textura do canvas
		const texture = new THREE.CanvasTexture(canvas);
		texture.needsUpdate = true;

		// Material do texto
		const textMaterial = new THREE.MeshBasicMaterial({
			map: texture,
			transparent: true,
			alphaTest: 0.1
		});

		// Mesh do texto
		const textGeometry = new THREE.PlaneGeometry(2, 1);
		const textMesh = new THREE.Mesh(textGeometry, textMaterial);
		textMesh.position.z = 0.02;
		group.add(textMesh);

		// Posicionar o painel na frente da câmera
		const camera = cameraRef.current;
		if (camera) {
			group.position.copy(camera.position);
			group.position.add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1.5));
			group.position.y += 0.5;
			group.lookAt(camera.position);
		}

		// Iniciar invisível para animação
		group.scale.set(0, 0, 0);

		return group;
	};

	// Animar aparição do painel
	const animatePrizePanel = (panel) => {
		const startTime = Date.now();
		const duration = 800;

		const animate = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			
			// Easing out bounce
			const easeOutBounce = (t) => {
				if (t < (1 / 2.75)) {
					return 7.5625 * t * t;
				} else if (t < (2 / 2.75)) {
					return 7.5625 * (t -= (1.5 / 2.75)) * t + 0.75;
				} else if (t < (2.5 / 2.75)) {
					return 7.5625 * (t -= (2.25 / 2.75)) * t + 0.9375;
				} else {
					return 7.5625 * (t -= (2.625 / 2.75)) * t + 0.984375;
				}
			};

			const scale = easeOutBounce(progress);
			panel.scale.set(scale, scale, scale);

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		animate();
	};

	// Remover painel após delay
	const removePrizePanel = () => {
		if (prizeDisplayRef.current && sceneRef.current) {
			// Animação de saída
			const startTime = Date.now();
			const duration = 500;
			const initialScale = 1;

			const animate = () => {
				const elapsed = Date.now() - startTime;
				const progress = Math.min(elapsed / duration, 1);
				
				const scale = initialScale * (1 - progress);
				if (prizeDisplayRef.current) {
					prizeDisplayRef.current.scale.set(scale, scale, scale);
				}

				if (progress >= 1) {
					if (prizeDisplayRef.current) {
						sceneRef.current.remove(prizeDisplayRef.current);
						prizeDisplayRef.current = null;
					}
				} else {
					requestAnimationFrame(animate);
				}
			};

			animate();
		}
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
					
					// Remover painel anterior se existir
					if (prizeDisplayRef.current) {
						sceneRef.current.remove(prizeDisplayRef.current);
					}
					
					// Criar e mostrar painel 3D após delay da animação
					setTimeout(() => {
						const panel = create3DPrizePanel(prize);
						prizeDisplayRef.current = panel;
						sceneRef.current.add(panel);
						animatePrizePanel(panel);

						// Auto-remover após 5 segundos
						setTimeout(() => {
							removePrizePanel();
						}, 5000);
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

		// Atualizar posição do painel de prêmio para sempre ficar na frente da câmera
		if (prizeDisplayRef.current && camera) {
			const panel = prizeDisplayRef.current;
			// Manter distância fixa da câmera
			const cameraDirection = new THREE.Vector3();
			camera.getWorldDirection(cameraDirection);
			
			const newPosition = camera.position.clone();
			newPosition.add(cameraDirection.multiplyScalar(-1.5));
			newPosition.y += 0.3;
			
			panel.position.copy(newPosition);
			panel.lookAt(camera.position);
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
		/>
	);
}

export default ARView;
