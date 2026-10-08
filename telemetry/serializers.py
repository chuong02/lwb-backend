from rest_framework import serializers

from .models import Node, SensorReading


class NodeSerializer(serializers.ModelSerializer):
    gateway_id = serializers.CharField(
        source="gateway.gateway_id",
        read_only=True
    )

    class Meta:
        model = Node
        fields = [
            "gateway_id",
            "node_id",
            "last_seen",
            "created_at",
        ]


class SensorReadingSerializer(serializers.ModelSerializer):
    gateway_id = serializers.CharField(
        source="gateway.gateway_id",
        read_only=True
    )

    node_id = serializers.IntegerField(
        source="node.node_id",
        read_only=True
    )

    temperature_c = serializers.SerializerMethodField()
    humidity_percent = serializers.SerializerMethodField()
    bmp_temperature_c = serializers.SerializerMethodField()
    pressure_pa = serializers.SerializerMethodField()

    class Meta:
        model = SensorReading

        fields = [
            "event_id",
            "gateway_id",
            "node_id",
            "seq",
            "recv_ts_utc",
            "temperature_c",
            "humidity_percent",
            "light_raw",
            "bmp_temperature_c",
            "pressure_pa",
        ]

    def get_temperature_c(self, obj):
        return obj.hdc_temp_c

    def get_humidity_percent(self, obj):
        return obj.humidity_percent

    def get_bmp_temperature_c(self, obj):
        return obj.bmp_temp_c

    def get_pressure_pa(self, obj):
        if obj.pressure_pa is None or obj.pressure_pa <= -2000000000:
            return None
        return obj.pressure_pa
