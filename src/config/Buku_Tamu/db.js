// config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";

console.log("🔍 Environment:", process.env.NODE_ENV);
console.log("🔍 Is Production:", isProd);

// Konfigurasi database berdasarkan environment
const dbConfig = {
  host: isProd ? process.env.DB_HOST_PROD : process.env.DB_HOST_DEV,
  port: parseInt(isProd ? process.env.DB_PORT_PROD : process.env.DB_PORT_DEV) || 3306,
  user: isProd ? process.env.DB_USER_PROD : process.env.DB_USER_DEV,
  password: isProd ? process.env.DB_PASSWORD_PROD : process.env.DB_PASSWORD_DEV,
  database: isProd ? process.env.DB_NAME_PROD : process.env.DB_NAME_DEV,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 30000,
  idleTimeout: 900000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: "+00:00" // Railway biasanya menggunakan UTC
};

console.log("🔍 Database Config:", {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  password: dbConfig.password ? "***" : "NOT_SET"
});

const pool = mysql.createPool(dbConfig);

// Test koneksi database
const testConnection = async () => {

    // Tambahkan di config/db.js
let dbConfig;

if (process.env.DATABASE_URL) {
  // Parse DATABASE_URL format: mysql://user:pass@host:port/dbname
  const url = new URL(process.env.DATABASE_URL);
  dbConfig = {
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1), // Remove leading '/'
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
} else {
  // Fallback ke konfigurasi manual
  dbConfig = {
    host: isProd ? process.env.DB_HOST_PROD : process.env.DB_HOST_DEV,
    port: parseInt(isProd ? process.env.DB_PORT_PROD : process.env.DB_PORT_DEV) || 3306,
    user: isProd ? process.env.DB_USER_PROD : process.env.DB_USER_DEV,
    password: isProd ? process.env.DB_PASSWORD_PROD : process.env.DB_PASSWORD_DEV,
    database: isProd ? process.env.DB_NAME_PROD : process.env.DB_NAME_DEV,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}
  let connection;
  try {
    console.log("🔄 Testing database connection...");
    connection = await pool.getConnection();
    
    // Test query sederhana
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log("✅ Database connected successfully!");
    console.log("✅ Test query result:", rows[0]);
    
    return true;
  } catch (err) {
    console.error("❌ Database connection failed:");
    console.error("   Error code:", err.code);
    console.error("   Error message:", err.message);
    console.error("   Error errno:", err.errno);
    
    // Detail error untuk debugging
    if (err.code === 'ECONNREFUSED') {
      console.error("   🔍 Connection refused - check host and port");
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error("   🔍 Access denied - check username and password");
    } else if (err.code === 'ENOTFOUND') {
      console.error("   🔍 Host not found - check hostname");
    }
    
    return false;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};



// Jalankan test koneksi saat modul dimuat
testConnection();

// Export pool dan test function
export default pool;
export { testConnection };