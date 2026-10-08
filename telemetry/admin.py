from django.contrib import admin
from .models import Gateway, Node, SensorReading


@admin.register(Gateway)
class GatewayAdmin(admin.ModelAdmin):
    list_display = ("gateway_id", "last_seen", "created_at")
    search_fields = ("gateway_id",)
    list_filter = ("created_at",)
    ordering = ("-last_seen",)


@admin.register(Node)
class NodeAdmin(admin.ModelAdmin):
    list_display = ("node_id", "gateway", "last_seen", "created_at")
    search_fields = ("node_id", "gateway__gateway_id")
    list_filter = ("gateway", "created_at")
    ordering = ("gateway", "node_id")


@admin.register(SensorReading)
class SensorReadingAdmin(admin.ModelAdmin):
    list_display = (
        "event_id",
        "node",
        "gateway",
        "seq",
        "display_hdc_temp",
        "display_humidity",
        "display_bmp_temp",
        "pressure_pa",
        "light_raw",
        "recv_ts_utc",
    )
    list_filter = ("gateway", "node", "recv_ts_utc")
    search_fields = ("event_id", "gateway__gateway_id", "node__node_id")
    readonly_fields = ("created_at", "display_hdc_temp", "display_humidity", "display_bmp_temp")
    ordering = ("-recv_ts_utc",)

    @admin.display(description="HDC Temp (°C)")
    def display_hdc_temp(self, obj):
        return f"{obj.hdc_temp_c} °C" if obj.hdc_temp_c is not None else "--"

    @admin.display(description="Humidity (%)")
    def display_humidity(self, obj):
        return f"{obj.humidity_percent} %" if obj.humidity_percent is not None else "--"

    @admin.display(description="BMP Temp (°C)")
    def display_bmp_temp(self, obj):
        return f"{obj.bmp_temp_c} °C" if obj.bmp_temp_c is not None else "--"
