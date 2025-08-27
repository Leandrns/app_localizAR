import { useRef, useEffect, useState } from 'react'
import jsQR from 'jsqr'

function QRScanner({ onQRDetected, onCancel }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [isScanning, setIsScanning] = useState(false)
  const [stream, setStream] = useState(null)
  const animationRef = useRef(null)

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
        videoRef.current.play()
        videoRef.current.onloadedmetadata = () => {
          scanQRCode()
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
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  const scanQRCode = () => {
    if (!isScanning || !videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    const tick = () => {
      if (!isScanning) return

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)

        if (code) {
          console.log('QR Code detectado:', code.data)
          stopScanning()
          onQRDetected(code.data)
          return
        }
      }

      animationRef.current = requestAnimationFrame(tick)
    }

    tick()
  }

  const handleCancel = () => {
    stopScanning()
    onCancel()
  }

  return (
    <div id="qr-scanner">
      <div id="qr-instructions">
        <h3>Calibração do Sistema</h3>
        <p>Aponte a câmera para o QR Code do evento.</p>
        <p>Este QR deve estar no ponto de entrada ou referência do local.</p>
      </div>
      
      <video 
        ref={videoRef}
        id="qr-video" 
        autoPlay 
        muted 
        playsInline
        style={{ width: '80%', maxWidth: '400px', borderRadius: '8px' }}
      />
      
      <canvas 
        ref={canvasRef}
        style={{ display: 'none' }}
      />
      
      <button 
        id="cancel-qr" 
        className="btn" 
        onClick={handleCancel}
      >
        Cancelar
      </button>
    </div>
  )
}

export default QRScanner