// config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";

const pool = mysql.createPool({
  host: isProd ? process.env.DB_HOST_PROD : process.env.DB_HOST_DEV,
  port: isProd ? process.env.DB_PORT_PROD : process.env.DB_PORT_DEV,
  user: isProd ? process.env.DB_USER_PROD : process.env.DB_USER_DEV,
  password: isProd ? process.env.DB_PASSWORD_PROD : process.env.DB_PASSWORD_DEV,
  database: isProd ? process.env.DB_NAME_PROD : process.env.DB_NAME_DEV,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// 🔎 Tes koneksi langsung saat server jalan
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅ Database connected!");
    conn.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
})();

export default pool;
