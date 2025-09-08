// config/db.js
import mysql from "mysql2/promise";

// Variabel koneksi database akan dibaca langsung dari environment variables
// yang disediakan oleh Railway (MYSQLHOST, MYSQLUSER, dll.)
const dbConfig = {
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT ? parseInt(process.env.MYSQLPORT, 10) : undefined,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 15, // Ditingkatkan sedikit untuk production
  queueLimit: 0,
};

// Log untuk debugging saat aplikasi startup
console.log("✅ Initializing database connection pool...");
console.log("🔍 Using Database Config:", {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  password: dbConfig.password ? "***" : "NOT_SET", // Jangan log password
});

// Validasi: Pastikan semua variabel penting ada saat di production
if (process.env.RAILWAY_ENVIRONMENT && (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.database || !dbConfig.port)) {
  console.error("❌ FATAL ERROR: Database environment variables are missing!");
  console.error("Please ensure MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, and MYSQLPORT are set as variable references in your Railway service.");
  // Hentikan aplikasi jika konfigurasi penting tidak ada di production
  process.exit(1); 
}

const pool = mysql.createPool(dbConfig);

// Fungsi untuk mengetes koneksi
const testConnection = async () => {
  let connection;
  try {
    console.log("🔄 Testing database connection...");
    connection = await pool.getConnection();
    console.log("✅ Database connected successfully!");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  } finally {
    if (connection) connection.release();
  }
};

// Jalankan tes koneksi saat modul ini di-load
testConnection();

export default pool;
export { testConnection };

