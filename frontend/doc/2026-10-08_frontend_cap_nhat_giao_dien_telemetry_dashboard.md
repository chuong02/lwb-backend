# Báo Cáo Thay Đổi Frontend - LWB Telemetry Monitoring Dashboard

- **Ngày thực hiện:** 08/10/2026
- **Đối tượng:** Thư mục `frontend/`
- **Người thực hiện:** Senior Architect / Pair Programmer
- **Trạng thái:** Hoàn thành & Đã kiểm thử trực tiếp trên container `lwb-frontend`

---

## 1. Lý Do Thay Đổi (Why)

1. **Khắc phục tình trạng "rời rạc không liên quan" giữa Frontend và Backend:**
   - Trước khi sửa: Thư mục `frontend/src/App.jsx` chỉ chứa mã nguồn mẫu mặc định của Vite (`Count is 0`, logo React/Vite, link tài liệu). Hoàn toàn không có bất kỳ logic nào gọi API hay kết nối với cơ sở dữ liệu telemetry của Backend.
   - Thư viện `recharts` đã được khai báo trong `package.json` nhưng chưa từng được import hay sử dụng để trực quan hóa dữ liệu cảm biến.
2. **Đáp ứng yêu cầu nghiệp vụ theo kiến trúc [README.md](file:///d:/chuongngu/lwb-backend/README.md):**
   - Xây dựng một bảng điều khiển trung tâm (Telemetry Dashboard) phục vụ giám sát mạng cảm biến không dây công suất thấp (LWB - Low-power Wireless Bus) cho nhà kho/nhà xưởng.
   - Trực quan hóa đầy đủ 4 đại lượng đo đạc từ các sensor: Nhiệt độ (°C), Độ ẩm (%), Áp suất khí quyển (hPa), Cường độ ánh sáng (raw).

---

## 2. Chi Tiết Nội Dung Thay Đổi (What)

### A. Tệp [frontend/src/App.jsx](file:///d:/chuongngu/lwb-backend/frontend/src/App.jsx)
Viết lại 100% mã nguồn ứng dụng React với các chức năng chính:
- **Tích hợp gọi REST API Backend:**
  - `fetch('/api/nodes/')`: Tự động nạp danh sách Node và trạng thái kết nối của từng Gateway.
  - `fetch('/api/nodes/<node_id>/latest/')`: Lấy bản ghi đo đạc cảm biến mới nhất của Node đang chọn.
  - `fetch('/api/nodes/<node_id>/history/?limit=30')`: Lấy dữ liệu lịch sử đo đạc chuỗi thời gian để vẽ đồ thị.
- **Vòng lặp tự động cập nhật (Auto-polling Loop):**
  - Tự động thăm dò dữ liệu mới mỗi 4 giây (`isAutoRefresh = true`), kèm nút chuyển đổi bật/tắt (Auto-poll ON/PAUSED) và nút làm mới thủ công (Manual Refresh).
- **Trực quan hóa đồ thị với Recharts:**
  - **Biểu đồ 1 (AreaChart kép):** Biến thiên Nhiệt độ HDC (°C) và Độ ẩm không khí (%) theo trục thời gian thực với hiệu ứng dải màu gradient.
  - **Biểu đồ 2 (LineChart kép):** Biến thiên Áp suất khí quyển (hPa) và Cường độ ánh sáng (raw).
- **Thẻ chỉ số thời gian thực (Live Metric Cards):**
  - Card Nhiệt độ: Hiển thị song song cả cảm biến HDC 1080 và BMP 280.
  - Card Độ ẩm: Tỷ lệ phần trăm và đánh giá điều kiện môi trường (Lý tưởng / Ẩm ướt).
  - Card Áp suất: Chuyển đổi linh hoạt giữa Pascal (Pa) và hectopascal (hPa).
  - Card Ánh sáng & Packet Info: Hiển thị giá trị raw và Sequence number (`seq`) của gói tin LWB.
- **Bộ chọn Node (Node Selector Strip) & Bảng lịch sử (History Table):**
  - Cho phép người dùng click chuyển đổi giữa các Node cảm biến khác nhau trong mạng.
  - Bảng hiển thị chi tiết 10 bản ghi đo đạc mới nhất kèm Event ID, Seq, Timestamps.
- **Xử lý trạng thái rỗng thông minh (Empty State & Simulation Mode):**
  - Khi cơ sở dữ liệu Backend chưa có Node nào (do sensor thực tế ngoài hiện trường chưa gửi gói tin MQTT), giao diện hiển thị banner hướng dẫn và tự động kích hoạt **Chế độ mô phỏng (Simulated Preview)** để người dùng trải nghiệm ngay đồ thị và chỉ số động mà không bị crash.

### B. Tệp [frontend/src/App.css](file:///d:/chuongngu/lwb-backend/frontend/src/App.css)
- Xây dựng hệ thống giao diện **Dark Industrial UI**: Nền tối sâu (`#0a0e17`), thẻ kính mờ (Glassmorphism), viền card nổi bật theo từng đại lượng đo đạc (Cam cho Nhiệt độ, Xanh cyan cho Độ ẩm, Xanh lục cho Áp suất, Vàng cho Ánh sáng).
- Hiệu ứng đèn tín hiệu kết nối nhấp nháy (Pulsing online dot).
- Thiết kế responsive thích ứng tốt trên cả màn hình Desktop, Tablet và Mobile.

### C. Tệp [frontend/src/index.css](file:///d:/chuongngu/lwb-backend/frontend/src/index.css)
- Tái cấu trúc biến CSS tokens chuẩn (`--bg-primary`, `--bg-card`, `--border`, v.v.).
- Xóa bỏ các giới hạn kích thước cố định (`1126px`) của template cũ, mở rộng layout toàn màn hình (`max-width: 1440px`).

---

## 3. Đánh Giá Rủi Ro & Giải Pháp Phòng Ngừa (Risks & Mitigations)

| Rủi ro tiềm ẩn | Mức độ | Cơ chế phòng ngừa đã cài đặt |
| :--- | :---: | :--- |
| **Xung đột CORS khi gọi Backend từ cổng 5173** | Thấp | Code React chỉ sử dụng đường dẫn tương đối `/api/...`. Vite dev server (và Nginx trên production) đóng vai trò reverse proxy trung gian, loại bỏ hoàn toàn lỗi CORS. |
| **Quá tải Backend do Auto-polling liên tục** | Thấp | Chu kỳ polling được đặt ở mức an toàn (4 giây). Có nút cho phép người dùng chủ động Pause/Resume. Mỗi lượt request chỉ lấy tối đa 30 bản ghi index. |
| **Lỗi giao diện khi Database rỗng (No data 404)** | Trung bình | Đã bọc `try...catch` và kiểm tra `data.length === 0`. Tự động kích hoạt cơ chế mô phỏng an toàn khi DB chưa có bản ghi nào. |
| **Thiếu thư viện ngoài / vỡ build** | Không | Sử dụng 100% inline SVG cho các icon, không thêm bất kỳ package bên ngoài nào ngoài `react` và `recharts` đã có sẵn trong `package.json`. |

---

## 4. Hướng Dẫn Kiểm Thử

1. Mở trình duyệt truy cập: **`http://localhost:5173`**
2. Quan sát:
   - Badge trạng thái: **`API Connected (:8000)`**.
   - Thẻ số liệu và 2 biểu đồ Recharts hiển thị biến thiên thời gian thực.
   - Thử bấm nút **`Làm mới`** hoặc đổi Node để kiểm tra tương tác.
