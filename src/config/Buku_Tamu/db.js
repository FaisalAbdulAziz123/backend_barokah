// config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Deteksi otomatis apakah sedang jalan di Railway
// Railway selalu set RAILWAY_STATIC_URL di environment
const isRailway = !!process.env.RAILWAY_STATIC_URL;
const isProd = process.env.NODE_ENV === "production" || isRailway;

console.log("🌍 Running on:", isProd ? "Railway (Production)" : "Local (Development)");

// Konfigurasi database berdasarkan environment
const dbConfig = {
  host: isProd ? process.env.DB_HOST_PROD : process.env.DB_HOST_DEV,
  port: parseInt(isProd ? process.env.DB_PORT_PROD : process.env.DB_PORT_DEV),
  user: isProd ? process.env.DB_USER_PROD : process.env.DB_USER_DEV,
  password: isProd ? process.env.DB_PASSWORD_PROD : process.env.DB_PASSWORD_DEV,
  database: isProd ? process.env.DB_NAME_PROD : process.env.DB_NAME_DEV,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

console.log("🔍 Database Config:", {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  password: dbConfig.password ? "***" : "NOT_SET"
});

const pool = mysql.createPool(dbConfig);

// Test koneksi ke database
const testConnection = async () => {
  let connection;
  try {
    console.log("🔄 Testing database connection...");
    connection = await pool.getConnection();

    const [rows] = await connection.execute("SELECT 1 as test");
    console.log("✅ Database connected successfully!");
    console.log("✅ Test query result:", rows[0]);

    return true;
  } catch (err) {
    console.error("❌ Database connection failed:");
    console.error("   Error code:", err.code);
    console.error("   Error message:", err.message);
    console.error("   Error errno:", err.errno);

    if (err.code === "ECONNREFUSED") {
      console.error("   🔍 Connection refused - check host and port");
    } else if (err.code === "ER_ACCESS_DENIED_ERROR") {
      console.error("   🔍 Access denied - check username and password");
    } else if (err.code === "ENOTFOUND") {
      console.error("   🔍 Host not found - check hostname");
    }

    return false;
  } finally {
    if (connection) connection.release();
  }
};

// Jalankan test koneksi saat startup
testConnection();

export default pool;
export { testConnection };
