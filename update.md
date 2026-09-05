# WhatsApp Blast Platform - Dashboard Update

## 🎯 Objective

**UPDATE PROJECT YANG SUDAH ADA** - Hapus menu Campaign, update menu Target Nomor di Admin, dan update menu Device di User dengan fitur blast.

---

## 📋 Perubahan yang Dibutuhkan

### 1. Hapus Menu Campaign

**HAPUS menu Campaign dari:**
- ❌ Admin sidebar
- ❌ User sidebar

---

### 2. Update Admin - Menu Target Nomor

**Lokasi:** Menu Target Nomor (yang sudah ada di admin)

**Fitur yang DITAMBAHKAN:**

1. **Integrasi Baileys Settings**
   - Toggle/Wizard untuk set tipe pesan:
     - Button message
     - Message with image
     - Text only message
   - Upload image untuk message dengan gambar

2. **Speed Blast Configuration**
   - Input untuk delay/kecepatan kirim pesan per nomor
   - Options: 1, 3, 6, 10 detik (atau custom input)
   - Default value configurable

3. **Target Number Management**
   - Upload bulk nomor (CSV/TXT)
   - Manual add nomor satu per satu
   - Edit/delete nomor
   - Status: Pending, Sent, Error

4. **Alokasi Nomor ke User**
   - Assign nomor ke user tertentu
   - Set jumlah nomor per user
   - View alokasi per user

5. **Campaign Stats**
   - Total nomor uploaded
   - Total nomor allocated
   - Total nomor remaining
   - Total sent, error, pending

---

### 3. Update User - Hapus Menu Blast

**HAPUS menu Blast dari user sidebar**

**User sidebar sekarang:**
- Home
- Device (updated dengan fitur blast)
- Wallet
- Profile

---

### 4. Update User - Menu Device

**Lokasi:** Menu Device (yang sudah ada di user)

**Fitur yang DITAMBAHKAN/DIUPDATE:**

1. **Alokasi Nomor Tersisa**
   - Display jumlah nomor yang dialokasikan ke user
   - Format: "Alokasi: X nomor tersisa"
   - Update real-time setelah blast

2. **Aksi Blast di Halaman Device**
   - **Bulk Blast Button**
     - Tombol "Blast All Devices" - kirim ke semua device terhubung
     - Kirim ke semua nomor yang di-alokasikan
   
   - **Single Device Blast**
     - Tombol "Blast" per device
     - Pilih device tertentu untuk blast
   
   - **Speed Options**
     - Pilih delay: 1, 3, 6, 10 detik
     - Atau custom input delay

3. **Status Blast Per Device**
   - Real-time monitoring:
     - ✅ Sukses
     - ❌ Error
     - ⏳ Pending
     - 📊 Progress (X/Y terkirim)
   - Per device connection

4. **Log Pengiriman**
   - Tabel: Timestamp, Device ID, Nomor, Status, Message
   - Filter by status (success/error/pending)
   - Auto-clear setelah 24 jam (server-side)

5. **Update QR Code / Pair Code Flow**

   **QR Code Tab:**
   - Jika user switch ke tab QR code → **langsung request session**
   - Auto-generate QR code tanpa input nomor dulu
   - User scan QR untuk connect
   
   **Pair Code Tab:**
   - Tetap seperti sebelumnya
   - User harus input nomor WhatsApp yang mau connect
   - Generate pair code setelah input nomor
   
   **Flow:**
   ```
   User klik Device → Connect → Default tab: Pair Code (input nomor)
                          → Switch tab QR → Auto request session & show QR
                          → Switch tab Pair → Input nomor → Generate pair code
   ```

6. **Max Device Connections**
   - Maksimal 5 device per user
   - Server-side validation
   - Auto-generate UUID unik per device
   - Format: `device-{user_id}-{uuid}`

7. **Status Koneksi**
   - 🟢 Connected
   - 🔴 Disconnected
   - 🟡 Connecting
   - ⚠️ Shadow Ban (auto disconnect & delete session)

---

## 🔧 Backend Changes

### Database/Schema

**Target Numbers Table:**
- Tambah field untuk Baileys config:
  - `message_type` (button/image/text)
  - `image_url` (untuk image message)
  - `button_config` (JSON untuk button message)
  - `blast_delay` (integer, detik)
- Tambah field untuk tracking:
  - `status` (pending/sent/error)
  - `allocated_to_user_id` (nullable, foreign key ke users)
  - `allocated_at` (timestamp)

**Devices Table:**
- Pastikan support max 5 connections
- Pastikan ada field UUID unik
- Pastikan ada field untuk tracking blast stats per device

**Blast Logs Table:**
- Track per device ID
- Include message type dan delay yang digunakan
- Auto-clear 24 jam (cron job/scheduler)

### Business Logic

**Admin Side:**
- Upload target numbers dengan config Baileys
- Set blast delay/speed global atau per nomor
- Allocate numbers ke user tertentu
- Track stats: total, allocated, remaining, sent, error

**User Side:**
- User tidak bisa create/edit target numbers (admin only)
- User hanya blast ke nomor yang di-alokasikan ke mereka
- Validasi max 5 devices per user
- Auto-generate UUID saat device connect
- QR code auto-request session saat tab aktif
- Pair code tetap require input nomor
- Auto-delete session pada shadow ban
- Auto-clear logs setelah 24 jam

**Gunakan pattern code yang sudah ada di project:**
- Controller/service structure yang existing
- Middleware authentication yang sudah ada
- Error handling pattern yang existing
- Database query pattern yang sudah ada

---

## 🎨 Frontend Changes

### Admin Side

**Target Nomor Page:**
- Tambah section "Baileys Configuration"
  - Radio/select untuk message type (button/image/text)
  - Upload image input (jika type = image)
  - Button config inputs (jika type = button)
  - Speed/delay input (1, 3, 6, 10 detik atau custom)
- Tambah section "Upload Numbers"
  - File upload (CSV/TXT)
  - Manual add form
- Tambah section "Allocate Numbers"
  - Select user
  - Input jumlah nomor
  - Button allocate
- Tambah stats cards:
  - Total uploaded
  - Total allocated
  - Total remaining
  - Total sent/error/pending

**Hapus menu Campaign dari admin sidebar**

### User Side

**Device Page:**
- Tambah card "Alokasi Nomor"
  - Display: "X nomor tersisa"
  - Progress bar allocated vs used
- Tambah section "Blast Actions"
  - Button "Blast All Devices" (bulk blast)
  - Button "Blast" per device (single blast)
  - Speed options selector (1, 3, 6, 10 detik)
- Tambah section "Blast Status"
  - Real-time progress per device
  - Success/error/pending counters
- Tambah section "Blast Logs"
  - Tabel dengan filter by status
  - Pagination jika banyak data
- Update QR/Pair Code Modal:
  - Default tab: Pair Code (input nomor)
  - Tab QR: Auto request session saat switch
  - Tab Pair: Input nomor → generate pair code
  - Smooth transition antar tab

**Hapus menu Blast dari user sidebar**

### UI/UX

- **Menyesuaikan dengan design yang sudah ada di project**
- Reuse components dari `components/` folder
- Ikuti styling dan theme yang existing
- Maintain responsive behavior yang sudah ada
- Gunakan animation pattern yang existing

---

## ✅ Checklist Implementasi

### Backend

**Target Numbers:**
- [ ] Tambah field Baileys config di database (message_type, image_url, button_config, blast_delay)
- [ ] Tambah field allocation (allocated_to_user_id, allocated_at)
- [ ] Tambah field status tracking (status: pending/sent/error)
- [ ] Update upload logic untuk support Baileys config
- [ ] Update allocate logic untuk assign ke user

**Devices:**
- [ ] Update validasi max device dari 4 ke 5
- [ ] Tambah auto-generate UUID saat device connect
- [ ] Update QR code flow: auto-request session saat tab aktif
- [ ] Maintain pair code flow: input nomor → generate pair code
- [ ] Tambah shadow ban detection & auto disconnect

**Blast Logic:**
- [ ] Update blast untuk track per device ID
- [ ] Support bulk blast (all devices) dan single blast (per device)
- [ ] Implementasi speed/delay options (1, 3, 6, 10 detik)
- [ ] Tambah auto-clear log 24 jam (cron job/scheduler)
- [ ] Update real-time status tracking (WebSocket/SSE)

**Cleanup:**
- [ ] Hapus routes Campaign untuk admin
- [ ] Hapus routes Campaign untuk user
- [ ] Hapus routes Blast untuk user (pindah ke Device)

### Frontend

**Admin:**
- [ ] Hapus menu Campaign dari sidebar
- [ ] Update halaman Target Nomor dengan Baileys config
- [ ] Tambah upload section dengan file upload + manual add
- [ ] Tambah allocate section (select user + input jumlah)
- [ ] Tambah stats cards (total, allocated, remaining, sent, error)
- [ ] Tambah speed/delay input options

**User:**
- [ ] Hapus menu Blast dari sidebar
- [ ] Update halaman Device dengan card "Alokasi Nomor"
- [ ] Tambah section "Blast Actions" (bulk + single blast)
- [ ] Tambah speed options selector
- [ ] Tambah section "Blast Status" real-time
- [ ] Tambah section "Blast Logs" dengan filter
- [ ] Update QR/Pair Code modal:
  - [ ] Default tab: Pair Code (input nomor)
  - [ ] Tab QR: Auto request session saat switch
  - [ ] Tab Pair: Input nomor → generate pair code
- [ ] Pastikan UI/UX konsisten dengan existing design

### Testing

- [ ] Test admin tidak bisa akses menu Campaign
- [ ] Test user tidak bisa akses menu Campaign dan Blast
- [ ] Test upload target numbers dengan Baileys config
- [ ] Test allocate numbers ke user
- [ ] Test max 5 devices validation
- [ ] Test bulk blast ke semua device
- [ ] Test single blast per device
- [ ] Test speed/delay options (1, 3, 6, 10 detik)
- [ ] Test real-time status updates
- [ ] Test log filtering
- [ ] Test QR code auto-request session
- [ ] Test pair code input nomor flow
- [ ] Test auto-generate UUID
- [ ] Test responsive design
- [ ] Test semua existing features tetap berjalan

---

## 📝 Notes

- **JANGAN ubah struktur folder yang sudah ada**
- **JANGAN buat design baru - adaptasi dari existing UI**
- **JANGAN buat API endpoint baru - gunakan yang sudah ada**
- **Reuse code pattern yang sudah ada di project**
- **Maintain backwards compatibility**
- **Test semua existing features tetap berjalan**

---

## 🚀 Deliverables

1. Backend updated dengan:
   - Target numbers dengan Baileys config
   - Allocation logic (admin → user)
   - Device max 5 connections dengan UUID
   - Blast logic (bulk + single) dengan speed options
   - Auto-clear logs 24 jam
   - Hapus semua routes Campaign

2. Frontend updated dengan:
   - Admin: Target nomor page dengan Baileys config + allocation
   - User: Device page dengan blast actions + alokasi nomor
   - Hapus menu Campaign (admin & user)
   - Hapus menu Blast (user)
   - QR/Pair code flow updated

3. Database migration untuk schema changes (jika perlu)

4. Testing manual untuk semua fitur baru