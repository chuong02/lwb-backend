# LWB (Low-power Wireless Bus) Telemetry & Monitoring System

Hệ thống thu thập, xử lý và giám sát dữ liệu chuỗi thời gian (time-series telemetry) từ mạng cảm biến không dây công suất thấp **LWB (Low-power Wireless Bus)** trong môi trường nhà kho và công nghiệp thông minh.

---

## 1. Tổng Quan Kiến Trúc (System Architecture)

Hệ thống được thiết kế theo kiến trúc **Event-Driven & Micro-services Containerized**, tách biệt giữa luồng nạp dữ liệu IoT thời gian thực (Ingestion Pipeline) và luồng cung cấp dịch vụ phân tích/trực quan hóa (Query & Dashboard).

```
   ┌────────────────────────────────────────────────────────┐
   │         LWB Sensor Nodes (Temperature, Humidity,       │
   │               Light, Atmospheric Pressure)             │
   └───────────────────────────┬────────────────────────────┘
                               │ (LWB Protocol)
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │             Edge Gateway (Site-1 / Warehouse)          │
   └───────────────────────────┬────────────────────────────┘
                               │ (JSON Payload / TLS Port 8883)
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │             EMQX MQTT Broker (Cloud / Local)           │
   │      Topic: warehouse/site1/lwb/nodes/+/telemetry      │
   └───────────────────────────┬────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │ (MQTT Subscriber)             │ (WebSocket / API)
               ▼                               ▼
   ┌───────────────────────────┐   ┌───────────────────────────┐
   │       MQTT Consumer       │   │      Django REST API      │
   │   (Background Worker)     │   │     (Web API & Admin)     │
   └─────────────┬─────────────┘   └─────────────▲─────────────┘
                 │ (Atomic Write)                │ (Query Data)
                 └───────────────┬───────────────┘
                                 ▼
                   ┌───────────────────────────┐
                   │    PostgreSQL Database    │
                   │    (Time-series Engine)   │
                   └───────────────────────────┘
                                 ▲
                                 │ (HTTP / JSON)
                   ┌─────────────┴─────────────┐
                   │      Frontend Client      │
                   │    (React 19 + Vite 8)    │
                   └───────────────────────────┘
```

### Các Thành Phần Cốt Lõi:
1. **IoT Ingestion Worker (`mqtt-consumer`)**:
   - Sử dụng `Paho-MQTT v2` chạy ngầm thông qua Django Custom Command.
   - Đảm bảo tính nhất quán dữ liệu (Data Integrity) qua giao dịch nguyên tử (`@transaction.atomic`).
   - Cơ chế Deduplication (khử trùng lặp) dữ liệu nhờ cặp khóa `(gateway_id, event_id)`.
2. **Application Server (`backend`)**:
   - Xây dựng trên nền tảng **Django 6.1.2** và **Django REST Framework (DRF)**.
   - Cung cấp RESTful APIs cho Frontend truy vấn dữ liệu đo đạc mới nhất và lịch sử chuỗi thời gian.
   - Tích hợp **Django Admin** phục vụ quản trị Gateway và Node thiết bị.
3. **Database Engine (`db`)**:
   - **PostgreSQL 16 Alpine** lưu trữ quan hệ có cấu trúc và trường linh hoạt `JSONField` (lưu lại payload gốc phục vụ kiểm toán hệ thống).
4. **User Interface (`frontend`)**:
   - Xây dựng bằng **React 19**, **Vite 8**, kết hợp thư viện biểu đồ **Recharts** để trực quan hóa biến thiên môi trường.

---

## 2. Mô Hình Dữ Liệu (Domain Models & Database Schema)

Hệ thống được thiết kế theo 3 tầng quan hệ logic:

```
[Gateway] 1 ──── N [Node] 1 ──── N [SensorReading]
```

### Chi tiết các Models ([telemetry/models.py](file:///d:/chuongngu/lwb-backend/telemetry/models.py)):

| Model | Mô tả | Các trường quan trọng & Ràng buộc |
| :--- | :--- | :--- |
| **`Gateway`** | Đại diện cho thiết bị trung tâm thu thập dữ liệu tại hiện trường | `gateway_id` (Unique, indexed), `last_seen`, `created_at` |
| **`Node`** | Đại diện cho từng node cảm biến không dây trong mạng LWB | `node_id` (Positive Integer), `gateway` (FK), `last_seen`. **UniqueConstraint:** `[gateway, node_id]` |
| **`SensorReading`** | Bản ghi dữ liệu đo đạc theo thời gian | `event_id`, `seq`, `recv_ts_utc`, `host_time`, `hdc_temp_x10`, `hdc_hum_x10`, `light_raw`, `bmp_temp_x10`, `pressure_pa`, `raw_payload`. **UniqueConstraint:** `[gateway, event_id]` |

#### Thuộc tính chuyển đổi vật lý (Computed Properties):
- `hdc_temp_c`: Nhiệt độ cảm biến HDC tính theo độ C (`hdc_temp_x10 / 10.0`).
- `humidity_percent`: Độ ẩm tương đối tính theo % (`hdc_hum_x10 / 10.0`).
- `bmp_temp_c`: Nhiệt độ cảm biến áp suất BMP tính theo độ C (`bmp_temp_x10 / 10.0`).

---

## 3. Định Dạng Dữ Liệu Đo Xa (MQTT Telemetry Payload Contract)

Mỗi gói tin cảm biến được gửi lên broker theo định dạng JSON chuẩn:

- **Topic Pattern**: `warehouse/site1/lwb/nodes/{node_id}/telemetry`
- **Ví dụ Payload**:
  ```json
  {
    "record_type": "SENSOR_DATA",
    "gateway_id": "GW-SITE1-01",
    "event_id": 104231,
    "source": 5,
    "seq": 892,
    "recv_ts_utc": "2026-10-08T03:59:16Z",
    "data": {
      "time": 1728359956,
      "hdc_temp_x10": 268,
      "hdc_hum_x10": 634,
      "light_raw": 1920,
      "bmp_temp_x10": 270,
      "pressure_pa": 101290
    }
  }
  ```

---

## 4. Tài Liệu API Endpoints (RESTful API Contract)

Base URL mặc định: `http://localhost:8000/api/`

### 1. Danh sách Nodes trong hệ thống
- **Method**: `GET`
- **Endpoint**: `/api/nodes/`
- **Response**:
  ```json
  [
    {
      "id": 1,
      "gateway": 1,
      "gateway_id": "GW-SITE1-01",
      "node_id": 5,
      "last_seen": "2026-10-08T03:59:16Z",
      "created_at": "2026-10-08T03:00:00Z"
    }
  ]
  ```

### 2. Bản ghi mới nhất của Node
- **Method**: `GET`
- **Endpoint**: `/api/nodes/{node_id}/latest/`
- **Response (200 OK)**:
  ```json
  {
    "id": 245,
    "gateway_id": "GW-SITE1-01",
    "node_id": 5,
    "event_id": 104231,
    "seq": 892,
    "recv_ts_utc": "2026-10-08T03:59:16Z",
    "host_time": 1728359956,
    "hdc_temp_c": 26.8,
    "humidity_percent": 63.4,
    "light_raw": 1920,
    "bmp_temp_c": 27.0,
    "pressure_pa": 101290
  }
  ```
- **Response (404 Not Found)**: `{"detail": "No data"}`

### 3. Lịch sử đo đạc của Node
- **Method**: `GET`
- **Endpoint**: `/api/nodes/{node_id}/history/?limit=100`
- **Query Params**:
  - `limit` (int, default: 100, max: 1000): Số lượng bản ghi cần lấy.

---

## 5. Cấu Trúc Thư Mục Dự Án (Project Structure)

```
lwb-backend/
├── config/                      # Thiết lập dự án Django (Settings, ASGI, WSGI, URLs)
│   ├── settings.py              # Đọc động biến môi trường .env
│   ├── urls.py
│   └── wsgi.py
├── telemetry/                   # Django App nghiệp vụ telemetry
│   ├── management/commands/
│   │   └── mqtt_consumer.py     # Worker ngầm kết nối EMQX MQTT
│   ├── migrations/              # Cơ sở dữ liệu migrations
│   ├── models.py                # Schema Gateway, Node, SensorReading
│   ├── serializers.py           # DRF Serializers
│   ├── views.py                 # API Viewsets & Controllers
│   └── urls.py                  # Định tuyến API
├── frontend/                    # Ứng dụng React + Vite
│   ├── src/                     # Mã nguồn giao diện & biểu đồ
│   ├── Dockerfile               # Multi-stage build cho Frontend
│   ├── nginx.conf               # Cấu hình Nginx Reverse Proxy
│   └── vite.config.js           # Cấu hình Vite host & API proxy
├── Dockerfile                   # Dockerfile cho Backend & MQTT Worker
├── entrypoint.sh                # Shell script tự động migrate DB trước khi khởi động
├── docker-compose.yml           # Stack chạy Development (Hot-reload)
├── docker-compose.prod.yml      # Stack chạy Production (Gunicorn + Nginx)
├── requirements.txt             # Danh sách dependencies chuẩn
├── DOCKER_GUIDE.md              # Sổ tay hướng dẫn chi tiết vận hành Docker
├── .env.example                 # Mẫu khai báo biến môi trường
└── manage.py
```

---

## 6. Hướng Dẫn Vận Hành (Getting Started)

### Yêu cầu tiên quyết:
- Docker Engine >= 24.0 và Docker Compose v2.

### Bước 1: Chuẩn bị biến môi trường
Tạo file `.env` từ file mẫu:
```bash
cp .env.example .env
```
Cấu hình các thông số kết nối cơ sở dữ liệu và thông tin xác thực MQTT broker.

### Bước 2: Khởi động hệ thống Development
```bash
docker compose up -d --build
```
Hệ thống sẽ tự động:
1. Khởi động PostgreSQL 16 và thực hiện healthcheck.
2. Build image backend Python 3.12-slim.
3. Tự động áp dụng database migrations.
4. Chạy Django Development Server tại cổng `8000`.
5. Chạy MQTT Consumer Worker kết nối EMQX broker.
6. Chạy Vite Dev Server tại cổng `5173`.

### Bước 3: Kiểm tra trạng thái
```bash
# Xem trạng thái container
docker compose ps

# Theo dõi logs của MQTT worker
docker compose logs -f mqtt-consumer

# Theo dõi logs của backend API
docker compose logs -f backend
```

### Bước 4: Tạo tài khoản quản trị Django (Superuser)
```bash
docker compose exec backend python manage.py createsuperuser
```
Truy cập giao diện quản trị tại: `http://localhost:8000/admin/`

---

## 7. Triển Khai Production (Production Deployment)

Khởi chạy stack tối ưu hóa tài nguyên:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
- **Backend API**: Chạy qua WSGI Server **Gunicorn** với 3 workers độc lập.
- **Frontend & Routing**: Phục vụ qua **Nginx Alpine** tại cổng `3000`, tự động reverse proxy đường dẫn `/api/` về Gunicorn backend, loại bỏ hoàn toàn vấn đề CORS giữa các domain.

---

## 8. Giấy phép & Tác quyền (License)
Phát triển bởi nhóm nghiên cứu & kỹ thuật LWB Monitoring.
