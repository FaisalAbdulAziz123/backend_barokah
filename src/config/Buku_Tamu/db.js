// config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";

console.log("🔍 Environment:", process.env.NODE_ENV);
console.log("🔍 Is Production:", isProd);

let dbConfig;

// Prioritas 1: Gunakan DATABASE_URL jika tersedia (Railway standard)
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    dbConfig = {
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading '/'
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      acquireTimeout: 30000,
      idleTimeout: 900000,
      ssl: false // Railway MySQL biasanya tidak perlu SSL
    };
    
    console.log("🔍 Using DATABASE_URL connection:", {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
      password: dbConfig.password ? "***" : "NOT_SET"
    });
  } catch (error) {
    console.error("❌ Error parsing DATABASE_URL:", error.message);
    console.log("🔄 Falling back to manual configuration...");
  }
}

// Prioritas 2: Gunakan konfigurasi manual jika DATABASE_URL tidak tersedia
if (!dbConfig) {
  dbConfig = {
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
    ssl: false
  };
  
  console.log("🔍 Using Manual Database Config:", {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    database: dbConfig.database,
    password: dbConfig.password ? "***" : "NOT_SET"
  });
}

const pool = mysql.createPool(dbConfig);

// Test koneksi database dengan retry mechanism
const testConnection = async (retries = 3) => {
  let connection;
  
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Testing database connection... (attempt ${i + 1}/${retries})`);
      connection = await pool.getConnection();
      
      // Test query sederhana
      const [rows] = await connection.execute('SELECT 1 as test, NOW() as time, DATABASE() as db_name');
      console.log("✅ Database connected successfully!");
      console.log("✅ Connection test result:", rows[0]);
      
      return true;
    } catch (err) {
      console.error(`❌ Database connection failed (attempt ${i + 1}/${retries}):`);
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
        console.error("   💡 Try using DATABASE_URL or public URL instead of internal hostname");
      } else if (err.code === 'ETIMEDOUT') {
        console.error("   🔍 Connection timeout - check network or firewall");
      }
      
      if (i === retries - 1) {
        console.error("❌ All connection attempts failed!");
        return false;
      } else {
        console.log(`⏳ Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
  
  return false;
};

// Jalankan test koneksi saat modul dimuat
testConnection();

// Export pool dan test function
export default pool;
export { testConnection };