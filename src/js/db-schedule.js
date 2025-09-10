import mysql from 'mysql2/promise';

// Connexion dédiée à la base "horaires" (sillons)
// Variables d'env spécifiques SCHEDULE_DB_* sinon fallback génériques DB_*
const config = {
  host: process.env.SCHEDULE_DB_HOST || process.env.DB_HOST || 'localhost',
  user: process.env.SCHEDULE_DB_USER || process.env.DB_USER || 'root',
  password: process.env.SCHEDULE_DB_PASSWORD || process.env.DB_PASSWORD || 'root',
  database: process.env.SCHEDULE_DB_DATABASE || 'horaires',
  port: Number(process.env.SCHEDULE_DB_PORT || process.env.DB_PORT || 8889),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

let pool;

export function getSchedulesDb() {
  if (!pool) {
    pool = mysql.createPool(config);
  }
  return pool;
}

export async function scheduleQuery(sql, params) {
  const [rows] = await getSchedulesDb().execute(sql, params);
  return rows;
}

export async function scheduleExecute(sql, params){
  const [result] = await getSchedulesDb().execute(sql, params);
  return result;
}
