import { useRef, useEffect, useState } from 'react'
import jsQR from 'jsqr'

function QRScanner({ onQRDetected, onCancel }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [isScanning, setIsScanning] = useState(false)
  const [stream, setStream] = useState(null)
  const animationRef = useRef(null)
  const [videoReady, setVideoReady] = useState(false)

  useEffect(() => {
    startScanning()
    
    return () => {
      stopScanning()
    }
  }, [])

  const startScanning = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })

      setStream(mediaStream)
      setIsScanning(true)

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        
        // Aguardar o vídeo estar pronto antes de tentar reproduzir
        videoRef.current.onloadedmetadata = async () => {
          console.log('Metadata carregada')
          setVideoReady(true) // Mostrar vídeo assim que metadata carregar
          
          try {
            if (videoRef.current && isScanning) {
              await videoRef.current.play()
              console.log('Vídeo iniciado com sucesso')
              scanQRCode()
            }
          } catch (playError) {
            console.error('Erro ao reproduzir vídeo:', playError)
            // Tentar novamente após um pequeno delay
            setTimeout(async () => {
              try {
                if (videoRef.current && isScanning) {
                  await videoRef.current.play()
                  console.log('Vídeo iniciado na segunda tentativa')
                  scanQRCode()
                }
              } catch (retryError) {
                console.error('Erro na segunda tentativa:', retryError)
              }
            }, 100)
          }
        }

        // Adicionar listeners para debugging
        videoRef.current.oncanplay = () => {
          console.log('Vídeo pode ser reproduzido')
          setVideoReady(true) // Garantir que está visível
        }
        
        videoRef.current.onplaying = () => {
          console.log('Vídeo está reproduzindo')
          setVideoReady(true)
        }
        
        videoRef.current.onerror = (e) => {
          console.error('Erro no vídeo:', e)
        }
      }
    } catch (error) {
      console.error('Erro ao acessar câmera:', error)
      alert('Não foi possível acessar a câmera')
      onCancel()
    }
  }

  const stopScanning = () => {
    setIsScanning(false)
    setVideoReady(false)
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    
    // Pausar vídeo antes de parar o stream
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  const scanQRCode = () => {
    if (!isScanning || !videoRef.current || !canvasRef.current || !videoReady) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    const tick = () => {
      if (!isScanning || !videoReady) return

      try {
        if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
          
          // Tentar detectar QR code
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          })

          if (code) {
            console.log('✅ QR Code detectado:', code.data)
            stopScanning()
            onQRDetected(code.data)
            return
          }
          
          // Log periódico para debugging (a cada 60 frames ~1 segundo)
          if (Math.random() < 0.016) {
            console.log('🔍 Procurando QR Code... Dimensões:', canvas.width, 'x', canvas.height)
          }
        }
      } catch (error) {
        console.error('❌ Erro ao processar frame:', error)
      }

      animationRef.current = requestAnimationFrame(tick)
    }

    console.log('▶️ Iniciando scanner QR Code')
    tick()
  }

  const handleCancel = () => {
    stopScanning()
    onCancel()
  }

  return (
    <div id="qr-scanner" style={{ position: 'relative' }}>
      <div id="qr-instructions">
        <h3>Calibração do Sistema</h3>
        <p>Aponte a câmera para o QR Code do evento.</p>
        <p>Este QR deve estar no ponto de entrada ou referência do local.</p>
        {!videoReady && isScanning && (
          <p style={{color: '#ffa500'}}>🔄 Iniciando câmera...</p>
        )}
        {videoReady && (
          <p style={{color: '#00ff00'}}>✅ Câmera ativa - procurando QR Code...</p>
        )}
        <p style={{fontSize: '14px', opacity: 0.8}}>
          Dica: Mantenha o QR Code bem iluminado e centralizado
        </p>
      </div>
      
      <video 
        ref={videoRef}
        id="qr-video" 
        autoPlay 
        muted 
        playsInline
        style={{ 
          width: '80%', 
          maxWidth: '400px', 
          borderRadius: '8px',
          display: 'block',
          background: '#000',
          border: videoReady ? '2px solid #00ff00' : '2px solid #666'
        }}
      />
      
      {/* Canvas visível para debug - remover depois */}
      <canvas 
        ref={canvasRef}
        style={{ 
          display: 'block',
          width: '200px',
          height: '150px',
          border: '1px solid #333',
          marginTop: '10px',
          opacity: 0.7
        }}
      />
      <p style={{fontSize: '12px', color: '#999'}}>
        ↑ Preview do que a câmera está vendo (debug)
      </p>
      
      <div style={{marginTop: '10px'}}>
        <button 
          id="cancel-qr" 
          className="btn" 
          onClick={handleCancel}
        >
          Cancelar
        </button>
        
        <button 
          className="btn" 
          onClick={() => {
            console.log('🔧 Debug Info:')
            console.log('- isScanning:', isScanning)
            console.log('- videoReady:', videoReady)
            console.log('- video readyState:', videoRef.current?.readyState)
            console.log('- video dimensions:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight)
          }}
          style={{marginLeft: '10px', background: '#17a2b8'}}
        >
          Debug Info
        </button>
      </div>
    </div>
  )
}

export default QRScanner