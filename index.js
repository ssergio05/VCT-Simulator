require('dotenv').config();
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'Frontend')));

// Crear un pool de conexiones
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '#010jQ164',
  database: process.env.MYSQLDATABASE || 'vct_emea_simulator',
  port: process.env.MYSQLPORT ? parseInt(process.env.MYSQLPORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});




app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Frontend', 'main.html'));
});

app.post('/api/resultado', async (req, res) => {
  const { equipo1_id, equipo2_id, score_equipo1, score_equipo2 } = req.body;
  const query = `
    UPDATE partidos
    SET score_equipo1 = ?, score_equipo2 = ?
    WHERE equipo1_id = ? AND equipo2_id = ?
  `;

  try {
    const [results] = await pool.query(query, [score_equipo1, score_equipo2, equipo1_id, equipo2_id]);
    console.log(`✅ Resultado actualizado: ${results.affectedRows} filas modificadas`);
    res.status(200).json({ message: 'Resultado actualizado', actualizados: results.affectedRows });
  } catch (err) {
    console.error('❌ Error al actualizar el resultado:', err);
    res.status(500).json({ error: 'Error al actualizar el resultado' });
  }
});

app.get('/api/clasificacion', async (req, res) => {
  const ligaId = req.query.liga_id;
  if (!ligaId) return res.status(400).json({ error: 'liga_id es requerido' });

  try {
    const [equipos] = await pool.query(`
      SELECT 
        e.id AS equipo_id,
        e.nombre AS equipo_nombre,
        e.grupo AS equipo_grupo,
        e.logo AS logo,
        COALESCE(SUM(CASE WHEN p.equipo1_id = e.id AND p.score_equipo1 > p.score_equipo2 THEN 1
                          WHEN p.equipo2_id = e.id AND p.score_equipo2 > p.score_equipo1 THEN 1
                          ELSE 0 END), 0) AS victorias,
        COALESCE(SUM(CASE WHEN p.equipo1_id = e.id AND p.score_equipo1 < p.score_equipo2 THEN 1
                          WHEN p.equipo2_id = e.id AND p.score_equipo2 < p.score_equipo1 THEN 1
                          ELSE 0 END), 0) AS derrotas,
        COALESCE(SUM(CASE WHEN p.equipo1_id = e.id THEN p.score_equipo1
                          WHEN p.equipo2_id = e.id THEN p.score_equipo2
                          ELSE 0 END), 0) AS mapas_ganados,
        COALESCE(SUM(CASE WHEN p.equipo1_id = e.id THEN p.score_equipo2
                          WHEN p.equipo2_id = e.id THEN p.score_equipo1
                          ELSE 0 END), 0) AS mapas_perdidos
      FROM equipos e
      LEFT JOIN partidos p ON (e.id = p.equipo1_id OR e.id = p.equipo2_id) AND p.liga_id = ?
      WHERE e.liga_id = ?
      GROUP BY e.id, e.nombre, e.grupo, e.logo
    `, [ligaId, ligaId]);

    // Aquí logueamos para ver qué llega desde la base de datos
    console.log('Equipos crudos con logo:', equipos);

    const [partidosConfirmados] = await pool.query(`
      SELECT * FROM partidos WHERE resultado_confirmado = 1 AND liga_id = ?
    `, [ligaId]);

    const clasificacionOrdenada = ordenarEquipos(equipos, partidosConfirmados);
    res.json(clasificacionOrdenada);
  } catch (err) {
    console.error('❌ Error al obtener clasificación:', err.message);
    res.status(500).json({ error: 'Error al obtener la clasificación', detalles: err.message });
  }
});




function ordenarEquipos(equipos, partidos) {
  const grupos = {};
  equipos.forEach(equipo => {
    if (!grupos[equipo.equipo_grupo]) grupos[equipo.equipo_grupo] = [];
    grupos[equipo.equipo_grupo].push({ ...equipo });
  });

  for (const grupo in grupos) {
    grupos[grupo].sort((a, b) => {
      if (b.victorias !== a.victorias) return b.victorias - a.victorias;

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

      const diffA = a.mapas_ganados - a.mapas_perdidos;
      const diffB = b.mapas_ganados - b.mapas_perdidos;
      return diffB - diffA;
    });
  }

  return Object.values(grupos).flat();
}

app.get('/api/partidos', async (req, res) => {
  const ligaId = req.query.liga_id;
  if (!ligaId) return res.status(400).json({ error: 'liga_id es requerido' });

  const query = `
    SELECT p.id, p.equipo1_id, p.equipo2_id, p.score_equipo1, p.score_equipo2, p.resultado_confirmado,
           p.semana,
           e1.logo AS equipo1_logo, e2.logo AS equipo2_logo,
           e1.nombre AS equipo1_nombre, e2.nombre AS equipo2_nombre
    FROM partidos p
    JOIN equipos e1 ON p.equipo1_id = e1.id
    JOIN equipos e2 ON p.equipo2_id = e2.id
    WHERE p.liga_id = ?
  `;

  try {
    const [results] = await pool.query(query, [ligaId]);
    res.json(results);
  } catch (err) {
    console.error('❌ Error al obtener los partidos:', err);
    res.status(500).json({ error: 'Error al obtener los partidos' });
  }
});

app.post('/api/inicializar-resultados', async (req, res) => {
  const query = `
    UPDATE partidos
    SET score_equipo1 = 0, score_equipo2 = 0
    WHERE resultado_confirmado = 0 OR resultado_confirmado IS NULL
  `;

  try {
    const [results] = await pool.query(query);
    res.status(200).json({ message: 'Resultados inicializados', actualizados: results.affectedRows });
  } catch (err) {
    console.error('❌ Error al inicializar resultados:', err);
    res.status(500).json({ error: 'Error al inicializar los resultados' });
  }
});

app.post('/api/sincronizar-resultados-confirmados', async (req, res) => {
  const query = `
    UPDATE partidos p
    JOIN resultados_confirmados rc ON p.id = rc.partido_id
    SET 
      p.score_equipo1 = rc.score_equipo1,
      p.score_equipo2 = rc.score_equipo2
    WHERE p.resultado_confirmado = 1
  `;

  try {
    const [results] = await pool.query(query);
    res.status(200).json({ message: 'Resultados confirmados sincronizados', actualizados: results.affectedRows });
  } catch (err) {
    console.error('❌ Error al sincronizar resultados confirmados:', err);
    res.status(500).json({ error: 'Error al sincronizar resultados confirmados' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
