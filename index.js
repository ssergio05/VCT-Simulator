require('dotenv').config();  // Cargar variables de entorno desde .env

const path = require('path');  // Asegúrate de importar 'path'
const express = require('express');
const mysql = require('mysql2');
const app = express();
app.use(express.static(path.join(__dirname, 'Frontend')));
const port = 3000;

const cors = require('cors');
app.use(cors());
app.use(express.json());

// Conexión a la base de datos
const connection = mysql.createConnection({
  host: process.env.MYSQLHOST,        // Usar la variable de entorno MYSQLHOST proporcionada por Railway
  user: process.env.MYSQLUSER,        // Usar la variable de entorno MYSQLUSER proporcionada por Railway
  password: process.env.MYSQLPASSWORD, // Usar la variable de entorno MYSQLPASSWORD proporcionada por Railway
  database: process.env.MYSQLDATABASE  // Usar la variable de entorno MYSQLDATABASE proporcionada por Railway
});

connection.connect((err) => {
  if (err) {
    console.error('Error de conexión a la base de datos:', err.stack);
    return;
  }
  console.log('Conectado a la base de datos MySQL');
});


app.get('/', (req, res) => {
  // Aquí puedes servir el archivo 'main.html' que está en la carpeta 'Frontend'
  res.sendFile(path.join(__dirname, 'Frontend', 'main.html'));
});

  // POST para actualizar el resultado de un partido
  app.post('/api/resultado', (req, res) => {
    const { equipo1_id, equipo2_id, score_equipo1, score_equipo2 } = req.body;

    // Actualizamos solo los puntajes, sin tocar el campo resultado_confirmado
    const query = `
      UPDATE partidos
      SET score_equipo1 = ?, score_equipo2 = ?
      WHERE equipo1_id = ? AND equipo2_id = ?
    `;

    connection.execute(query, [score_equipo1, score_equipo2, equipo1_id, equipo2_id], (err, results) => {
      if (err) {
        console.error('❌ Error al actualizar el resultado:', err);
        return res.status(500).json({ error: 'Error al actualizar el resultado' });
      }

      console.log(`✅ Resultado actualizado: ${results.affectedRows} filas modificadas`);

      // Respondemos con el estado exitoso
      res.status(200).json({ message: 'Resultado actualizado', actualizados: results.affectedRows });
    });
  });

  // GET para obtener la clasificación dinámica
  // Ruta para obtener la clasificación de los equipos
  // GET para obtener la clasificación con criterios personalizados
  app.get('/api/clasificacion', async (req, res) => {
    const ligaId = req.query.liga_id;
  
    if (!ligaId) {
      return res.status(400).json({ error: 'liga_id es requerido' });
    }
  
    try {
      console.log('🔍 Obteniendo clasificación para liga:', ligaId);
  
      const [equipos] = await connection.promise().query(`
        SELECT 
          e.id AS equipo_id,
          e.nombre AS equipo_nombre,
          e.grupo AS equipo_grupo,
          COALESCE(SUM(CASE 
            WHEN p.equipo1_id = e.id AND p.score_equipo1 > p.score_equipo2 THEN 1
            WHEN p.equipo2_id = e.id AND p.score_equipo2 > p.score_equipo1 THEN 1
            ELSE 0 END), 0) AS victorias,
          COALESCE(SUM(CASE 
            WHEN p.equipo1_id = e.id AND p.score_equipo1 < p.score_equipo2 THEN 1
            WHEN p.equipo2_id = e.id AND p.score_equipo2 < p.score_equipo1 THEN 1
            ELSE 0 END), 0) AS derrotas,
          COALESCE(SUM(CASE 
            WHEN p.equipo1_id = e.id THEN p.score_equipo1
            WHEN p.equipo2_id = e.id THEN p.score_equipo2
            ELSE 0 END), 0) AS mapas_ganados,
          COALESCE(SUM(CASE 
            WHEN p.equipo1_id = e.id THEN p.score_equipo2
            WHEN p.equipo2_id = e.id THEN p.score_equipo1
            ELSE 0 END), 0) AS mapas_perdidos
        FROM equipos e
        LEFT JOIN partidos p ON (e.id = p.equipo1_id OR e.id = p.equipo2_id) AND p.liga_id = ?
        WHERE e.liga_id = ?
        GROUP BY e.id
      `, [ligaId, ligaId]);
  
      console.log('📋 Equipos obtenidos:', equipos);
  
      const [partidosConfirmados] = await connection.promise().query(`
        SELECT * FROM partidos WHERE resultado_confirmado = 1 AND liga_id = ?
      `, [ligaId]);
  
      console.log('📋 Partidos confirmados:', partidosConfirmados);
  
      const clasificacionOrdenada = ordenarEquipos(equipos, partidosConfirmados);
      res.json(clasificacionOrdenada);
  
    } catch (err) {
      console.error('❌ Error al obtener clasificación:', err.message);
      res.status(500).json({ error: 'Error al obtener la clasificación', detalles: err.message });
    }
  });
  


  // Función para ordenar equipos según los criterios de clasificación
  function ordenarEquipos(equipos, partidos) {
    // Agrupamos por grupo para ordenar dentro de cada uno
    const grupos = {};
    equipos.forEach(equipo => {
      if (!grupos[equipo.equipo_grupo]) {
        grupos[equipo.equipo_grupo] = [];
      }
      grupos[equipo.equipo_grupo].push({ ...equipo });
    });

    // Ordenar cada grupo según los criterios
    for (const grupo in grupos) {
      grupos[grupo].sort((a, b) => {
        // 1️⃣ Más victorias
        if (b.victorias !== a.victorias) {
          return b.victorias - a.victorias;
        }

        // 2️⃣ Head-to-head (solo si se enfrentaron)
        const partidoEntreEllos = partidos.find(p =>
          (p.equipo1_id === a.equipo_id && p.equipo2_id === b.equipo_id) ||
          (p.equipo1_id === b.equipo_id && p.equipo2_id === a.equipo_id)
        );

        if (partidoEntreEllos) {
          const ganadorId = partidoEntreEllos.score_equipo1 > partidoEntreEllos.score_equipo2
            ? partidoEntreEllos.equipo1_id
            : partidoEntreEllos.equipo2_id;

          if (ganadorId === a.equipo_id) return -1;
          if (ganadorId === b.equipo_id) return 1;
        }

        // 3️⃣ Diferencia de mapas
        const diffA = a.mapas_ganados - a.mapas_perdidos;
        const diffB = b.mapas_ganados - b.mapas_perdidos;

        return diffB - diffA;
      });
    }

    // Unimos todos los grupos en un solo array para enviar al frontend
    return Object.values(grupos).flat();
  }

  // Iniciar el servidor
  app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
  });

  // GET para obtener todos los partidos
  // GET para obtener partidos de una liga
  // Ruta para obtener todos los partidos
  app.get('/api/partidos', (req, res) => {
    const ligaId = req.query.liga_id; // recoger el id de liga desde el frontend

    if (!ligaId) {
      console.error('❌ Error: liga_id es requerido');
      return res.status(400).json({ error: 'liga_id es requerido' });
    }

    console.log(`Obteniendo partidos para liga_id: ${ligaId}`);

    const query = `
      SELECT 
        p.id, p.equipo1_id, p.equipo2_id, p.score_equipo1, p.score_equipo2, p.resultado_confirmado,
        p.semana,
        e1.logo AS equipo1_logo, e2.logo AS equipo2_logo,
        e1.nombre AS equipo1_nombre, e2.nombre AS equipo2_nombre
      FROM partidos p
      JOIN equipos e1 ON p.equipo1_id = e1.id
      JOIN equipos e2 ON p.equipo2_id = e2.id
      WHERE p.liga_id = ?
    `;

    connection.query(query, [ligaId], (err, results) => {
      if (err) {
        console.error('❌ Error al obtener los partidos:', err);
        return res.status(500).json({ error: 'Error al obtener los partidos' });
      }

      console.log("Partidos obtenidos:", results);
      res.json(results);
    });
  });





  // Ruta para inicializar partidos no confirmados a 0-0
  app.post('/api/inicializar-resultados', (req, res) => {
    const query = `
      UPDATE partidos
      SET score_equipo1 = 0, score_equipo2 = 0
      WHERE resultado_confirmado = 0 OR resultado_confirmado IS NULL
    `;

    connection.execute(query, [], (err, results) => {
      if (err) {
        console.error('❌ Error al inicializar resultados:', err);
        return res.status(500).json({ error: 'Error al inicializar los resultados' });
      }

      console.log(`✅ Resultados inicializados (${results.affectedRows} partidos actualizados)`);
      res.status(200).json({ message: 'Resultados inicializados', actualizados: results.affectedRows });
    });
  });

  // Ruta para sincronizar resultados confirmados reales
  app.post('/api/sincronizar-resultados-confirmados', (req, res) => {
    const query = `
      UPDATE partidos p
      JOIN resultados_confirmados rc ON p.id = rc.partido_id
      SET 
        p.score_equipo1 = rc.score_equipo1,
        p.score_equipo2 = rc.score_equipo2
      WHERE p.resultado_confirmado = 1
    `;

    connection.query(query, (err, results) => {
      if (err) {
        console.error('❌ Error al sincronizar resultados confirmados:', err);
        return res.status(500).json({ error: 'Error al sincronizar resultados confirmados' });
      }

      console.log(`✅ Resultados sincronizados desde tabla 'resultados_confirmados': ${results.affectedRows} filas actualizadas`);
      res.status(200).json({ message: 'Resultados confirmados sincronizados', actualizados: results.affectedRows });
    });
  });
