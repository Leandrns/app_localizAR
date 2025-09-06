![alt text](/public/Logo_horizontal_sem_fundo-Photoroom.png)

**Versão:** 1.0.0  
**Status:** Em desenvolvimento ativo

![WebXR](https://img.shields.io/badge/WebXR-Enabled-brightgreen)
![React](https://img.shields.io/badge/React-19.1.1-blue)
![Three.js](https://img.shields.io/badge/Three.js-0.179.1-orange)
![Vite](https://img.shields.io/badge/Vite-7.1.2-purple)

> **Projeto de Iniciação Científica - FIAP 2025**
> 
> **Desenvolvedores:**
> 
> - [Caio Alexandre dos Santos](https://www.linkedin.com/in/caio-alexandre-b778aa221) - RM: 558460
> - [Leandro do Nascimento Souza](www.linkedin.com/in/leandro-souza-326722181) - RM: 558893
> - [Rafael de Mônaco Maniezo](https://www.linkedin.com/in/rafaelmmaniezo) - RM: 556079
> 
> **Professor Orientador:**
> [Lucas Silva Borges de Sousa](https://www.linkedin.com/in/lucasss-professor)


---

## 📋 Sobre o Projeto

**LocalizAR** é um sistema inovador de **Realidade Aumentada (AR)** para navegação em eventos e espaços físicos. Através da tecnologia **WebXR** e **Three.js**, o sistema permite que administradores criem pontos de referência virtual em ambientes reais e visitantes visualizem essas informações através de seus smartphones.

### 🎯 Principais Funcionalidades

- **📱 Calibração por QR Code:** Sistema de referência baseado em códigos QR únicos para cada evento
- **👨‍💼 Modo Administrador:** Criação e gerenciamento de pontos de interesse em AR  
- **👥 Modo Visitante:** Visualização dos pontos criados pelos administradores
- **💾 Persistência de Dados:** Integração com Supabase para armazenamento em nuvem
- **🌐 Cross-platform:** Funciona em dispositivos móveis com suporte a WebXR

---

## 🛠️ Tecnologias Utilizadas

### Frontend Core
- **React 19.1.1** - Framework principal para UI
- **Vite 7.1.2** - Build tool e dev server
- **Three.js 0.179.1** - Engine 3D para renderização AR

### WebXR & AR
- **WebXR Device API** - API nativa para experiências AR/VR
- **Three.js WebXR** - Integração Three.js com WebXR
- **Hit Testing** - Detecção de superfícies para posicionamento de objetos

### Utilitários
- **jsQR 1.4.0** - Decodificação de códigos QR
- **@supabase/supabase-js 2.57.0** - Cliente para banco de dados
- **ESLint 9.33.0** - Linting e qualidade de código

### Modelos 3D
- **GLTF/GLB** - Formato de modelos 3D otimizado
- **GLTFLoader** - Carregamento de assets 3D

---

## 🚀 Guia de Instalação

### Pré-requisitos

- **Node.js** 16+ 
- **npm** ou **yarn**
- **Dispositivo com suporte WebXR** (Android Chrome, iOS Safari 15.4+)
- **HTTPS** obrigatório para WebXR (desenvolvimento local ou produção)

### 1. Clone o Repositório

```bash
git clone https://github.com/seu-usuario/app_localizar.git
cd app_localizar
```

### 2. Instale as Dependências

```bash
npm install
```

### 3. Configure o Ambiente

Crie um arquivo `.env.local` na raiz do projeto com suas credenciais do Supabase:

```bash
# .env.local
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_aqui
```

⚠️ **Importante:** 
- Adicione `.env.local` ao seu `.gitignore` para não vazar credenciais
- Use o prefixo `VITE_` para que as variáveis sejam acessíveis no frontend
- Substitua os valores pelas suas credenciais reais do Supabase

Os arquivos `src/components/ARView.jsx` e `src/components/AdminScreen.jsx` vão usar as variáveis:

```javascript
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### 4. Assets 3D

Coloque o modelo `map_pointer_3d_icon.glb` na pasta `public/` do projeto.

### 5. Execute o Projeto

**Desenvolvimento Local (apenas para desenvolvimento sem AR):**
```bash
npm run dev
```

**⚠️ Para Testes AR em Dispositivos Móveis:**

Como o **WebXR requer HTTPS obrigatoriamente**, você precisará hospedar o projeto em uma plataforma que forneça certificado SSL:

**Opção Recomendada - Deploy no Vercel:**
```bash
# 1. Build do projeto
npm run build

# 2. Instalar Vercel CLI (se não tiver)
npm i -g vercel

# 3. Deploy
vercel

# 4. Seguir as instruções e obter URL HTTPS

# 5. OU seguir passos para deploy no site do Vercel
```

**Alternativas de Hospedagem:**
- **Netlify:** `npm run build` → arrastar pasta `dist` para Netlify
- **Firebase Hosting:** `firebase deploy` após build

**Para Desenvolvimento Local com HTTPS:**
```bash
# Opção 1: Ngrok (túnel HTTPS)
npx ngrok http 5173

# Opção 2: Configurar HTTPS no vite.config.js
# (descomentar as linhas no arquivo vite.config.js)
```

> 💡 **Dica:** O Vercel oferece deploy gratuito e automático, basta sincronizar sua conta com o GitHub para ter acesso rápido aos projetos, sendo a opção mais simples para testar AR em dispositivos móveis.

---

## 🧪 Como Testar

### 📱 Requisitos de Teste

1. **Dispositivo compatível:** Android 7+ com Chrome 79+ ou iOS 15.4+ com Safari
2. **Conexão HTTPS** (obrigatória para WebXR)
3. **QR Codes de teste** preparados
4. **Ambiente bem iluminado** para melhor detecção AR

### 🔧 Fluxo de Teste - Modo Administrador

1. **Acesse a aplicação** via HTTPS
2. **Selecione "Modo Administrador"**
3. **Faça a calibração:**
   - Toque em "Calibrar com QR Code"
   - Aponte a câmera para um QR Code de teste
   - Aguarde a detecção e confirmação
4. **Entre no modo AR:**
   - Toque em "Start AR" quando aparecer
   - Permita acesso à câmera
   - Aguarde a inicialização do AR
5. **Crie pontos de interesse:**
   - Mova o dispositivo para encontrar superfícies
   - Toque no retículo verde para criar pontos
   - Verifique se os modelos 3D aparecem

### 👥 Fluxo de Teste - Modo Visitante

1. **Selecione "Modo Visitante"**
2. **Use o mesmo QR Code** da calibração do administrador
3. **Entre no AR e visualize** os pontos criados anteriormente

### 🐛 Troubleshooting Comum

| Problema | Solução |
|----------|---------|
| AR não inicia | Verifique HTTPS e compatibilidade do dispositivo |
| QR Code não detecta | Melhore iluminação e mantenha código estável |
| Modelos 3D não aparecem | Verifique se o arquivo `.glb` está em `/public/` |
| Pontos não salvam | Verifique conexão com Supabase |
| **Modelos aparecem em posições erradas** | **🚨 CRUCIAL: Não mova o celular até AR inicializar completamente** |
| Pontos "voando" no espaço | Refaça calibração mantendo dispositivo estável durante inicialização |

### 📊 Dados de Teste

A aplicação cria automaticamente:
- **Pontos locais** salvos no localStorage
- **Pontos remotos** sincronizados com Supabase
- **Estatísticas** de uso em tempo real

---

## 📁 Estrutura do Projeto

```
src/
├── components/
│   ├── ARView.jsx          # Componente principal de AR
│   ├── AdminScreen.jsx     # Interface do administrador
│   ├── UserScreen.jsx      # Interface do visitante
│   ├── HomeScreen.jsx      # Tela inicial
│   └── QRScanner.jsx       # Scanner de QR codes
├── hooks/
│   └── useLocalStorage.js  # Hook para persistência local
├── App.jsx                 # Componente raiz
├── App.css                 # Estilos específicos
└── main.jsx                # Entry point
```

---

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

---

## 🆘 Suporte

- **Issues:** [GitHub Issues](https://github.com/seu-usuario/app_localizar/issues)
- **Documentação WebXR:** [WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)
- **Three.js Docs:** [Three.js Documentation](https://threejs.org/docs/)

---

**Desenvolvido com ❤️ para revolucionar a navegação em eventos, cidades, supermercados e outros lugares através de Realidade Aumentada**
