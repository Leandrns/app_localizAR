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
  }, [pontos])

  return (
    <div id="home-screen">
      <img src="/Logo_semfundo.png" alt='Logo LocalizAR' id='imagem'></img>
      <p>
        Sistema de realidade aumentada para navegação em eventos. <br></br><br></br>
        Escolha seu modo de acesso:
      </p>

      <button 
        className="home-btn admin-btn" 
        onClick={() => onModeChange('admin')}
      >
        <i className="fa-solid fa-fingerprint"></i>  Modo Administrador
        <br />
        <small>Criar e gerenciar pontos</small>
      </button>

      <button 
        className="home-btn user-btn" 
        onClick={() => onModeChange('user')}
      >
        <i className="fa-solid fa-users"></i>  Modo Visitante
        <br />
        <small>Visualizar pontos do evento</small>
      </button>
    </div>
  )
}

export default HomeScreen