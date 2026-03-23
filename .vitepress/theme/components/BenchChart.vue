<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

interface DataPoint {
  label: string
  mysql: number
  mygramdb: number
}

const props = withDefaults(defineProps<{
  title: string
  data: DataPoint[]
  unit?: string
}>(), {
  unit: 'ms'
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chartInstance: any = null

const isQPS = props.unit.trim() === 'QPS'

function formatValue(v: number): string {
  if (isQPS) {
    if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
    return v.toFixed(0)
  }
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 }) + 'ms'
  if (v >= 10) return v.toFixed(0) + 'ms'
  if (v >= 1) return v.toFixed(1) + 'ms'
  return v.toFixed(2) + 'ms'
}

function getSpeedup(mysql: number, mg: number): string {
  if (mg <= 0 || mysql <= 0) return ''
  const r = isQPS ? mg / mysql : mysql / mg
  if (r >= 1000) return `${(r / 1000).toFixed(1)}K×`
  if (r >= 10) return `${r.toFixed(0)}×`
  return `${r.toFixed(1)}×`
}

async function renderChart() {
  if (!canvasRef.value) return

  const { Chart, BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend } = await import('chart.js')
  Chart.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend)

  if (chartInstance) {
    chartInstance.destroy()
  }

  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#ffffffde' : '#1a1a1a'
  const textDim = isDark ? '#ffffff80' : '#00000066'
  const gridColor = isDark ? '#ffffff12' : '#0000000a'
  const mysqlColor = isDark ? '#ff6b6b' : '#d63031'
  const mgColor = isDark ? '#55efc4' : '#00b894'

  // Normalize: MySQL = 100%, MygramDB = relative
  // Normalize: max value across the entire chart = 100%, minimum 1.5% for visibility
  const minPct = 1.5
  const globalMax = Math.max(...props.data.flatMap(d => [d.mysql, d.mygramdb]))
  const mysqlPct = props.data.map(d => Math.max((d.mysql / globalMax) * 100, minPct))
  const mgPct = props.data.map(d => Math.max((d.mygramdb / globalMax) * 100, minPct))

  const labels = props.data.map(d => d.label)

  chartInstance = new Chart(canvasRef.value, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'MySQL FULLTEXT',
          data: mysqlPct,
          backgroundColor: mysqlColor + 'bb',
          borderColor: mysqlColor,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        },
        {
          label: 'MygramDB',
          data: mgPct,
          backgroundColor: mgColor + 'bb',
          borderColor: mgColor,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 500,
        easing: 'easeOutQuart',
      },
      layout: {
        padding: { right: 4, left: 4, top: 0, bottom: 0 }
      },
      scales: {
        x: {
          display: false,
          max: 105,
        },
        y: {
          ticks: {
            color: textColor,
            font: { size: 12, weight: '500' as any, family: "'Space Grotesk', sans-serif" },
            padding: 6,
          },
          grid: { display: false },
          border: { display: false },
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          align: 'start' as const,
          labels: {
            color: textColor,
            font: { size: 11, family: "'Space Grotesk', sans-serif" },
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 3,
            useBorderRadius: true,
            padding: 16,
          },
        },
        tooltip: {
          enabled: false,
        },
      }
    },
    plugins: [
      {
        // Draw actual values and speedup next to bars
        id: 'valueLabels',
        afterDraw(chart: any) {
          const ctx = chart.ctx
          const meta0 = chart.getDatasetMeta(0)
          const meta1 = chart.getDatasetMeta(1)

          for (let i = 0; i < props.data.length; i++) {
            const bar0 = meta0.data[i]
            const bar1 = meta1.data[i]
            if (!bar0 || !bar1) continue

            const d = props.data[i]

            // MySQL value on bar
            ctx.save()
            ctx.font = '500 10px "Space Grotesk", sans-serif'
            ctx.textBaseline = 'middle'
            const mysqlText = formatValue(d.mysql)
            const mgText = formatValue(d.mygramdb)

            // MySQL: value inside or outside bar
            const mysqlTextW = ctx.measureText(mysqlText).width
            if (bar0.width > mysqlTextW + 16) {
              ctx.fillStyle = '#fff'
              ctx.textAlign = 'right'
              ctx.fillText(mysqlText, bar0.x - 6, bar0.y)
            } else {
              ctx.fillStyle = textDim
              ctx.textAlign = 'left'
              ctx.fillText(mysqlText, bar0.x + 6, bar0.y)
            }

            // MygramDB: value inside or outside bar
            const mgTextW = ctx.measureText(mgText).width
            if (bar1.width > mgTextW + 16) {
              ctx.fillStyle = '#fff'
              ctx.textAlign = 'right'
              ctx.fillText(mgText, bar1.x - 6, bar1.y)
            } else {
              ctx.fillStyle = textDim
              ctx.textAlign = 'left'
              ctx.fillText(mgText, bar1.x + 6, bar1.y)
            }

            // Speedup badge — right side
            const sp = getSpeedup(d.mysql, d.mygramdb)
            if (sp) {
              const badgeX = chart.chartArea.right + 8
              const badgeY = (bar0.y + bar1.y) / 2

              ctx.font = '700 11px "Space Grotesk", sans-serif'
              const spW = ctx.measureText(sp).width

              // Pill background
              ctx.fillStyle = isDark ? '#55efc420' : '#00b89415'
              const pillW = spW + 14
              const pillH = 20
              const pillX = badgeX - 2
              const pillY = badgeY - pillH / 2
              ctx.beginPath()
              ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2)
              ctx.fill()

              // Pill text
              ctx.fillStyle = isDark ? '#55efc4' : '#00b894'
              ctx.textAlign = 'left'
              ctx.textBaseline = 'middle'
              ctx.fillText(sp, badgeX + 5, badgeY)
            }

            ctx.restore()
          }
        }
      },
    ]
  })
}

onMounted(() => {
  nextTick(() => renderChart())

  // Re-render on dark mode toggle
  const observer = new MutationObserver(() => {
    nextTick(() => renderChart())
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })
})
</script>

<template>
  <div class="bench-chart-wrap">
    <h4 class="bench-chart-title">{{ title }}</h4>
    <div class="bench-chart-inner" :style="{ height: (data.length * 64 + 48) + 'px' }">
      <canvas ref="canvasRef" />
    </div>
  </div>
</template>

<style scoped>
.bench-chart-wrap {
  margin: 1.5rem 0;
  padding: 1rem 1.25rem 0.75rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
}

.bench-chart-title {
  margin: 0 0 0.25rem 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  letter-spacing: 0.01em;
}

.bench-chart-inner {
  position: relative;
  width: 100%;
}
</style>
