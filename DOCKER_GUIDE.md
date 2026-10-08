# Hướng Dẫn Vận Hành Hệ Thống LWB với Docker & Docker Compose

Tài liệu hướng dẫn triển khai và vận hành hệ thống **LWB (Low-power Wireless Bus) Telemetry & Monitoring** bao gồm Backend (Django REST Framework), Background Worker (MQTT Consumer), Database (PostgreSQL) và Frontend (React + Vite).

---

## 1. Kiến Trúc Hệ Thống (Architecture Topology)

Hệ thống được module hóa thành 4 services chính trong mạng Docker:

```
                  ┌──────────────────────┐
                  │ EMQX Broker (Cloud)  │ (hoặc local-mqtt)
                  │   port 8883 (TLS)    │
                  └──────────┬───────────┘
                             │
                             ▼ (MQTT Telemetry)
┌──────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│   Frontend   │────▶│    Django Backend    │────▶│      PostgreSQL      │
│ (React/Vite) │     │ (Web API :8000/api)  │     │       (Port 5432)    │
└──────────────┘     └──────────────────────┘     └──────────▲───────────┘
                             ▲                               │ (Store Sensor Data)
                             └────── mqtt-consumer ──────────┘
                                (Background Worker)
```

1. **`db` (PostgreSQL 16 Alpine)**: Lưu trữ cơ sở dữ liệu Gateway, Node, SensorReading. Tích hợp healthcheck tự động.
2. **`backend` (Django API)**: Cung cấp API endpoints cho Frontend/Admin. Tự động chạy migration khi khởi động.
3. **`mqtt-consumer` (Background Worker)**: Tái sử dụng image backend, chạy command `python manage.py mqtt_consumer`, lắng nghe dữ liệu từ EMQX và nạp vào DB.
4. **`frontend` (React + Vite)**: Web UI hiển thị dữ liệu giám sát.
5. **`emqx` (Tùy chọn - Profile: local-mqtt)**: Dành cho môi trường offline/local test.

---

## 2. Các File Cấu Hình Docker Đã Thiết Lập

- [Dockerfile](file:///d:/chuongngu/lwb-backend/Dockerfile): Dockerfile cho Django Backend & MQTT Consumer (Python 3.12-slim, tích hợp `ca-certificates` cho kết nối TLS).
- [docker-compose.yml](file:///d:/chuongngu/lwb-backend/docker-compose.yml): Môi trường **Development** (hỗ trợ Live-reload/Hot Module Replacement cho cả code Python và React).
- [docker-compose.prod.yml](file:///d:/chuongngu/lwb-backend/docker-compose.prod.yml): Môi trường **Production** (Backend chạy qua WSGI Gunicorn, Frontend build tối ưu phục vụ qua Nginx Reverse Proxy).
- [requirements.txt](file:///d:/chuongngu/lwb-backend/requirements.txt): Khóa chính xác các dependencies (Django 6.1.2, DRF, Psycopg 3, Paho-MQTT, Gunicorn,...).
- [entrypoint.sh](file:///d:/chuongngu/lwb-backend/entrypoint.sh): Script khởi tạo tự động chạy `python manage.py migrate --noinput` trước khi start server/worker.
- [frontend/Dockerfile](file:///d:/chuongngu/lwb-backend/frontend/Dockerfile): Multi-stage Dockerfile cho Frontend (Target dev & Target prod).
- [frontend/nginx.conf](file:///d:/chuongngu/lwb-backend/frontend/nginx.conf): Cấu hình Nginx reverse proxy cho production.
- [.env.example](file:///d:/chuongngu/lwb-backend/.env.example): Template mẫu biến môi trường.

---

## 3. Hướng Dẫn Khởi Chạy

### A. Môi trường Phát triển (Development)
Chạy stack với chế độ Hot-reload:
```bash
docker compose up -d --build
```

Kiểm tra trạng thái các container:
```bash
docker compose ps
```

Truy cập:
- **Backend API**: `http://localhost:8000/api/nodes/`
- **Django Admin**: `http://localhost:8000/admin/`
- **Frontend App**: `http://localhost:5173`

---

### B. Môi trường Production
Chạy stack tối ưu hóa với Gunicorn và Nginx:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Truy cập:
- **Production Web & API**: `http://localhost:3000` (Nginx tự động reverse proxy `/api/` về Gunicorn backend)

---

### C. Môi trường Offline / Test với Local MQTT Broker
Nếu không sử dụng EMQX Cloud, bạn có thể khởi chạy broker EMQX local:
```bash
docker compose --profile local-mqtt up -d
```
- Dashboard EMQX: `http://localhost:18083` (Tài khoản mặc định: `admin` / `public`)
- Khi đó trong `.env` chỉ cần sửa:
  ```env
  MQTT_HOST=emqx
  MQTT_PORT=1883
  ```

---

## 4. Các Lệnh Vận Hành Thường Dùng (Cheatsheet)

| Tác vụ | Câu lệnh |
| :--- | :--- |
| **Xem logs thời gian thực của worker MQTT** | `docker compose logs -f mqtt-consumer` |
| **Xem logs toàn bộ hệ thống** | `docker compose logs -f` |
| **Tạo tài khoản quản trị Django (Superuser)** | `docker compose exec backend python manage.py createsuperuser` |
| **Tạo migration mới khi sửa model** | `docker compose exec backend python manage.py makemigrations` |
| **Truy cập terminal của Backend** | `docker compose exec backend bash` |
| **Truy cập cơ sở dữ liệu PostgreSQL CLI** | `docker compose exec db psql -U lwb_user -d lwb_monitoring` |
| **Dừng hệ thống** | `docker compose down` |
| **Dừng và xóa toàn bộ dữ liệu database volume** | `docker compose down -v` |
