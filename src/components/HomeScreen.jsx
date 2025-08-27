import { useMemo } from 'react'

function HomeScreen({ pontos, onModeChange }) {
  const stats = useMemo(() => {
    if (!pontos || pontos.length === 0) {
      return {
        totalPontos: 0,
        totalEventos: 0,
        message: 'Nenhum ponto salvo ainda'
      }
    }
    
    const eventos = [...new Set(pontos.map(p => p.qrReferencia))]
    return {
      totalPontos: pontos.length,
      totalEventos: eventos.length,
      message: `📍 ${pontos.length} pontos salvos\n🎪 ${eventos.length} eventos registrados`
    }
  }, [pontos])

  return (
    <div id="home-screen">
      <h1>🎯 Sistema AR</h1>
      <p>
        Sistema de realidade aumentada para navegação em eventos. Escolha seu modo de
        acesso:
      </p>

      <button 
        className="home-btn admin-btn" 
        onClick={() => onModeChange('admin')}
      >
        👨‍💼 Modo Administrador
        <br />
        <small>Criar e gerenciar pontos</small>
      </button>

      <button 
        className="home-btn user-btn" 
        onClick={() => onModeChange('user')}
      >
        👥 Modo Visitante
        <br />
        <small>Visualizar pontos do evento</small>
      </button>

      <div className="home-stats">
        <div id="stored-points-info">
          {stats.message.split('\n').map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HomeScreen