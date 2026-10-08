import { useEffect, useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

import './App.css'


function App() {
  const [nodes, setNodes] = useState([])
  const [selectedKey, setSelectedKey] = useState(null)

  const [latest, setLatest] = useState(null)
  const [history, setHistory] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)


  // 1. Load node list and auto-discover new nodes periodically
  useEffect(() => {
    async function loadNodes() {
      try {
        const response = await fetch('/api/nodes/')

        if (!response.ok) {
          throw new Error('Không thể tải danh sách node')
        }

        const data = await response.json()
        setNodes(data)

        if (data.length > 0) {
          setSelectedKey((prev) => {
            const exists = prev && data.some((n) => `${n.gateway_id}:${n.node_id}` === prev)
            return exists ? prev : `${data[0].gateway_id}:${data[0].node_id}`
          })
        } else {
          setSelectedKey(null)
          setLatest(null)
          setHistory([])
        }

      } catch (err) {
        setError(err.message)
      }
    }

    loadNodes()

    // Auto-discover nodes every 8 seconds
    const nodeTimer = setInterval(loadNodes, 8000)
    return () => clearInterval(nodeTimer)
  }, [])


  // 2. Fetch latest reading & history for selected gateway + node every 4s
  useEffect(() => {
    if (!selectedKey) {
      setLoading(false)
      return
    }

    const [gatewayId, nodeId] = selectedKey.split(':')

    async function loadSensorData() {
      try {
        const [latestResponse, historyResponse] = await Promise.all([
          fetch(`/api/nodes/${nodeId}/latest/?gateway=${encodeURIComponent(gatewayId)}`),
          fetch(`/api/nodes/${nodeId}/history/?gateway=${encodeURIComponent(gatewayId)}&limit=100`)
        ])

        if (!latestResponse.ok) {
          throw new Error('Không thể tải dữ liệu mới nhất')
        }

        if (!historyResponse.ok) {
          throw new Error('Không thể tải dữ liệu lịch sử')
        }

        const latestData = await latestResponse.json()
        const historyData = await historyResponse.json()

        setLatest(latestData)

        // Reverse for chronological order (oldest to newest)
        setHistory(
          [...historyData]
            .reverse()
            .map((item) => ({
              ...item,
              time: new Date(item.recv_ts_utc).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              }),
            }))
        )

        setError(null)

      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadSensorData()

    const timer = setInterval(loadSensorData, 4000)
    return () => clearInterval(timer)

  }, [selectedKey])

  const activeNodeInfo = useMemo(() => {
    if (!selectedKey) return null
    return nodes.find((n) => `${n.gateway_id}:${n.node_id}` === selectedKey) || null
  }, [nodes, selectedKey])

  const hasBmpTemp = useMemo(() => {
    return history.some((item) => item.bmp_temperature_c != null)
  }, [history])


  return (
    <div className="dashboard">

      <header className="topbar">
        <div>
          <h1>LWB Environmental Monitoring</h1>
          <p>Wireless Sensor Network Dashboard</p>
        </div>

        <div className="node-selector">
          <label>Node</label>

          <select
            value={selectedKey ?? ''}
            onChange={(event) => setSelectedKey(event.target.value)}
            disabled={nodes.length === 0}
          >
            {nodes.length === 0 ? (
              <option value="">Chưa có node</option>
            ) : (
              nodes.map((node) => {
                const key = `${node.gateway_id}:${node.node_id}`
                const isRecentlyActive =
                  node.last_seen &&
                  (Date.now() - new Date(node.last_seen).getTime() < 30000)
                const statusTag = isRecentlyActive ? '🟢 Live' : 'Offline'
                return (
                  <option key={key} value={key}>
                    Node #{node.node_id} · {node.gateway_id} [{statusTag}]
                  </option>
                )
              })
            )}
          </select>
        </div>
      </header>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      {loading && !latest && nodes.length > 0 && (
        <div className="loading">
          Đang tải dữ liệu cảm biến...
        </div>
      )}

      {!loading && nodes.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <h2 style={{ fontSize: '20px', color: '#1f2937', marginBottom: '8px' }}>
            Đang Chờ Dữ Liệu Cảm Biến LWB
          </h2>
          <p style={{ color: '#6b7280', margin: 0 }}>
            Cơ sở dữ liệu chưa ghi nhận Node nào từ Gateway. Worker <code>mqtt-consumer</code> đang lắng nghe trên topic:
            <br />
            <strong>warehouse/site1/lwb/nodes/+/telemetry</strong>
          </p>
        </div>
      )}

      {latest && (
        <>
          <section className="cards">
            <SensorCard
              title="Temperature (HDC1080)"
              value={latest.temperature_c}
              unit="°C"
              statusNote="Chưa gắn cảm biến"
            />

            <SensorCard
              title="Humidity (HDC1080)"
              value={latest.humidity_percent}
              unit="%"
              statusNote="Chưa gắn cảm biến"
            />

            <SensorCard
              title="Light Intensity"
              value={latest.light_raw != null && latest.light_raw !== 65535 ? latest.light_raw : null}
              unit="raw"
              statusNote={latest.light_raw === 65535 ? 'Bão hòa / Chưa cắm' : 'Chưa gắn cảm biến'}
            />

            <SensorCard
              title="Pressure (BMP280)"
              value={latest.pressure_pa ? (latest.pressure_pa / 100).toFixed(1) : null}
              unit="hPa"
              statusNote="Chưa gắn cảm biến"
            />

            <SensorCard
              title="Temperature (BMP280)"
              value={latest.bmp_temperature_c}
              unit="°C"
              statusNote="Chưa gắn cảm biến"
            />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Environmental History</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <span className="badge-gateway">
                    Gateway: <strong>{latest.gateway_id || activeNodeInfo?.gateway_id || '--'}</strong>
                  </span>
                  <span className="badge-node">
                    Node: <strong>#{latest.node_id}</strong>
                  </span>
                  <span className="badge-topic">
                    MQTT: <code>warehouse/site1/lwb/nodes/{latest.node_id}/telemetry</code>
                  </span>
                  <span className="badge-seq">
                    Seq: <strong>#{latest.seq ?? '--'}</strong>
                  </span>
                </div>
              </div>

              <div className="last-update">
                Last update
                <strong>
                  {new Date(latest.recv_ts_utc).toLocaleTimeString()}
                </strong>
                <span style={{ fontSize: '12px', color: '#16a34a', display: 'block', marginTop: '2px', fontWeight: 500 }}>
                  {Date.now() - new Date(latest.recv_ts_utc).getTime() < 15000 ? '● Realtime từ Broker' : '○ Lưu trữ gần nhất'}
                </span>
              </div>
            </div>

            <div className="chart-container">
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={history} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />

                  {/* Trục Y bên trái: Tự động co giãn theo Nhiệt độ thực tế (°C) */}
                  <YAxis
                    yAxisId="tempAxis"
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 12, fill: '#2563eb' }}
                  />

                  {/* Trục Y bên phải: Cố định 0-100% cho Độ ẩm tương đối */}
                  <YAxis
                    yAxisId="humAxis"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: '#16a34a' }}
                  />

                  <Tooltip
                    formatter={(val, name) => [val != null ? val : '--', name]}
                  />

                  <Legend wrapperStyle={{ paddingTop: 10 }} />

                  <Line
                    yAxisId="tempAxis"
                    type="monotone"
                    dataKey="temperature_c"
                    name="Temperature (°C)"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />

                  <Line
                    yAxisId="humAxis"
                    type="monotone"
                    dataKey="humidity_percent"
                    name="Humidity (%)"
                    stroke="#16a34a"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />

                  {hasBmpTemp && (
                    <Line
                      yAxisId="tempAxis"
                      type="monotone"
                      dataKey="bmp_temperature_c"
                      name="BMP280 Temp (°C)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

    </div>
  )
}


function SensorCard({ title, value, unit, statusNote }) {
  const isAvailable = value !== null && value !== undefined
  return (
    <div className="sensor-card">
      <div className="card-title">{title}</div>
      <div className="card-value" style={{ color: isAvailable ? '#111827' : '#9ca3af' }}>
        {isAvailable ? value : '--'}
      </div>
      <div
        className="card-unit"
        style={{ color: isAvailable ? '#6b7280' : '#ef4444', fontSize: '13px' }}
      >
        {isAvailable ? unit : (statusNote || '--')}
      </div>
    </div>
  )
}


export default App
