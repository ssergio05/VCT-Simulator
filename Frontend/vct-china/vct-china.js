let semanaActual = 1;
const PARTIDOS_POR_SEMANA = 6;
let ligaActual = 4; // 👈 ID de la liga seleccionada (por defecto VCT EMEA, por ejemplo)

// ✨ Actualiza la pestaña activa y partidos desde API
function actualizarSemana() {
  document.querySelectorAll('.semana-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.semana == semanaActual);
  });

  fetch(`http://localhost:3000/api/partidos?liga_id=${ligaActual}`)
    .then(res => res.json())
    .then(partidos => {
      // Filtra los partidos por la semana actual
      const partidosDeLaSemana = partidos.filter(p => p.semana == semanaActual);
      renderizarPartidos(partidosDeLaSemana);
    })
    .catch(err => console.error('❌ Error al cargar partidos de la semana:', err));
}

// 🎯 Renderiza partidos dinámicamente
function renderizarPartidos(partidos) {
  const contenedor = document.getElementById('partidosSemana');
  if (!contenedor) return;

  contenedor.innerHTML = ''; // Limpiar los partidos previos

  partidos.forEach(partido => {
    // Asegurarse de que los datos de los equipos están bien estructurados
    const equipo1_logo = partido.equipo1_logo || 'ruta_default_logo.jpg'; // Logo por defecto si no existe
    const equipo2_logo = partido.equipo2_logo || 'ruta_default_logo.jpg'; // Logo por defecto si no existe
    const equipo1_nombre = partido.equipo1_nombre || 'Equipo 1'; // Nombre por defecto si no existe
    const equipo2_nombre = partido.equipo2_nombre || 'Equipo 2'; // Nombre por defecto si no existe

    const div = document.createElement('div');
    div.className = 'partido';
    div.dataset.partidoId = partido.id;
    div.dataset.equipo1Id = partido.equipo1_id;
    div.dataset.equipo2Id = partido.equipo2_id;

    div.innerHTML = `
      <div class="equipos">
        <button class="logo-btn" data-team="${partido.equipo1_id}">
          <img src="${equipo1_logo}" alt="${equipo1_nombre}" />
        </button>
        <span class="vs">vs</span>
        <button class="logo-btn" data-team="${partido.equipo2_id}">
          <img src="${equipo2_logo}" alt="${equipo2_nombre}" />
        </button>
      </div>
      <div class="resultados">
        <button class="resultado">2-0</button>
        <button class="resultado">2-1</button>
      </div>
    `;

    contenedor.appendChild(div);
    inicializarEventosDePartido(div);

    if (partido.resultado_confirmado === 1) {
      const ganadorId = partido.score_equipo1 > partido.score_equipo2
        ? partido.equipo1_id
        : partido.equipo2_id;

      const resultadoStr = `${Math.max(partido.score_equipo1, partido.score_equipo2)}-${Math.min(partido.score_equipo1, partido.score_equipo2)}`;

      div.querySelectorAll('.logo-btn').forEach(btn => {
        if (parseInt(btn.dataset.team) === ganadorId) {
          btn.classList.add('selected');
        }
      });

      div.querySelectorAll('.resultado').forEach(btn => {
        if (btn.innerText.trim() === resultadoStr) {
          btn.classList.add('selected');
        }
      });
    }
  });
}



// 🧩 Inicializa eventos por partido
function inicializarEventosDePartido(partidoDiv) {
  const logoButtons = partidoDiv.querySelectorAll('.logo-btn');
  const resultadoButtons = partidoDiv.querySelectorAll('.resultado');

  logoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      logoButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      enviarResultadoDesdePartido(partidoDiv);
    });
  });

  resultadoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      resultadoButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      enviarResultadoDesdePartido(partidoDiv);
    });
  });
}

// 📤 Enviar resultado a la API
function enviarResultadoDesdePartido(partido) {
  const resultadoBtn = partido.querySelector('.resultado.selected');
  const selectedLogo = partido.querySelector('.logo-btn.selected');
  if (!selectedLogo || !resultadoBtn) return;

  const equipo1 = parseInt(partido.dataset.equipo1Id);
  const equipo2 = parseInt(partido.dataset.equipo2Id);
  const equipoSeleccionado = parseInt(selectedLogo.dataset.team);
  const [ganador, perdedor] = resultadoBtn.innerText.trim().split('-').map(Number);

  const score_equipo1 = equipoSeleccionado === equipo1 ? ganador : perdedor;
  const score_equipo2 = equipoSeleccionado === equipo1 ? perdedor : ganador;

  const datos = {
    equipo1_id: equipo1,
    equipo2_id: equipo2,
    score_equipo1,
    score_equipo2,
    liga_id: ligaActual
  };

  fetch('http://localhost:3000/api/resultado', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos)
  })
    .then(res => res.json())
    .then(() => {
      console.log('✅ Resultado enviado');
      cargarClasificacion();
    })
    .catch(err => console.error('❌ Error al enviar el resultado:', err));
}

// 📊 Clasificación
function cargarClasificacion() {
  fetch(`http://localhost:3000/api/clasificacion?liga_id=${ligaActual}`)
    .then(res => res.json())
    .then(data => {
      const equiposAlpha = data.filter(e => e.equipo_grupo === 'Alpha');
      const equiposOmega = data.filter(e => e.equipo_grupo === 'Omega');

      actualizarTabla('group-alpha-table', equiposAlpha);
      actualizarTabla('group-omega-table', equiposOmega);
    })
    .catch(error => console.error('❌ Error al obtener la clasificación:', error));
}

function actualizarTabla(tablaId, datos) {
  const tabla = document.getElementById(tablaId);
  const tbody = tabla?.querySelector('tbody');
  
  if (!tbody) return;
  tbody.innerHTML = '';

  datos.forEach((dato, index) => {
    const fila = document.createElement('tr');
    const winLoss = `${dato.victorias}-${dato.derrotas}`;
    const mapas = `${dato.mapas_ganados}-${dato.mapas_perdidos}`;
    const diferencia = dato.mapas_ganados - dato.mapas_perdidos;

    fila.innerHTML = `
      <td>${dato.equipo_nombre}</td>
      <td>${winLoss}</td>
      <td>${mapas}</td>
      <td>${diferencia}</td>
    `;

    if (index < 4) fila.classList.add('fila-verde');
    if (index >= datos.length - 2) fila.classList.add('fila-roja');

    tbody.appendChild(fila);
  });
}

// 🧠 Botones de semana
document.querySelectorAll('.semana-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    semanaActual = parseInt(btn.dataset.semana);
    actualizarSemana();
  });
});

// 🚀 Inicialización
document.addEventListener('DOMContentLoaded', () => {
  fetch('http://localhost:3000/api/sincronizar-resultados-confirmados', { method: 'POST' })
    .then(res => res.json())
    .then(() => fetch('http://localhost:3000/api/inicializar-resultados', { method: 'POST' }))
    .then(res => res.json())
    .then(() => {
      cargarClasificacion();
      actualizarSemana();
    })
    .catch(err => console.error('❌ Error en la inicialización:', err));
});
