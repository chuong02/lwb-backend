# 1. Thêm corsheaders vào INSTALLED_APPS
INSTALLED_APPS = [
    ...
    "corsheaders",
    "rest_framework",
    "telemetry",
]

# 2. Thêm CorsMiddleware lên ĐẦU danh sách MIDDLEWARE
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # ... các middleware khác giữ nguyên
]

# 3. Thêm cấu hình cho phép React truy cập ở cuối file
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
