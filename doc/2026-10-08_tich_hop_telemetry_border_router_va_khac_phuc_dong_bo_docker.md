# Báo Cáo Kỹ Thuật - Tích Hợp Telemetry Gateway Border-Router & Khắc Phục Đồng Bộ Docker

- **Ngày thực hiện:** 08/10/2026
- **Đối tượng:** `lwb-backend` (MQTT Consumer, Data Normalization & Docker Configuration)
- **Người thực hiện:** Senior Architect / Pair Programmer
- **Trạng thái:** Hoàn thành, Đã kiểm thử luồng dữ liệu thực tế và Đã push lên nhánh `main`

---

## 1. Lý Do Thay Đổi (Why)

1. **Khắc phục lỗi bỏ sót gói tin thực tế từ Gateway Border-Router:**
   - **Hiện tượng:** Cảm biến phần cứng ngoài hiện trường đã gửi gói tin liên tục mỗi 5 giây lên Broker EMQX, nhưng container `lwb-mqtt-consumer` hoàn toàn không lưu bản ghi nào vào PostgreSQL và Frontend vẫn ở trạng thái chờ.
   - **Nguyên nhân cốt lõi (Record Type Mismatch):** Firmware của Gateway biên (`border-router`) gửi gói tin mang nhãn `"record_type": "LOCAL"`. Tuy nhiên, mã nguồn trước đó của [mqtt_consumer.py](file:///d:/chuongngu/lwb-backend/telemetry/management/commands/mqtt_consumer.py) lại áp đặt kiểm tra cứng:
     ```python
     if payload.get("record_type") != "SENSOR_DATA":
         return
     ```
     Điều này khiến mọi gói tin thật gửi từ Gateway biên bị âm thầm loại bỏ (`return`) ngay tại cổng vào.

2. **Xử lý mã lỗi tràn bit từ cảm biến phần cứng chưa đấu nối:**
   - Khi mạch phần cứng chưa cắm module BMP280 hoặc cảm biến ánh sáng bị bão hòa, vi điều khiển gửi các giá trị mã lỗi đặc thù:
     - Nhiệt độ BMP: `-32768` (0x8000 trong số nguyên 16-bit).
     - Áp suất: `-2147483648` (0x80000000 trong số nguyên có dấu 32-bit).
     - Ánh sáng: `65535` (0xFFFF).
   - Nếu không khử các giá trị này, giao diện người dùng sẽ hiển thị số âm bất thường (ví dụ: `-3276.8 °C` hoặc `-21474836.48 hPa`), làm sai lệch biểu đồ theo dõi.

3. **Khắc phục xung đột cấu hình môi trường Docker sau khi merge Git:**
   - Trong quá trình merge mã nguồn, tệp [config/settings.py](file:///d:/chuongngu/lwb-backend/config/settings.py) bị gán cứng `ALLOWED_HOSTS = []` và `DB_HOST = "127.0.0.1"`, đồng thời [frontend/vite.config.js](file:///d:/chuongngu/lwb-backend/frontend/vite.config.js) bị trỏ sang `http://127.0.0.1:8000`.
   - Trong mạng Docker, `127.0.0.1` đại diện cho chính container đó, dẫn đến lỗi `Connection refused` khi kết nối DB và lỗi `400 Bad Request (DisallowedHost: 'backend:8000')` khi Frontend gọi qua reverse proxy.

---

## 2. Chi Tiết Nội Dung Thay Đổi (What)

### A. Backend MQTT Consumer: [telemetry/management/commands/mqtt_consumer.py](file:///d:/chuongngu/lwb-backend/telemetry/management/commands/mqtt_consumer.py)

- **Mở rộng bộ lọc `record_type`:** Chấp nhận cả `"SENSOR_DATA"` lẫn `"LOCAL"` và kiểm tra sự tồn tại của payload `data`:
  ```python
  record_type = payload.get("record_type")
  if record_type not in ("SENSOR_DATA", "LOCAL") and not payload.get("data"):
      return
  ```
- **Lọc mã lỗi cảm biến ngay tại tầng nạp dữ liệu (Ingestion Layer):**
  - Gán `None` cho `hdc_temp_x10` nếu giá trị bằng `-32768`.
  - Gán `None` cho `bmp_temp_x10` nếu giá trị bằng `-32768`.
  - Gán `None` cho `pressure_pa` nếu giá trị bằng `-2147483648`.
  - Gán `None` cho `light_raw` hoặc `hdc_hum_x10` nếu giá trị bằng `65535`.

### B. Chuẩn Hóa Models & Serializers: [telemetry/models.py](file:///d:/chuongngu/lwb-backend/telemetry/models.py) & [telemetry/serializers.py](file:///d:/chuongngu/lwb-backend/telemetry/serializers.py)

- **[telemetry/models.py](file:///d:/chuongngu/lwb-backend/telemetry/models.py):** Cập nhật property `bmp_temp_c` trả về `None` khi gặp giá trị `-32768`.
- **[telemetry/serializers.py](file:///d:/chuongngu/lwb-backend/telemetry/serializers.py):** Bổ sung trường `SerializerMethodField` cho `pressure_pa` để triệt tiêu các giá trị tràn bit `<= -2000000000`, đảm bảo Frontend nhận `null` và hiển thị ký hiệu an toàn `-- hPa`.

### C. Khôi Phục Tương Thích Docker Đa Môi Trường:

- **[config/settings.py](file:///d:/chuongngu/lwb-backend/config/settings.py):**
  - Cho phép biến môi trường `DJANGO_ALLOWED_HOSTS` hoạt động với giá trị mặc định là `*`:
    ```python
    ALLOWED_HOSTS = [
        host.strip()
        for host in os.getenv('DJANGO_ALLOWED_HOSTS', '*').split(',')
        if host.strip()
    ]
    ```
  - Khôi phục đọc `DB_HOST` từ biến môi trường `os.getenv("DB_HOST", "127.0.0.1")` (khi chạy Docker sẽ nhận `db` thay vì bị ép cứng `127.0.0.1`).
- **[frontend/vite.config.js](file:///d:/chuongngu/lwb-backend/frontend/vite.config.js):**
  - Mở lại `host: '0.0.0.0'` và `port: 5173`.
  - Khôi phục reverse proxy trỏ sang biến môi trường `VITE_BACKEND_URL` (mặc định `http://backend:8000`).

---

## 3. Đánh Giá Rủi Ro & Phòng Ngừa (Risks & Mitigations)

| Hạng mục rủi ro | Mức độ | Cơ chế phòng ngừa đã thực hiện |
| :--- | :---: | :--- |
| **Xung đột cấu hình chạy Bare-metal (WSL) vs Docker** | Triệt tiêu | Sử dụng cơ chế fallback: Nếu chạy Docker sẽ đọc biến môi trường (`DB_HOST=db`, `VITE_BACKEND_URL=http://backend:8000`), nếu chạy trực tiếp ngoài máy host/WSL sẽ dùng fallback `127.0.0.1`. |
| **Vỡ giao diện do số đo cảm biến bất thường** | Thấp | Toàn bộ mã lỗi phần cứng (-32768, -2147483648) được lọc về `null` trước khi trả về API, đảm bảo biểu đồ Recharts không bị gãy tỉ lệ domain. |
| **Bỏ sót các gói tin từ các Gateway khác** | Thấp | Không giới hạn cứng tên Gateway (`border-router`, `GW-SITE1-01`...) nhờ cơ chế `get_or_create` linh hoạt. |

---

## 4. Kết Quả Kiểm Thử Thực Tế (Test Verification)

### 4.1. Thu thập liên tục từ phần cứng Gateway Border-Router
- **Log container `lwb-mqtt-consumer` ghi nhận chuỗi sự kiện thời gian thực:**
  ```text
  Connecting to MQTT broker y3123070.ala.asia-southeast1.emqxsl.com:8883
  MQTT connected
  Subscribed: warehouse/site1/lwb/nodes/+/telemetry
  Stored event=8292 node=1 seq=2458
  Stored event=8294 node=1 seq=2459
  Stored event=8296 node=1 seq=2460
  Stored event=8298 node=1 seq=2461
  ```
  *(Các gói tin từ gateway `border-router` được lưu tự động đều đặn mỗi 5 giây).*

### 4.2. Kiểm thử API phục vụ Frontend
- **Truy vấn qua proxy `http://127.0.0.1:5173/api/nodes/1/latest/`:**
  ```json
  {
    "event_id": 8298,
    "node_id": 1,
    "seq": 2461,
    "recv_ts_utc": "2026-10-08T08:42:43.805000Z",
    "temperature_c": 26.8,
    "humidity_percent": 95.4,
    "light_raw": null,
    "bmp_temperature_c": null,
    "pressure_pa": null
  }
  ```
  *(Các trường hợp cảm biến chưa cắm được chuẩn hóa về `null` sạch sẽ; nhiệt độ và độ ẩm hiển thị đúng giá trị thực `26.8 °C` và `95.4 %`).*

### 4.3. Đồng bộ Git
- Toàn bộ các thay đổi trên đã được commit và push thành công lên nhánh chính:
  ```text
  commit e60c4e6
  fix: accept border-router LOCAL record_type, sanitize error sensor values, restore Docker settings and ALLOWED_HOSTS
  ```
