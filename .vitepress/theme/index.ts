import DefaultTheme from 'vitepress/theme'
import BenchChart from './components/BenchChart.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('BenchChart', BenchChart)
  }
}
