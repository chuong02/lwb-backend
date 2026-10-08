import { useEffect, useState } from 'react'
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
  const [selectedNode, setSelectedNode] = useState(null)

  const [latest, setLatest] = useState(null)
  const [history, setHistory] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)


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
          setSelectedNode(data[0].node_id)
        }

      } catch (err) {
        setError(err.message)
      }
    }

    loadNodes()
  }, [])


  useEffect(() => {
    if (selectedNode === null) {
      return
    }

    async function loadSensorData() {
      try {
        const latestResponse = await fetch(
          `/api/nodes/${selectedNode}/latest/`
        )

        const historyResponse = await fetch(
          `/api/nodes/${selectedNode}/history/?limit=100`
        )

        if (!latestResponse.ok) {
          throw new Error('Không thể tải dữ liệu mới nhất')
        }

        if (!historyResponse.ok) {
          throw new Error('Không thể tải dữ liệu lịch sử')
        }

        const latestData = await latestResponse.json()
        const historyData = await historyResponse.json()

        setLatest(latestData)

        setHistory(
          [...historyData]
            .reverse()
            .map((item) => ({
              ...item,
              time: new Date(
                item.recv_ts_utc
              ).toLocaleTimeString(),
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

    const timer = setInterval(
      loadSensorData,
      5000
    )

    return () => clearInterval(timer)

  }, [selectedNode])


  return (
    <div className="dashboard">

      <header className="topbar">

        <div>
          <h1>LWB Environmental Monitoring</h1>
          <p>AIoT Wireless Sensor Network Dashboard</p>
        </div>

        <div className="node-selector">

          <label>Node</label>

          <select
            value={selectedNode ?? ''}
            onChange={(event) =>
              setSelectedNode(
                Number(event.target.value)
              )
            }
          >

            {nodes.map((node) => (
              <option
                key={`${node.gateway_id}-${node.node_id}`}
                value={node.node_id}
              >
                Node {node.node_id}
              </option>
            ))}

          </select>

        </div>

      </header>


      {error && (
        <div className="error-box">
          {error}
        </div>
      )}


      {loading && !latest && (
        <div className="loading">
          Đang tải dữ liệu...
        </div>
      )}


      {latest && (
        <>

          <section className="cards">

            <SensorCard
              title="Temperature"
              value={latest.temperature_c}
              unit="°C"
            />

            <SensorCard
              title="Humidity"
              value={latest.humidity_percent}
              unit="%"
            />

            <SensorCard
              title="Light"
              value={latest.light_raw}
              unit="raw"
            />

            <SensorCard
              title="Pressure"
              value={latest.pressure_pa}
              unit="Pa"
            />

            <SensorCard
              title="BMP Temperature"
              value={latest.bmp_temperature_c}
              unit="°C"
            />

          </section>


          <section className="panel">

            <div className="panel-header">

              <div>
                <h2>Environmental History</h2>
                <p>
                  Gateway: border-router · Node {latest.node_id}
                </p>
              </div>

              <div className="last-update">
                Last update
                <strong>
                  {new Date(
                    latest.recv_ts_utc
                  ).toLocaleString()}
                </strong>
              </div>

            </div>


            <div className="chart-container">

              <ResponsiveContainer
                width="100%"
                height={380}
              >

                <LineChart data={history}>

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="time"
                  />

                  <YAxis />

                  <Tooltip />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="temperature_c"
                    name="Temperature (°C)"
                    stroke="#2563eb"
                    strokeWidth={2}
                  />

                  <Line
                    type="monotone"
                    dataKey="humidity_percent"
                    name="Humidity (%)"
                    stroke="#16a34a"
                    strokeWidth={2}
                  />

                </LineChart>

              </ResponsiveContainer>

            </div>

          </section>

        </>
      )}

    </div>
  )
}


function SensorCard({
  title,
  value,
  unit,
}) {
  return (
    <div className="sensor-card">

      <div className="card-title">
        {title}
      </div>

      <div className="card-value">
        {value ?? '--'}
      </div>

      <div className="card-unit">
        {unit}
      </div>

    </div>
  )
}


export default App
