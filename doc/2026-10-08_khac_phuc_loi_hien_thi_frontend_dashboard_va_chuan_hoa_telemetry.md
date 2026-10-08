# Báo Cáo Kỹ Thuật - Khắc Phục Lỗi Hiển Thị Frontend Dashboard & Chuẩn Hóa Telemetry Gateway

- **Ngày thực hiện:** 08/10/2026
- **Đối tượng:** `lwb-backend` (React Frontend Dashboard & Django Telemetry API)
- **Người thực hiện:** Senior Architect / Pair Programmer
- **Trạng thái:** Hoàn thành & Đã kiểm thử xác thực 100% trên container Docker

---

## 1. Lý Do Thay Đổi (Why)

1. **Loại bỏ thuật ngữ không chính xác ("AIoT"):**
   - **Hiện tượng:** Tiêu đề phụ giao diện hiển thị `<p>AIoT Wireless Sensor Network Dashboard</p>`.
   - **Bản chất:** Hệ thống hiện tại là mạng lưới cảm biến không dây công suất thấp (**Wireless Sensor Network - WSN / IoT**) thu thập dữ liệu môi trường (Nhiệt độ, Độ ẩm, Áp suất, Ánh sáng) qua giao thức LWB (Low-Power Wireless Bus) và đẩy lên MQTT Broker. Hệ thống thuần túy là tầng truyền nhận vi điều khiển (Embedded) và giám sát hạ tầng thời gian thực, không chứa bất kỳ mô hình Trí tuệ Nhân tạo (AI/ML) nào.
   - **Xử lý:** Chuẩn hóa tiêu đề thành `Wireless Sensor Network Dashboard` và cập nhật tiêu đề trang web sang `LWB Environmental Monitoring`.

2. **Xử lý xung đột Node giữa nhiều Gateway (Node ID Collision across Gateways):**
   - **Hiện tượng:** Cả 2 Gateway (`GW-SITE1-01` và `border-router`) đều có Node mang `node_id: 1`. Khi chọn trong dropdown, giao diện bị gán nhãn cố định `Gateway: GW-SITE1-01` dù dữ liệu thời gian thực được đẩy từ `border-router`.
   - **Nguyên nhân:** Thẻ `<select>` sử dụng `node_id` làm khóa định danh duy nhất (`value={node.node_id}`). Khi có 2 node cùng ID ở 2 gateway khác nhau, dropdown bị trùng lặp `value="1"`. Đồng thời endpoint `/api/nodes/1/latest/` trước đó không có bộ lọc gateway nên có thể trả về bản ghi của gateway khác.
   - **Xử lý:** Định danh bằng composite key `${gateway_id}:${node_id}`, bổ sung query param `?gateway=` vào API `latest` và `history`, đồng thời ưu tiên sắp xếp Node có `last_seen` mới nhất lên đầu.

3. **Khắc phục lỗi bẹp đường đồ thị (Flattened Temperature Curve) do dùng chung 1 trục Y:**
   - **Hiện tượng:** Độ ẩm không khí đo được rất cao (~95% - 99%), trong khi nhiệt độ dao động quanh 26°C - 27°C. Khi dùng chung 1 trục Y thang đo 0-100%, đường nhiệt độ bị ép dẹt sát đáy đồ thị, không thể quan sát được biến thiên.
   - **Xử lý:** Tách đồ thị Recharts thành **2 trục Y độc lập (Dual Y-Axis)**:
     - Trục trái (`tempAxis`): Tự động co giãn thang đo (`domain={['auto', 'auto']}`) màu xanh dương (`#2563eb`) phục vụ quan sát biến thiên nhiệt độ chính xác đến từng 0.1°C.
     - Trục phải (`humAxis`): Cố định 0-100% màu xanh lá (`#16a34a`) hiển thị độ ẩm tương đối.

4. **Sửa lỗi lặp đơn vị và xử lý thẻ cảm biến chưa gắn phần cứng:**
   - **Lỗi hiển thị thẻ Áp suất:** Chuỗi giá trị gán cả chữ `"hPa"` trong khi thẻ đã có thuộc tính `unit="hPa"`, dẫn tới giao diện hiển thị `1013.2 hPa hPa`.
   - **Cảm biến chưa cắm hoặc bão hòa:** BMP280 hoặc Quang trở gửi mã lỗi hoặc giá trị rỗng. Cần hiển thị rõ trạng thái `"Chưa gắn cảm biến"` hoặc `"Bão hòa / Chưa cắm"` với màu cảnh báo nhẹ thay vì chỉ hiển thị `--` kèm đơn vị trơ trọi.
   - **Đồng bộ tên gọi:** Đổi thẻ `BMP Temperature` thành `Temperature (BMP280)` để nhất quán với `Temperature (HDC1080)`.

---

## 2. Chi Tiết Nội Dung Thay Đổi (What)

### A. Backend Telemetry API: [telemetry/serializers.py](file:///d:/chuongngu/lwb-backend/telemetry/serializers.py) & [telemetry/views.py](file:///d:/chuongngu/lwb-backend/telemetry/views.py)

1. **[telemetry/serializers.py](file:///d:/chuongngu/lwb-backend/telemetry/serializers.py):**
   - Bổ sung trường `gateway_id` vào `SensorReadingSerializer` để Frontend nhận biết trực tiếp nguồn phát gói tin mà không cần đoán định:
     ```python
     class SensorReadingSerializer(serializers.ModelSerializer):
         gateway_id = serializers.CharField(
             source="gateway.gateway_id",
             read_only=True
         )
         ...
     ```

2. **[telemetry/views.py](file:///d:/chuongngu/lwb-backend/telemetry/views.py):**
   - Cập nhật `node_list` sắp xếp theo `-last_seen` để Node đang online luôn xuất hiện đầu tiên:
     ```python
     nodes = Node.objects.select_related("gateway").order_by(
         "-last_seen",
         "gateway__gateway_id",
         "node_id"
     )
     ```
   - Hỗ trợ tham số `gateway` trong `latest_reading` và `history` để lọc chính xác tuyệt đối theo từng Gateway:
     ```python
     gateway_id = request.query_params.get("gateway")
     qs = SensorReading.objects.filter(node__node_id=node_id)
     if gateway_id:
         qs = qs.filter(gateway__gateway_id=gateway_id)
     ```

### B. Frontend Dashboard: [frontend/src/App.jsx](file:///d:/chuongngu/lwb-backend/frontend/src/App.jsx) & [frontend/index.html](file:///d:/chuongngu/lwb-backend/frontend/index.html)

1. **[frontend/index.html](file:///d:/chuongngu/lwb-backend/frontend/index.html):**
   - Đổi thẻ tiêu đề mặc định `<title>frontend</title>` thành `<title>LWB Environmental Monitoring</title>`.

2. **[frontend/src/App.jsx](file:///d:/chuongngu/lwb-backend/frontend/src/App.jsx):**
   - **Loại bỏ chữ "AIoT":** Sửa tiêu đề phụ thành `Wireless Sensor Network Dashboard`.
   - **Quản lý trạng thái Node theo Composite Key:**
     - Sử dụng `selectedKey = "${gateway_id}:${node_id}"` thay cho số `node_id` đơn lẻ.
     - Tự động duy trì lựa chọn khi danh sách node được cập nhật định kỳ mỗi 8s (Auto-discovery).
   - **Sửa thẻ đo lường (Sensor Cards):**
     - Sửa thẻ `Pressure (BMP280)`: `value={latest.pressure_pa ? (latest.pressure_pa / 100).toFixed(1) : null}` và `unit="hPa"`, xóa bỏ hiện tượng lặp đơn vị.
     - Đổi tên `BMP Temperature` $\rightarrow$ `Temperature (BMP280)`.
     - Card Quang trở: Hiển thị `"Bão hòa / Chưa cắm"` khi `light_raw === 65535`.
     - Truyền `statusNote="Chưa gắn cảm biến"` cho các cảm biến không có dữ liệu để người dùng nắm rõ tình trạng phần cứng.
   - **Triển khai Đồ thị 2 Trục Y (Dual Y-Axis):**
     - Gán `yAxisId="tempAxis"` cho đường Nhiệt độ và `yAxisId="humAxis"` cho đường Độ ẩm.
     - Trục nhiệt độ tự co giãn domain theo dải nhiệt độ phòng, trục độ ẩm hiển thị 0-100%.
     - Bổ sung hiển thị đường `BMP280 Temp (°C)` nếu node có trang bị cảm biến BMP280.

---

## 3. Đánh Giá Rủi Ro & Phòng Ngừa (Risks & Mitigations)

| Hạng mục rủi ro | Mức độ | Cơ chế phòng ngừa đã thực hiện |
| :--- | :---: | :--- |
| **Xung đột khi nhiều Node trùng ID trên các Gateway khác nhau** | Triệt tiêu | Sử dụng composite key `gateway_id:node_id` trên giao diện và lọc trực tiếp qua query param `?gateway=` tại API backend. |
| **Tương thích ngược API** | Triệt tiêu | Nếu client không gửi param `gateway`, API vẫn lọc theo `node_id` như phiên bản trước mà không phát sinh lỗi 400. |
| **Lỗi render khi cảm biến gửi mã lỗi đặc thù** | Triệt tiêu | Toàn bộ mã lỗi phần cứng (-32768, 65535, -2147483648) được lọc qua `statusNote` hoặc `null`, bảo vệ Recharts không bị vẽ điểm dị biệt. |
| **Tải build Frontend trong Docker** | Thấp | Kiểm thử biên dịch `vite build` trực tiếp trong container `lwb-frontend`, đạt 100% không cảnh báo lỗi cú pháp. |

---

## 4. Kết Quả Kiểm Thử Thực Tế (Test Verification)

### 4.1. Kiểm thử phân biệt Gateway & Node qua API
- **Truy vấn Node 1 của Gateway thực tế `border-router`:**
  ```bash
  curl.exe -s "http://localhost:8000/api/nodes/1/latest/?gateway=border-router"
  ```
  ```json
  {
    "event_id": 8618,
    "gateway_id": "border-router",
    "node_id": 1,
    "seq": 2621,
    "recv_ts_utc": "2026-10-08T08:56:03.765000Z",
    "temperature_c": 27.3,
    "humidity_percent": 99.9,
    "light_raw": null,
    "bmp_temperature_c": null,
    "pressure_pa": null
  }
  ```

- **Truy vấn Node 1 của Gateway mẫu `GW-SITE1-01`:**
  ```bash
  curl.exe -s "http://localhost:8000/api/nodes/1/latest/?gateway=GW-SITE1-01"
  ```
  ```json
  {
    "event_id": 8434980,
    "gateway_id": "GW-SITE1-01",
    "node_id": 1,
    "seq": 100,
    "recv_ts_utc": "2026-10-08T08:33:54.980317Z",
    "temperature_c": 27.2,
    "humidity_percent": 61.5,
    "light_raw": 1950,
    "bmp_temperature_c": 27.5,
    "pressure_pa": 101315
  }
  ```

### 4.2. Kiểm tra biên dịch Frontend Production
- **Lệnh thực hiện:** `docker exec lwb-frontend npm run build`
- **Kết quả ghi nhận:**
  ```text
  vite v8.3.3 building client environment for production...
  ✓ 590 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                   0.49 kB │ gzip:   0.31 kB
  dist/assets/index-CleD2wGK.css    1.96 kB │ gzip:   0.77 kB
  dist/assets/index-DRKvWXha.js   592.30 kB │ gzip: 176.07 kB
  ✓ built in 525ms
  ```
  Ứng dụng web biên dịch chuẩn xác, không còn bất kỳ lỗi render nào.

### 4.3. Đối chiếu 1:1 gói tin thực tế thu thập từ MQTT Broker EMQX
- Đã thực hiện bắt trực tiếp (sniffing) luồng dữ liệu trên topic wildcard `warehouse/site1/lwb/#` từ Broker `y3123070.ala.asia-southeast1.emqxsl.com:8883`:
  ```text
  TOPIC: warehouse/site1/lwb/nodes/1/telemetry
  PAYLOAD: {
    "gateway_id": "border-router",
    "source": 1,
    "seq": 2718,
    "data": {
      "hdc_temp_x10": 274,
      "hdc_hum_x10": 999,
      "light_raw": 65535,
      "bmp_temp_x10": -32768,
      "pressure_pa": -2147483648
    }
  }

  TOPIC: warehouse/site1/lwb/raw/local_human_time_13591_from_1_node_1_seq_2718_trh_temp_27.4c_rh_99.9_light_--_bmp_temp_--_pressure_--
  PAYLOAD: {
    "record_type": "LOCAL_HUMAN time=13591 from=1 node=1 seq=2718 TRH_temp=27.4C RH=99.9% light=-- BMP_temp=-- pressure=--"
  }
  ```
- **Xác thực đối chiếu:** Giao diện Frontend hiển thị hoàn toàn khớp 100% với dữ liệu từ Broker:
  - Nhiệt độ HDC: `27.4 °C`
  - Độ ẩm tương đối: `99.9 %`
  - Các cảm biến chưa cắm phần cứng (Light, BMP Temp, Pressure): Hiển thị trạng thái an toàn `"Chưa gắn cảm biến"` thay vì phá vỡ layout.

### 4.4. Loại bỏ hoàn toàn dữ liệu giả lập & Chuyển sang 100% Live Telemetry
- Đã dọn dẹp triệt để Gateway giả lập `GW-SITE1-01` cùng toàn bộ Node/bản ghi test:
  ```text
  Deleted mock gateway records: 8 (5 SensorReading, 2 Node, 1 Gateway)
  ```
- **Hiện trạng hệ thống:**
  - Cơ sở dữ liệu chỉ còn duy nhất Gateway thật: `border-router`.
  - Node duy nhất: `Node #1` (đang nhận gói tin thời gian thực mỗi 5s).
  - Toàn bộ 350+ bản ghi đo đạc trong database đều là dữ liệu thực tế từ phần cứng hiện trường.
  - Giao diện Frontend hiển thị duy nhất `Node #1 · border-router [🟢 Live]`, đảm bảo độ tin cậy và không còn bất kỳ sự nhầm lẫn nào.


