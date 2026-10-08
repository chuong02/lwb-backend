from django.db import models


class Gateway(models.Model):
    gateway_id = models.CharField(
        max_length=100,
        unique=True
    )

    last_seen = models.DateTimeField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return self.gateway_id


class Node(models.Model):
    gateway = models.ForeignKey(
        Gateway,
        on_delete=models.CASCADE,
        related_name="nodes"
    )

    node_id = models.PositiveIntegerField()

    last_seen = models.DateTimeField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["gateway", "node_id"],
                name="uniq_gateway_node"
            )
        ]

    def __str__(self):
        return f"{self.gateway.gateway_id}/node-{self.node_id}"


class SensorReading(models.Model):
    gateway = models.ForeignKey(
        Gateway,
        on_delete=models.CASCADE,
        related_name="readings"
    )

    node = models.ForeignKey(
        Node,
        on_delete=models.CASCADE,
        related_name="readings"
    )

    event_id = models.BigIntegerField()

    seq = models.BigIntegerField(
        null=True,
        blank=True
    )

    recv_ts_utc = models.DateTimeField()

    host_time = models.BigIntegerField(
        null=True,
        blank=True
    )

    hdc_temp_x10 = models.IntegerField(
        null=True,
        blank=True
    )

    hdc_hum_x10 = models.IntegerField(
        null=True,
        blank=True
    )

    light_raw = models.IntegerField(
        null=True,
        blank=True
    )

    bmp_temp_x10 = models.IntegerField(
        null=True,
        blank=True
    )

    pressure_pa = models.IntegerField(
        null=True,
        blank=True
    )

    raw_payload = models.JSONField(
        default=dict
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        ordering = ["-recv_ts_utc"]

        constraints = [
            models.UniqueConstraint(
                fields=["gateway", "event_id"],
                name="uniq_gateway_event"
            )
        ]

    @property
    def hdc_temp_c(self):
        if self.hdc_temp_x10 is None:
            return None
        return self.hdc_temp_x10 / 10.0

    @property
    def humidity_percent(self):
        if self.hdc_hum_x10 is None:
            return None
        return self.hdc_hum_x10 / 10.0

    @property
    def bmp_temp_c(self):
        if self.bmp_temp_x10 is None:
            return None
        return self.bmp_temp_x10 / 10.0
