import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'
import './App.css'

// Inline SVG Icons for clean zero-dependency UI
const WaveIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12h2" /><path d="M6 8v8" /><path d="M10 4v16" /><path d="M14 6v12" /><path d="M18 9v6" /><path d="M22 12h-2" />
  </svg>
)

const TempIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
)

const HumidityIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
)

const PressureIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
  </svg>
)

const LightIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
)

const RefreshIcon = ({ spin }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: spin ? 'spin 1s linear infinite' : 'none' }}>
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
)

// Generate realistic simulated mock data if database is empty
function generateSimulatedData(nodeId = 1) {
  const now = Date.now()
  const history = []
  for (let i = 20; i >= 0; i--) {
    const ts = new Date(now - i * 5000)
    const timeLabel = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const baseTemp = 26.5 + Math.sin(i * 0.4) * 1.5 + (Math.random() * 0.4 - 0.2)
    const baseHum = 62.0 + Math.cos(i * 0.3) * 4.0 + (Math.random() * 0.8 - 0.4)
    history.push({
      event_id: 104000 + (20 - i),
      seq: 200 + (20 - i),
      recv_ts_utc: ts.toISOString(),
      timeLabel,
      temperature_c: parseFloat(baseTemp.toFixed(1)),
      bmp_temperature_c: parseFloat((baseTemp + 0.3).toFixed(1)),
      humidity_percent: parseFloat(baseHum.toFixed(1)),
      pressure_pa: 101280 + Math.floor(Math.sin(i * 0.2) * 50),
      pressure_hpa: parseFloat(((101280 + Math.sin(i * 0.2) * 50) / 100).toFixed(2)),
      light_raw: 1850 + Math.floor(Math.sin(i * 0.5) * 200)
    })
  }

  const latest = history[history.length - 1]
  return {
    nodes: [
      { id: 1, node_id: 1, gateway_id: 'GW-SITE1-01', last_seen: new Date().toISOString() },
      { id: 2, node_id: 2, gateway_id: 'GW-SITE1-01', last_seen: new Date(Date.now() - 15000).toISOString() },
      { id: 3, node_id: 5, gateway_id: 'GW-SITE1-01', last_seen: new Date(Date.now() - 45000).toISOString() },
    ],
    latest,
    history
  }
}

function App() {
  const [nodes, setNodes] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [latestReading, setLatestReading] = useState(null)
  const [historyReadings, setHistoryReadings] = useState([])
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [isSimulated, setIsSimulated] = useState(false)
  const [apiConnected, setApiConnected] = useState(false)

  // Fetch Node List from Django Backend
  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes/')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setApiConnected(true)
      setNodes(data)

      // Auto select first node if none selected
      if (data.length > 0 && selectedNodeId === null) {
        setSelectedNodeId(data[0].node_id)
      }
      return data
    } catch (err) {
      console.warn('Backend API connection warning:', err)
      setApiConnected(false)
      return []
    }
  }, [selectedNodeId])

  // Fetch Latest Reading for Selected Node
  const fetchLatestReading = useCallback(async (nodeId) => {
    if (!nodeId) return null
    try {
      const res = await fetch(`/api/nodes/${nodeId}/latest/`)
      if (!res.ok) return null
      const data = await res.json()
      setLatestReading(data)
      return data
    } catch (err) {
      console.warn(`Error fetching latest for node ${nodeId}:`, err)
      return null
    }
  }, [])

  // Fetch History for Selected Node
  const fetchHistory = useCallback(async (nodeId) => {
    if (!nodeId) return []
    try {
      const res = await fetch(`/api/nodes/${nodeId}/history/?limit=30`)
      if (!res.ok) return []
      const data = await res.json()
      
      // Order from oldest to newest for chronological chart display
      const formatted = data.slice().reverse().map(item => ({
        ...item,
        timeLabel: new Date(item.recv_ts_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        pressure_hpa: item.pressure_pa ? parseFloat((item.pressure_pa / 100).toFixed(2)) : null
      }))
      setHistoryReadings(formatted)
      return formatted
    } catch (err) {
      console.warn(`Error fetching history for node ${nodeId}:`, err)
      return []
    }
  }, [])

  // Orchestrated Refresh
  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    const currentNodes = await fetchNodes()

    const activeNodeId = selectedNodeId || (currentNodes.length > 0 ? currentNodes[0].node_id : null)
    if (activeNodeId) {
      await Promise.all([
        fetchLatestReading(activeNodeId),
        fetchHistory(activeNodeId)
      ])
    }

    setLastUpdated(new Date())
    setIsLoading(false)
  }, [fetchNodes, fetchLatestReading, fetchHistory, selectedNodeId])

  // Initial Fetch & Auto Refresh Loop
  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  useEffect(() => {
    if (!isAutoRefresh) return
    const timer = setInterval(() => {
      refreshAll()
    }, 4000)
    return () => clearInterval(timer)
  }, [isAutoRefresh, refreshAll])

  // When user switches selected node
  const handleSelectNode = (nodeId) => {
    setSelectedNodeId(nodeId)
    fetchLatestReading(nodeId)
    fetchHistory(nodeId)
  }

  // Active display data (either real data or simulated fallback)
  const displayData = useMemo(() => {
    if (nodes.length > 0 && !isSimulated) {
      return {
        nodes,
        latest: latestReading,
        history: historyReadings,
        isMock: false
      }
    }

    // Fallback or explicit simulation
    const mock = generateSimulatedData(selectedNodeId || 1)
    return {
      nodes: nodes.length > 0 ? nodes : mock.nodes,
      latest: latestReading || mock.latest,
      history: historyReadings.length > 0 ? historyReadings : mock.history,
      isMock: nodes.length === 0 || isSimulated
    }
  }, [nodes, latestReading, historyReadings, isSimulated, selectedNodeId])

  const activeNodeInfo = useMemo(() => {
    return displayData.nodes.find(n => n.node_id === selectedNodeId) || displayData.nodes[0] || null
  }, [displayData.nodes, selectedNodeId])

  return (
    <div className="lwb-dashboard">
      {/* Top Header */}
      <header className="dashboard-header">
        <div className="brand-wrapper">
          <div className="brand-icon">
            <WaveIcon />
          </div>
          <div>
            <h1 className="brand-title">LWB Telemetry Monitor</h1>
            <p className="brand-subtitle">Low-power Wireless Bus Industrial Sensor Network</p>
          </div>
        </div>

        <div className="header-actions">
          <div className={`status-badge ${apiConnected ? '' : 'offline'}`}>
            <span className="pulse-dot"></span>
            {apiConnected ? 'API Connected (:8000)' : 'API Disconnected'}
          </div>

          <button
            className={`btn btn-secondary ${isAutoRefresh ? 'btn-active' : ''}`}
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            title="Bật/Tắt tự động cập nhật dữ liệu"
          >
            {isAutoRefresh ? 'Auto-poll: ON (4s)' : 'Auto-poll: PAUSED'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={refreshAll}
            disabled={isLoading}
            title="Làm mới ngay lập tức"
          >
            <RefreshIcon spin={isLoading} />
            Làm mới
          </button>

          <button
            className={`btn ${displayData.isMock ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setIsSimulated(!isSimulated)}
            title="Bật/Tắt dữ liệu thử nghiệm"
          >
            {displayData.isMock ? 'Simulated Preview: ON' : 'Chế độ Demo'}
          </button>
        </div>
      </header>

      {/* Global Stat Counters */}
      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-card-title">Mạng Gateway</span>
          <span className="summary-card-value">
            {new Set(displayData.nodes.map(n => n.gateway_id)).size} GW
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-card-title">Số Node Cảm Biến</span>
          <span className="summary-card-value">{displayData.nodes.length} Nodes</span>
        </div>
        <div className="summary-card">
          <span className="summary-card-title">Node Đang Chọn</span>
          <span className="summary-card-value" style={{ color: '#38bdf8' }}>
            #{activeNodeInfo ? activeNodeInfo.node_id : '--'}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-card-title">Lần Cập Nhật Cuối</span>
          <span className="summary-card-value" style={{ fontSize: '16px', lineHeight: '28px' }}>
            {lastUpdated.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Empty State Banner if 0 real nodes found */}
      {nodes.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <WaveIcon />
          </div>
          <h2 className="empty-title">Đang Chờ Dữ Liệu Cảm Biến LWB</h2>
          <p className="empty-desc">
            Cơ sở dữ liệu chưa ghi nhận Node nào từ MQTT broker. Worker <code>mqtt-consumer</code> đang lắng nghe trên topic:
            <br />
            <strong>warehouse/site1/lwb/nodes/+/telemetry</strong>.
            <br />
            Hệ thống đang hiển thị <strong>Chế độ mô phỏng (Simulated Preview)</strong> để bạn trải nghiệm toàn bộ đồ thị và chỉ số.
          </p>
          <div className="helper-box">
            💡 Gợi ý: Khi Gateway gửi gói tin MQTT đầu tiên, hệ thống sẽ tự động cập nhật Node và số liệu đo đạc thực tế tại đây.
          </div>
        </div>
      )}

      {/* Node Selector Strip */}
      <section className="nodes-section">
        <div className="section-label">
          <span>📡 Danh sách Nodes trong mạng LWB:</span>
        </div>
        <div className="node-chips">
          {displayData.nodes.map((node) => {
            const isSelected = (selectedNodeId === node.node_id) || (!selectedNodeId && displayData.nodes[0]?.node_id === node.node_id)
            return (
              <button
                key={node.node_id}
                className={`node-chip ${isSelected ? 'active' : ''}`}
                onClick={() => handleSelectNode(node.node_id)}
              >
                <div className="node-chip-header">
                  <span className="node-chip-id">Node #{node.node_id}</span>
                  <span style={{ fontSize: '11px', color: '#22c55e' }}>● Online</span>
                </div>
                <div className="node-chip-gw">{node.gateway_id}</div>
                <div className="node-chip-time">
                  {node.last_seen ? new Date(node.last_seen).toLocaleTimeString() : 'N/A'}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Metric Cards Grid */}
      <section className="metrics-grid">
        {/* Nhiệt độ */}
        <div className="metric-card temp">
          <div className="metric-header">
            <span className="metric-name">Nhiệt độ (HDC & BMP)</span>
            <div className="metric-icon-wrap">
              <TempIcon />
            </div>
          </div>
          <div className="metric-value-row">
            <span className="metric-main-value">
              {displayData.latest?.temperature_c ?? '--'}
            </span>
            <span className="metric-unit">°C</span>
          </div>
          <div className="metric-footer">
            <span>BMP Temp: {displayData.latest?.bmp_temperature_c ?? '--'} °C</span>
            <span style={{ color: '#f97316' }}>HDC 1080</span>
          </div>
        </div>

        {/* Độ ẩm */}
        <div className="metric-card hum">
          <div className="metric-header">
            <span className="metric-name">Độ ẩm tương đối</span>
            <div className="metric-icon-wrap">
              <HumidityIcon />
            </div>
          </div>
          <div className="metric-value-row">
            <span className="metric-main-value">
              {displayData.latest?.humidity_percent ?? '--'}
            </span>
            <span className="metric-unit">%</span>
          </div>
          <div className="metric-footer">
            <span>Trạng thái: {displayData.latest?.humidity_percent > 70 ? 'Ẩm ướt' : 'Lý tưởng'}</span>
            <span style={{ color: '#06b6d4' }}>Cảm biến HDC</span>
          </div>
        </div>

        {/* Áp suất */}
        <div className="metric-card press">
          <div className="metric-header">
            <span className="metric-name">Áp suất khí quyển</span>
            <div className="metric-icon-wrap">
              <PressureIcon />
            </div>
          </div>
          <div className="metric-value-row">
            <span className="metric-main-value">
              {displayData.latest?.pressure_hpa ?? (displayData.latest?.pressure_pa ? (displayData.latest.pressure_pa / 100).toFixed(1) : '--')}
            </span>
            <span className="metric-unit">hPa</span>
          </div>
          <div className="metric-footer">
            <span>{displayData.latest?.pressure_pa ?? '--'} Pa</span>
            <span style={{ color: '#10b981' }}>BMP 280</span>
          </div>
        </div>

        {/* Cường độ ánh sáng */}
        <div className="metric-card light">
          <div className="metric-header">
            <span className="metric-name">Cường độ ánh sáng</span>
            <div className="metric-icon-wrap">
              <LightIcon />
            </div>
          </div>
          <div className="metric-value-row">
            <span className="metric-main-value">
              {displayData.latest?.light_raw ?? '--'}
            </span>
            <span className="metric-unit">raw</span>
          </div>
          <div className="metric-footer">
            <span>Packet Seq: #{displayData.latest?.seq ?? '--'}</span>
            <span style={{ color: '#f59e0b' }}>Photodiode</span>
          </div>
        </div>
      </section>

      {/* Interactive Charts Section */}
      <section className="charts-grid">
        {/* Biểu đồ Nhiệt độ & Độ ẩm */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Biến Thiên Nhiệt Độ & Độ Ẩm (Thời Gian Thực)</h3>
            <span className="chart-legend-hint">HDC Temp (°C) & Humidity (%)</span>
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={displayData.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="humGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2c42" />
                <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" stroke="#f97316" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#182234', borderColor: '#26334d', borderRadius: 8, color: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Area yAxisId="left" type="monotone" dataKey="temperature_c" name="Nhiệt độ (°C)" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#tempGradient)" />
                <Area yAxisId="right" type="monotone" dataKey="humidity_percent" name="Độ ẩm (%)" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#humGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Biểu đồ Áp suất & Ánh sáng */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Áp Suất Khí Quyển & Cường Độ Ánh Sáng</h3>
            <span className="chart-legend-hint">Pressure (hPa) & Light (Raw)</span>
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={displayData.history} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2c42" />
                <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="pressAxis" stroke="#10b981" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="lightAxis" orientation="right" stroke="#f59e0b" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#182234', borderColor: '#26334d', borderRadius: 8, color: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Line yAxisId="pressAxis" type="monotone" dataKey="pressure_hpa" name="Áp suất (hPa)" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line yAxisId="lightAxis" type="monotone" dataKey="light_raw" name="Ánh sáng (raw)" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Recent Readings Data Table */}
      <section className="table-card">
        <div className="table-header">
          <h3 className="table-title">Lịch Sử Đo Đạc Gần Nhất (Node #{activeNodeInfo ? activeNodeInfo.node_id : '--'})</h3>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Hiển thị {displayData.history.length} bản ghi gần nhất
          </span>
        </div>
        <div className="table-wrapper">
          <table className="telemetry-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Seq #</th>
                <th>Thời Gian Nhận</th>
                <th>Nhiệt độ HDC</th>
                <th>Nhiệt độ BMP</th>
                <th>Độ Ẩm</th>
                <th>Áp Suất</th>
                <th>Ánh Sáng</th>
              </tr>
            </thead>
            <tbody>
              {displayData.history.slice().reverse().slice(0, 10).map((row, idx) => (
                <tr key={row.event_id || idx}>
                  <td style={{ color: '#fff', fontWeight: 600 }}>{row.event_id ?? 'N/A'}</td>
                  <td>#{row.seq ?? 'N/A'}</td>
                  <td>{row.recv_ts_utc ? new Date(row.recv_ts_utc).toLocaleString() : 'N/A'}</td>
                  <td style={{ color: '#f97316' }}>{row.temperature_c ?? '--'} °C</td>
                  <td style={{ color: '#fb923c' }}>{row.bmp_temperature_c ?? '--'} °C</td>
                  <td style={{ color: '#06b6d4' }}>{row.humidity_percent ?? '--'} %</td>
                  <td style={{ color: '#10b981' }}>{row.pressure_hpa ? `${row.pressure_hpa} hPa` : (row.pressure_pa ? `${row.pressure_pa} Pa` : '--')}</td>
                  <td style={{ color: '#f59e0b' }}>{row.light_raw ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default App
