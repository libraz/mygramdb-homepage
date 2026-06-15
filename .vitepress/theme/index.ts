import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import { useData } from 'vitepress'
import BenchChart from './components/BenchChart.vue'
import HeroPanel from './components/HeroPanel.vue'
import './custom.css'

/** Locale-aware copy for the hero kicker + meta line. */
function heroCopy(isJa: boolean) {
  return isJa
    ? {
        kicker: 'インメモリ検索エンジン',
        meta: ['MITライセンス', '単一バイナリ', 'MySQL & MariaDB', 'v1.7'],
      }
    : {
        kicker: 'In-memory search engine',
        meta: ['MIT licensed', 'Single binary', 'MySQL & MariaDB', 'v1.7'],
      }
}

const Layout = () => {
  const { lang } = useData()
  const isJa = lang.value.startsWith('ja')
  const copy = heroCopy(isJa)

  return h(DefaultTheme.Layout, null, {
    'home-hero-info-before': () =>
      h('div', { class: 'hero-kicker' }, [h('span', { class: 'dot' }), copy.kicker]),
    'home-hero-image': () => h(HeroPanel),
    'home-hero-actions-after': () =>
      h(
        'div',
        { class: 'hero-meta' },
        copy.meta.flatMap((t, i) =>
          i === 0 ? [h('span', t)] : [h('span', { class: 'sep' }), h('span', t)]
        )
      ),
  })
}

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('BenchChart', BenchChart)
  },
}
