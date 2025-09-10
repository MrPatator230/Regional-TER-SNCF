import mysql from 'mysql2/promise';

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_DATABASE || 'ferrovia_bfc',
  port: Number(process.env.DB_PORT || 8889),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

let pool;

export function getDb() {
  if (!pool) {
    pool = mysql.createPool(config);
  }
  return pool;
}

export async function query(sql, params) {
  const [rows] = await getDb().execute(sql, params);
  return rows;
}
