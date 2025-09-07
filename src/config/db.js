import mysql from "mysql2/promise";

// Ambil semua variabel environment yang dibutuhkan
const {
    MYSQLHOST,
    MYSQLUSER,
    MYSQLPASSWORD,
    MYSQLDATABASE, // Ini yang paling penting untuk error 'No database selected'
    MYSQLPORT
} = process.env;

// Periksa apakah semua variabel ada saat aplikasi berjalan di Railway
if (process.env.RAILWAY_ENVIRONMENT && (!MYSQLHOST || !MYSQLUSER || !MYSQLPASSWORD || !MYSQLDATABASE || !MYSQLPORT)) {
    console.error("❌ FATAL ERROR: Database environment variables are missing in Railway!");
    console.log("Pastikan variabel referensi MYSQLHOST, MYSQLUSER, dll. sudah diatur di layanan backend.");
    process.exit(1); // Hentikan aplikasi jika variabel penting tidak ada
}

// Konfigurasi untuk koneksi database
const dbConfig = {
    host: MYSQLHOST || 'localhost', // Fallback ke localhost jika tidak di Railway
    port: MYSQLPORT ? parseInt(MYSQLPORT, 10) : 3306,
    user: MYSQLUSER || 'root',
    password: MYSQLPASSWORD || '',
    database: MYSQLDATABASE || 'barokah_tour', // INI KUNCINYA!
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
};

// Buat connection pool
const pool = mysql.createPool(dbConfig);

// Fungsi untuk mengetes koneksi saat startup
const testConnectionOnStartup = async () => {
  let connection;
  try {
    console.log("🔄 Testing database connection on startup...");
    connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT 1 + 1 AS result');
    console.log("✅ Database connection successful on startup. Result:", rows[0].result);
  } catch (err) {
    console.error("❌ Database connection failed on startup:", err.message);
    console.error("   Using config:", {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database,
        password: dbConfig.password ? '***' : 'NOT SET'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Panggil fungsi tes koneksi
testConnectionOnStartup();


export default pool;

