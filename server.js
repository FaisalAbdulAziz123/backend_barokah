// server.js
// Monolithic backend untuk Barokah Tour
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./src/config/db.js";

// Load environment variables
dotenv.config();

const saltRounds = 10;
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Definisikan __dirname untuk ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Buat folder uploads jika belum ada
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Konfigurasi upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Health check endpoints
app.get("/", (req, res) => {
  res.json({ 
    success: true, 
    message: "🎉 Server backend Barokah Tour berhasil berjalan!",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.get("/api", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT 1 + 1 AS result");
    res.json({ 
      success: true, 
      message: "API Barokah jalan 🚀", 
      db: rows[0],
      environment: process.env.NODE_ENV
    });
  } catch (err) {
    console.error("❌ DB Connection Error:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Kesalahan server DB",
      error: err.message 
    });
  }
});

// Test database endpoint
app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT NOW() as waktu, DATABASE() as db_name");
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("❌ Query gagal:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------ Helper Functions ------------------
function genRandomSuffix(len = 8) {
  return uuidv4().split("-")[0].slice(0, len).toUpperCase();
}

// ------------------ BOOKINGS ENDPOINTS ------------------

// POST /api/bookings
app.post("/api/bookings", async (req, res) => {
  console.log("📥 POST /api/bookings - Menerima permintaan booking baru...");
  const {
    package_id,
    customer_name,
    customer_email,
    participants,
    total_price,
  } = req.body;

  if (
    !package_id ||
    !customer_name ||
    !customer_email ||
    !participants ||
    !Array.isArray(participants) ||
    participants.length === 0 ||
    total_price === undefined
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Data booking tidak lengkap." });
  }

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Ambil city_code dari package
    const getPackageQuery = `SELECT p.id AS package_id, p.name AS package_name, c.city_code, c.city_name FROM packages p LEFT JOIN cities c ON p.city_id = c.id WHERE p.id = ? LIMIT 1`;

    const [pkgRows] = await connection.execute(getPackageQuery, [package_id]);
    
    if (!pkgRows || pkgRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Paket tidak ditemukan." });
    }

    const pkg = pkgRows[0];
    let prefix = pkg.city_code
      ? pkg.city_code.toUpperCase()
      : pkg.city_name
      ? pkg.city_name.substring(0, 3).toUpperCase()
      : pkg.package_name.substring(0, 3).toUpperCase();
    const bookingCode = `${prefix}-${genRandomSuffix(8)}`;

    // Insert booking
    const insertBookingSql = `INSERT INTO bookings (package_id, booking_id, customer_name, customer_email, total_price, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'menunggu_pembayaran', NOW(), NOW())`;
    
    const [result] = await connection.execute(insertBookingSql, [
      package_id, bookingCode, customer_name, customer_email, total_price
    ]);

    const newBookingId = result.insertId;

    // Insert peserta ke participants
    const insertParticipantSql = `INSERT INTO participants (booking_id, name, phone, address, birth_place, status, created_at) VALUES (?, ?, ?, ?, ?, 'valid', NOW())`;
    
    for (const participant of participants) {
      await connection.execute(insertParticipantSql, [
        newBookingId, participant.name, participant.phone, participant.address, participant.birth_place
      ]);
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Booking berhasil dibuat!",
      bookingId: newBookingId,
      bookingCode,
      status: "menunggu_pembayaran",
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ Error creating booking:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Gagal menyimpan booking.",
      error: err.message 
    });
  } finally {
    connection.release();
  }
});

// GET /api/bookings - semua booking (admin)
app.get("/api/bookings", async (req, res) => {
  try {
    const query = `SELECT b.id, b.booking_id AS bookingCode, b.package_id, p.name AS package_name, b.customer_name, b.customer_email, b.total_price, b.status, b.created_at FROM bookings b LEFT JOIN packages p ON b.package_id = p.id ORDER BY b.created_at DESC`;
    
    const [rows] = await pool.execute(query);
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error("❌ Error fetching bookings:", err);
    res.status(500).json({ success: false, message: "Gagal mengambil data booking." });
  }
});

// GET /api/bookings/:id - detail booking & peserta
app.get("/api/bookings/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const bookingQuery = `SELECT b.id, b.booking_id AS bookingCode, b.package_id, p.name AS package_name, b.customer_name, b.customer_email, b.total_price, b.status, b.created_at FROM bookings b LEFT JOIN packages p ON b.package_id = p.id WHERE b.id = ? LIMIT 1`;

    const [bookingRows] = await pool.execute(bookingQuery, [id]);
    
    if (bookingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking tidak ditemukan.",
      });
    }

    const booking = bookingRows[0];

    const participantsQuery = `SELECT id, name, status, scanned_at, created_at, updated_at FROM participants WHERE booking_id = ?`;

    const [participantsRows] = await pool.execute(participantsQuery, [id]);
    booking.participants = participantsRows;

    return res.status(200).json({ success: true, data: booking });
  } catch (err) {
    console.error("❌ Error fetching booking detail:", err);
    return res.status(500).json({
      success: false,
      message: "Kesalahan server saat mengambil booking.",
    });
  }
});

// GET /api/bookings/:id/ticket - tiket peserta
app.get("/api/bookings/:id/ticket", async (req, res) => {
  const { id } = req.params;
  
  try {
    const sql = `SELECT * FROM bookings WHERE id = ? LIMIT 1`;
    const [results] = await pool.execute(sql, [id]);
    
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "Booking tidak ditemukan." });
    }

    const booking = results[0];
    
    if (booking.status !== "selesai") {
      return res.status(403).json({ success: false, message: "Pembayaran belum lunas." });
    }

    const participantSql = `SELECT id, name, status FROM participants WHERE booking_id = ?`;
    const [participants] = await pool.execute(participantSql, [booking.id]);

    res.json({
      success: true,
      ticket: {
        booking_id: booking.booking_id,
        customer_name: booking.customer_name,
        customer_email: booking.customer_email,
        participants,
        total_price: booking.total_price,
        status: booking.status,
        qr_code: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${booking.booking_id}`,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching ticket:", err);
    res.status(500).json({ success: false, message: "DB error" });
  }
});

// PUT /api/bookings/:id/status
app.put("/api/bookings/:id/status", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ success: false, message: "Status wajib diisi." });
  }

  try {
    const sql = "UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?";
    const [result] = await pool.execute(sql, [status, id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Booking tidak ditemukan." });
    }

    return res.status(200).json({
      success: true,
      message: "Status booking diperbarui.",
      dbId: id,
      status,
    });
  } catch (err) {
    console.error("❌ Error updating booking status:", err);
    res.status(500).json({ success: false, message: "Gagal update status booking." });
  }
});

// DELETE /api/bookings/:id
app.delete("/api/bookings/:id", async (req, res) => {
  const id = req.params.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Delete participants first
    const deleteParticipants = "DELETE FROM participants WHERE booking_id = ?";
    await connection.execute(deleteParticipants, [id]);

    // Delete booking
    const deleteBooking = "DELETE FROM bookings WHERE id = ?";
    const [result] = await connection.execute(deleteBooking, [id]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Booking tidak ditemukan." });
    }

    await connection.commit();
    return res.status(200).json({ success: true, message: "Booking berhasil dihapus." });
  } catch (err) {
    await connection.rollback();
    console.error("❌ Error deleting booking:", err);
    res.status(500).json({ success: false, message: "Kesalahan server." });
  } finally {
    connection.release();
  }
});

// ------------------ PACKAGES ENDPOINTS ------------------

// GET /api/packages
app.get("/api/packages", async (req, res) => {
  try {
    const { city, code } = req.query;

    let sql = `SELECT p.id, p.name AS package_name, p.price, p.imageUrl, c.city_name, c.city_code FROM packages p JOIN cities c ON p.city_id = c.id`;
    const params = [];

    if (city) {
      sql += " WHERE c.city_name = ?";
      params.push(city);
    } else if (code) {
      sql += " WHERE c.city_code = ?";
      params.push(code);
    }

    const [results] = await pool.execute(sql, params);
    res.json(results);
  } catch (err) {
    console.error("Error fetching packages:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/packages/:id
app.get("/api/packages/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    const sql = `SELECT p.*, c.city_name, c.city_code FROM packages p LEFT JOIN cities c ON p.city_id = c.id WHERE p.id = ?`;
    const [results] = await pool.execute(sql, [id]);
    
    if (results.length === 0) {
      return res.status(404).json({ error: "Package not found" });
    }
    res.json(results[0]);
  } catch (err) {
    console.error("Error fetching package:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/packages
app.post("/api/packages", async (req, res) => {
  const { 
    name, 
    city_id, 
    trip_code, 
    description, 
    price, 
    imageUrl, 
    duration, 
    max_participants, 
    is_active 
  } = req.body;

  try {
    const sql = `INSERT INTO packages (name, city_id, trip_code, description, price, imageUrl, duration, max_participants, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;

    const [result] = await pool.execute(sql, [
      name, city_id, trip_code, description, price, imageUrl, duration, max_participants, is_active || 1
    ]);

    res.status(201).json({ 
      message: "Package created successfully",
      id: result.insertId 
    });
  } catch (err) {
    console.error("Error creating package:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/packages/:id
app.put("/api/packages/:id", async (req, res) => {
  const { id } = req.params;
  const { 
    name, 
    city_id, 
    trip_code, 
    description, 
    price, 
    imageUrl, 
    duration, 
    max_participants, 
    is_active 
  } = req.body;

  try {
    const sql = `UPDATE packages SET name = ?, city_id = ?, trip_code = ?, description = ?, price = ?, imageUrl = ?, duration = ?, max_participants = ?, is_active = ?, updated_at = NOW() WHERE id = ?`;

    const [result] = await pool.execute(sql, [
      name, city_id, trip_code, description, price, imageUrl, duration, max_participants, is_active, id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Package not found" });
    }
    res.json({ message: "Package updated successfully" });
  } catch (err) {
    console.error("Error updating package:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/packages/:id
app.delete("/api/packages/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    const sql = "DELETE FROM packages WHERE id = ?";
    const [result] = await pool.execute(sql, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Package not found" });
    }
    res.json({ message: "Package deleted successfully" });
  } catch (err) {
    console.error("Error deleting package:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ambil daftar kota
app.get("/api/cities", async (req, res) => {
  try {
    const sql = "SELECT id, city_name, city_code FROM cities";
    const [results] = await pool.execute(sql);
    res.json(results);
  } catch (err) {
    console.error("Error fetching cities:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------ TRANSACTIONS ENDPOINTS ------------------

app.post("/api/transactions", async (req, res) => {
  const { bookingDbId, payment_type, amount_paid, payment_method, va_number } = req.body;
  
  if (!bookingDbId || !payment_type || amount_paid == null) {
    return res.status(400).json({ success: false, message: "Data transaksi tidak lengkap." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const insertTransactionSql = `INSERT INTO transactions (booking_id, payment_type, amount_paid, payment_method, va_number, created_at) VALUES (?, ?, ?, ?, ?, NOW())`;
    
    await connection.execute(insertTransactionSql, [
      bookingDbId,
      payment_type,
      amount_paid,
      payment_method || null,
      va_number || null,
    ]);

    const newStatus = payment_type === "dp" ? "dp_lunas" : "selesai";
    const updateBookingSql = "UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?";
    
    await connection.execute(updateBookingSql, [newStatus, bookingDbId]);

    await connection.commit();
    
    return res.status(201).json({
      success: true,
      message: "Pembayaran berhasil dicatat!",
      status: newStatus,
    });
  } catch (err) {
    await connection.rollback();
    console.error("❌ Error processing transaction:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan transaksi.",
    });
  } finally {
    connection.release();
  }
});

// ------------------ SCANNER ENDPOINTS ------------------

app.post("/api/bookings/scan", async (req, res) => {
  const { participantId } = req.body;
  
  if (!participantId) {
    return res.status(400).json({ success: false, message: "ID Peserta tidak boleh kosong." });
  }

  try {
    const findSql = "SELECT * FROM participants WHERE id = ?";
    const [results] = await pool.execute(findSql, [participantId]);
    
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "TIKET TIDAK DITEMUKAN" });
    }

    const participant = results[0];
    
    if (participant.status === "sudah_digunakan") {
      return res.status(409).json({
        success: false,
        message: "TIKET SUDAH DIGUNAKAN",
        name: participant.name,
      });
    }
    
    if (participant.status === "hangus") {
      return res.status(410).json({
        success: false,
        message: "TIKET HANGUS/BATAL",
        name: participant.name,
      });
    }

    if (participant.status === "valid") {
      const updateSql = "UPDATE participants SET status = 'sudah_digunakan', scanned_at = NOW() WHERE id = ?";
      await pool.execute(updateSql, [participantId]);
      
      return res.status(200).json({
        success: true,
        message: "VALIDASI BERHASIL",
        name: participant.name,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Status tiket tidak valid untuk check-in.",
      });
    }
  } catch (err) {
    console.error("❌ Error scanning ticket:", err);
    res.status(500).json({ success: false, message: "Kesalahan server." });
  }
});

// ------------------ USERS ENDPOINTS ------------------

// GET /api/users
app.get("/api/users", async (req, res) => {
  try {
    const [results] = await pool.execute(
      "SELECT id, username, full_name, email, created_at FROM users"
    );
    res.status(200).json({ success: true, data: results });
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ success: false, message: "Kesalahan server." });
  }
});

// POST /api/users
app.post("/api/users", async (req, res) => {
  const { username, password, full_name, email } = req.body;
  
  if (!username || !password || !full_name || !email) {
    return res.status(400).json({ success: false, message: "Semua field wajib diisi." });
  }

  try {
    const hash = await bcrypt.hash(password, saltRounds);
    const sql = "INSERT INTO users (username, password, full_name, email) VALUES (?, ?, ?, ?)";
    
    await pool.execute(sql, [username, hash, full_name, email]);
    res.status(201).json({ success: true, message: "User berhasil dibuat!" });
  } catch (err) {
    console.error("❌ Error creating user:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Username atau Email sudah digunakan.",
      });
    }
    res.status(500).json({ success: false, message: "Gagal menambahkan user." });
  }
});

// POST /api/users/login
app.post("/api/users/login", async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
  }

  try {
    const sql = "SELECT * FROM users WHERE username = ? LIMIT 1";
    const [results] = await pool.execute(sql, [username]);
    
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan." });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Password salah." });
    }

    res.status(200).json({
      success: true,
      message: "Login berhasil!",
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("❌ Error during login:", err);
    res.status(500).json({ success: false, message: "Kesalahan server." });
  }
});

// ================== API PESERTA ==================
app.post("/api/peserta", async (req, res) => {
  const {
    nama,
    alamat,
    tempat_lahir,
    tanggal_lahir,
    telepon,
    tujuan
  } = req.body;

  const tanggal = new Date().toISOString().split("T")[0];

  try {
    const sql = `
      INSERT INTO peserta 
      (nama, alamat, tempat_lahir, tanggal_lahir, telepon, tujuan, tanggal) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute(sql, [
      nama || null,
      alamat || null,
      tempat_lahir || null,
      tanggal_lahir || null,
      telepon || null,
      tujuan || null,
      tanggal
    ]);

    res.status(201).json({
      message: "Data peserta berhasil disimpan",
      id: result.insertId
    });
  } catch (err) {
    console.error("Error saving peserta:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================== API MARKETING ==================
app.post("/api/marketing", upload.single("foto_kunjungan"), async (req, res) => {
  const {
    nama,
    alamat,
    perusahaan,
    nama_kordinator,
    kota_kordinator,
    rencana_wisata,
    rencana_pemberangkatan,
    destinasi_tujuan,
    jenis_trip,
    telepon,
    catatan
  } = req.body;

  
  if (!alamat) {
    return res.status(400).json({ error: "Field 'alamat' wajib diisi" });
  }
  const tanggal = new Date().toISOString().split("T")[0];
  const foto_kunjungan = req.file ? req.file.filename : null;

  try {
    const sql = `
      INSERT INTO marketing 
      (tanggal, nama, alamat, perusahaan, nama_kordinator, kota_kordinator, 
       rencana_wisata, rencana_pemberangkatan, destinasi_tujuan, jenis_trip, 
       telepon, foto_kunjungan, catatan) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute(sql, [
      tanggal,
      nama || null,
      alamat || null,
      perusahaan || null,
      nama_kordinator || null,
      kota_kordinator || null,
      rencana_wisata || null,
      rencana_pemberangkatan || null,
      destinasi_tujuan || null,
      jenis_trip || null,
      telepon || null,
      foto_kunjungan || null,
      catatan || null
    ]);

    res.status(201).json({
      message: "Data marketing berhasil disimpan",
      id: result.insertId
    });
  } catch (err) {
    console.error("Error saving marketing:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================== API UPDATE PESERTA ==================
app.put("/api/admin/peserta/:id", async (req, res) => {
  const { id } = req.params;
  const {
    nama,
    alamat,
    tempat_lahir,
    tanggal_lahir,
    telepon,
    tujuan
  } = req.body;

  try {
    const sql = `
      UPDATE peserta 
      SET nama = ?, alamat = ?, tempat_lahir = ?, tanggal_lahir = ?, telepon = ?, tujuan = ?
      WHERE id = ?
    `;

    const [result] = await pool.execute(sql, [
      nama || null,
      alamat || null,
      tempat_lahir || null,
      tanggal_lahir || null,
      telepon || null,
      tujuan || null,
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Data peserta tidak ditemukan" });
    }

    res.json({ message: "Data peserta berhasil diupdate" });
  } catch (err) {
    console.error("Error updating peserta:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================== API UPDATE MARKETING ==================
app.put("/api/admin/marketing/:id", upload.single("foto_kunjungan"), async (req, res) => {
  const { id } = req.params;
  const {
    nama,
    perusahaan,
    alamat,
    nama_kordinator,
    kota_kordinator,
    rencana_wisata,
    rencana_pemberangkatan,
    destinasi_tujuan,
    jenis_trip,
    telepon,
    catatan
  } = req.body;

  try {
    let sql, params;

    if (req.file) {
      const foto_kunjungan = req.file.filename;
      sql = `
        UPDATE marketing 
        SET nama = ?, perusahaan = ?, alamat = ?, nama_kordinator = ?, kota_kordinator = ?,
            rencana_wisata = ?, rencana_pemberangkatan = ?, destinasi_tujuan = ?,
            jenis_trip = ?, telepon = ?, foto_kunjungan = ?, catatan = ?
        WHERE id = ?
      `;
      params = [
        nama || null,
        perusahaan || null,
        alamat || null,
        nama_kordinator || null,
        kota_kordinator || null,
        rencana_wisata || null,
        rencana_pemberangkatan || null,
        destinasi_tujuan || null,
        jenis_trip || null,
        telepon || null,
        foto_kunjungan || null,
        catatan || null,
        id
      ];
    } else {
      sql = `
        UPDATE marketing 
        SET nama = ?, perusahaan = ?, alamat = ?, nama_kordinator = ?, kota_kordinator = ?,
            rencana_wisata = ?, rencana_pemberangkatan = ?, destinasi_tujuan = ?,
            jenis_trip = ?, telepon = ?, catatan = ?
        WHERE id = ?
      `;
      params = [
        nama || null,
        perusahaan || null,
        alamat || null,
        nama_kordinator || null,
        kota_kordinator || null,
        rencana_wisata || null,
        rencana_pemberangkatan || null,
        destinasi_tujuan || null,
        jenis_trip || null,
        telepon || null,
        catatan || null,
        id
      ];
    }

    const [result] = await pool.execute(sql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Data marketing tidak ditemukan" });
    }

    res.json({ message: "Data marketing berhasil diupdate" });
  } catch (err) {
    console.error("Error updating marketing:", err);
    res.status(500).json({ error: err.message });
  }
});


// ------------------ ERROR HANDLING ------------------

// Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 Global Error Handler:", err.stack);
  res.status(500).json({ 
    success: false, 
    message: "Internal Server Error",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: "Endpoint tidak ditemukan",
    path: req.originalUrl
  });
});

// ------------------ SERVER LISTEN ------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Server URL: http://localhost:${PORT}`);
});

