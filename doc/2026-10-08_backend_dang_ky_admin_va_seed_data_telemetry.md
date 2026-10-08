# Báo Cáo Thay Đổi Backend - Đăng Ký Django Admin & Bổ Sung Seed Data Telemetry

- **Ngày thực hiện:** 08/10/2026
- **Đối tượng:** Thư mục `lwb-backend` (Django Backend & Telemetry App)
- **Người thực hiện:** Senior Architect / Pair Programmer
- **Trạng thái:** Hoàn thành & Đã kiểm thử trực tiếp trên container `lwb-backend`

---

## 1. Lý Do Thay Đổi (Why)

1. **Khắc phục tình trạng "Backend trống rỗng, không thấy gì hết":**
   - **Tệp `telemetry/admin.py` bị bỏ trống hoàn toàn:** Dù hệ thống đã định nghĩa các models quan trọng (`Gateway`, `Node`, `SensorReading`), nhưng chưa đăng ký bất kỳ model nào vào Django Admin. Do đó, khi người dùng đăng nhập tài khoản admin `quang` tại `http://localhost:8000/admin/`, giao diện chỉ hiển thị `Groups` và `Users`, hoàn toàn không thấy các bảng dữ liệu của dự án.
   - **Cơ sở dữ liệu PostgreSQL ban đầu có 0 bản ghi:** Vì ngoài hiện trường chưa có sensor thật phát gói tin MQTT lên broker EMQX, các bảng `telemetry_gateway`, `telemetry_node`, `telemetry_sensorreading` đều có số lượng bản ghi = 0. Khi gọi `GET /api/nodes/`, API chỉ trả về `[]`, tạo cảm giác backend chưa hoạt động.
2. **Cung cấp công cụ kiểm thử dữ liệu cục bộ (Local Developer Experience):**
   - Lập trình viên và Tester cần một công cụ khởi tạo dữ liệu mẫu (Seeder) thực tế để kiểm tra biểu đồ, phân tích API và giao diện quản trị mà không phải phụ thuộc vào việc bật thiết bị phần cứng thật.

---

## 2. Chi Tiết Nội Dung Thay Đổi (What)

### A. Tệp [telemetry/admin.py](file:///d:/chuongngu/lwb-backend/telemetry/admin.py)
Đăng ký toàn bộ 3 models của dự án vào Django Admin với cấu hình hiển thị cao cấp:
- **`GatewayAdmin`**:
  - `list_display`: `gateway_id`, `last_seen`, `created_at`.
  - Tìm kiếm theo `gateway_id`, sắp xếp theo `last_seen` mới nhất.
- **`NodeAdmin`**:
  - `list_display`: `node_id`, `gateway`, `last_seen`, `created_at`.
  - Bộ lọc (Filter) theo Gateway, tìm kiếm theo `node_id` và `gateway_id`.
- **`SensorReadingAdmin`**:
  - `list_display`: `event_id`, `node`, `gateway`, `seq`, `display_hdc_temp`, `display_humidity`, `display_bmp_temp`, `pressure_pa`, `light_raw`, `recv_ts_utc`.
  - Định dạng hiển thị trực quan kèm đơn vị vật lý: `°C`, `%`, `Pa`.
  - Bộ lọc đa chiều: Lọc theo Gateway, Node, thời gian nhận gói tin `recv_ts_utc`.
  - `readonly_fields`: Bảo vệ tính toàn vẹn của dữ liệu chuỗi thời gian.

### B. Tệp [telemetry/management/commands/seed_telemetry.py](file:///d:/chuongngu/lwb-backend/telemetry/management/commands/seed_telemetry.py)
Tạo mới lệnh quản trị Django: `python manage.py seed_telemetry`
- Tự động kiểm tra hoặc khởi tạo Gateway: `GW-SITE1-01`.
- Tự động tạo 3 Node cảm biến: `Node #1`, `Node #2`, `Node #5`.
- Sinh chuỗi thời gian đo đạc thực tế (mặc định 25 - 30 bản ghi mỗi node, bước nhảy 10 giây):
  - Nhiệt độ HDC (24.0°C - 28.5°C).
  - Độ ẩm tương đối (52% - 65%).
  - Áp suất khí quyển BMP (101325 ± 40 Pa).
  - Cường độ ánh sáng (1800 - 2300 raw).
  - Lưu đầy đủ cấu trúc JSON `raw_payload` khớp 100% với định dạng gói tin MQTT của hệ thống.
- Tự động cập nhật trường `last_seen` trên Gateway và Node.

---

## 3. Đánh Giá Rủi Ro & Giải Pháp Phòng Ngừa (Risks & Mitigations)

| Rủi ro tiềm ẩn | Mức độ | Cơ chế phòng ngừa |
| :--- | :---: | :--- |
| **Xung đột khóa chính / trùng lặp event_id** | Thấp | Script sử dụng `event_id` tính toán dựa trên timestamp kết hợp `node_id`, đồng thời dùng `get_or_create` theo đúng ràng buộc `UniqueConstraint(fields=["gateway", "event_id"])`. |
| **Ảnh hưởng dữ liệu thật khi triển khai production** | Thấp | Lệnh `seed_telemetry` là lệnh thủ công (chỉ chạy khi developer gõ lệnh), không chạy tự động trong `entrypoint.sh`. |
| **Hiệu năng Django Admin khi bản ghi lớn** | Thấp | Đã đánh `search_fields` và `list_filter` dựa trên các trường có chỉ mục (indexed fields). |

---

## 4. Kết Quả Kiểm Thử Thực Tế

1. **Khởi tạo dữ liệu thành công:**
   ```bash
   docker compose exec backend python manage.py seed_telemetry --readings 25
   ```
   *Kết quả:* Tạo thành công Gateway `GW-SITE1-01`, 3 Nodes và 75 bản ghi đo đạc `SensorReading`.
2. **Kiểm tra API `GET /api/nodes/`:**
   Trả về 3 Nodes đang hoạt động với đầy đủ thông tin `last_seen`.
3. **Kiểm tra API `GET /api/nodes/1/latest/`:**
   Trả về bản ghi đo đạc mới nhất (HTTP 200 OK):
   ```json
   {"event_id":434551,"node_id":1,"seq":25,"recv_ts_utc":"2026-10-08T04:25:17Z","temperature_c":26.2,"humidity_percent":58.9,"light_raw":1963,"bmp_temperature_c":26.5,"pressure_pa":101322}
   ```
4. **Kiểm tra Django Admin:**
   Truy cập `http://localhost:8000/admin/`, đăng nhập với tài khoản `quang`. Module **Telemetry** xuất hiện đầy đủ với 3 bảng: **Gateways**, **Nodes**, **Sensor readings**.
