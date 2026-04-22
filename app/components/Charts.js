'use client'
import { useEffect, useRef } from 'react'

export function DoughnutChart({ labels, data, colors, height = 220 }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return
    import('chart.js/auto').then(({ Chart }) => {
      if (chartRef.current) chartRef.current.destroy()
      chartRef.current = new Chart(canvasRef.current, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: 'var(--surface)',
            hoverBorderColor: 'var(--surface)',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { size: 11 }, padding: 12, boxWidth: 12 },
            },
          },
        },
      })
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [labels, data, colors])

  return <div style={{ height, position: 'relative' }}><canvas ref={canvasRef} /></div>
}

export function LineChart({ labels, datasets, height = 220 }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return
    import('chart.js/auto').then(({ Chart }) => {
      if (chartRef.current) chartRef.current.destroy()
      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
              grid: { color: 'rgba(148,163,184,0.2)' },
            },
            y: {
              ticks: { font: { size: 10 } },
              grid: { color: 'rgba(148,163,184,0.2)' },
              beginAtZero: true,
            },
          },
          plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 12 } },
          },
        },
      })
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [labels, datasets])

  return <div style={{ height, position: 'relative' }}><canvas ref={canvasRef} /></div>
}

export function BarChart({ labels, data, colors, height = 220, horizontal = false, label = 'Tickets' }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    import('chart.js/auto').then(({ Chart }) => {
      if (cancelled) return
      if (chartRef.current) chartRef.current.destroy()
      const bg = Array.isArray(colors) ? colors : (colors || 'rgba(37,99,235,0.75)')
      chartRef.current = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label,
            data,
            backgroundColor: bg,
            borderRadius: 5,
            borderWidth: 0,
          }],
        },
        options: {
          indexAxis: horizontal ? 'y' : 'x',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { font: { size: 10 } },
              grid: { color: 'rgba(148,163,184,0.15)' },
              beginAtZero: horizontal,
            },
            y: {
              ticks: { font: { size: 10 } },
              grid: { display: !horizontal, color: 'rgba(148,163,184,0.15)' },
              beginAtZero: !horizontal,
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed[horizontal ? 'x' : 'y']} tickets` } },
          },
        },
      })
    })
    return () => {
      cancelled = true
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    }
  }, [labels, data, colors, horizontal, label])

  return <div style={{ height, position: 'relative' }}><canvas ref={canvasRef} /></div>
}
