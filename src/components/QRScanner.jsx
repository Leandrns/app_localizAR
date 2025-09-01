import { useRef, useEffect, useState, useCallback } from 'react';
import jsQR from 'jsqr';

function QRScanner({ onQRDetected, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);

  const [statusMessage, setStatusMessage] = useState('🔄 Iniciando câmera...');

  const stopScanning = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    
    const video = videoRef.current;
    if (video && video.srcObject) {
      video.pause();
      const mediaStream = video.srcObject;
      mediaStream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
  }, []);

  const scanLoop = useCallback(() => {
    if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
    }
    
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          onQRDetected(code.data);
          // Não precisamos mais chamar stopScanning aqui, pois o desmonte do componente já fará isso.
          return;
        }
      }
      animationFrameId.current = requestAnimationFrame(tick);
    };

    tick();
  }, [onQRDetected]);

  useEffect(() => {
    const startCamera = async () => {
      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });

        const video = videoRef.current;
        if (video) {
          video.srcObject = mediaStream;
          video.onplaying = () => {
            setStatusMessage('✅ Câmera ativa - procurando QR Code...');
            scanLoop();
          };

          // ===================================================================
          // MUDANÇA PRINCIPAL: Tratamento específico para o AbortError
          // ===================================================================
          try {
            await video.play();
          } catch (error) {
            // Se o erro for um AbortError, é porque o componente foi desmontado
            // rapidamente após uma leitura bem-sucedida. Isso é esperado.
            if (error.name === 'AbortError') {
              console.log('Reprodução do vídeo abortada (comportamento esperado após scan rápido).');
              return; // Simplesmente saímos da função.
            }
            // Se for outro erro, nós o lançamos para o catch principal.
            throw error;
          }
          // ===================================================================
        }
      } catch (error) {
        console.error('Erro ao acessar câmera:', error);
        setStatusMessage('❌ Erro ao acessar a câmera.');
        alert('Não foi possível acessar a câmera. Verifique as permissões e se ela não está em uso por outro app.');
        onCancel();
      }
    };

    startCamera();

    return stopScanning;
  }, [scanLoop, onCancel, stopScanning]);


  const handleCancel = () => {
    stopScanning();
    onCancel();
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <h3>Calibração do Sistema</h3>
      <p>Aponte a câmera para o QR Code do evento.</p>
      <p style={{ minHeight: '24px', fontWeight: 'bold' }}>{statusMessage}</p>
      
      <video 
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline 
        style={{ width: '90%', maxWidth: '400px', borderRadius: '8px', border: '2px solid #00ff00', background: '#000' }} 
      />
      
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      <div style={{marginTop: '20px'}}>
        <button className="btn" onClick={handleCancel}>Cancelar</button>
      </div>
    </div>
  );
}

export default QRScanner;