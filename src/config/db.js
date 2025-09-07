// config/db.js
import mysql from "mysql2/promise";

// Ambil konfigurasi dari environment variables
const {
  MYSQLHOST,
  MYSQLPORT,
  MYSQLUSER,
  MYSQLPASSWORD,
  MYSQLDATABASE,
} = process.env;

// Validasi environment variables
if (!MYSQLHOST || !MYSQLUSER || !MYSQLPASSWORD || !MYSQLDATABASE || !MYSQLPORT) {
  console.error("❌ FATAL ERROR: Database environment variables are missing!");
  console.error("Please ensure MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, and MYSQLPORT are set.");
  process.exit(1); // Hentikan aplikasi jika config tidak lengkap
}

// Konfigurasi pool koneksi
const dbConfig = {
  host: MYSQLHOST,
  port: parseInt(MYSQLPORT, 10),
  user: MYSQLUSER,
  password: MYSQLPASSWORD,
  database: MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 15, // Bisa disesuaikan untuk production
  queueLimit: 0,
};

// Log untuk debugging (tanpa menampilkan password)
console.log("✅ Initializing database connection pool...");
console.log("🔍 Using Database Config:", {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  password: "***", // Jangan tampilkan password
});

// Buat pool koneksi
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

// Jalankan tes koneksi saat modul di-load
testConnection();

export default pool;
export { testConnection };
