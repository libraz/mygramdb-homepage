<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import benchmark from '../../../src/data/benchmark-v1.10.0.json'

/**
 * Hero "instrument readout" — a quiet, static latency comparison panel.
 * Shows the core contrast: MySQL FULLTEXT (disk) vs MygramDB (in-memory).
 */
const { lang } = useData()
const isJa = computed(() => lang.value.startsWith('ja'))
const featured = benchmark.search[0]

const t = computed(() =>
  isJa.value
    ? { label: '検索レイテンシ', tag: 'インメモリ', note: `このクエリで${Math.round(featured.speedup)}× · 全クエリ中央値${benchmark.summary.medianSpeedup}× · ${benchmark.run.datasetRows.toLocaleString()}件 p50` }
    : { label: 'SEARCH LATENCY', tag: 'in-memory', note: `${Math.round(featured.speedup)}× on this query · ${benchmark.summary.medianSpeedup}× median across all · p50 on ${benchmark.run.datasetRows.toLocaleString()} docs` }
)
</script>

<template>
  <div class="mg-panel">
    <div class="mg-panel__head">
      <span class="mg-panel__label">{{ t.label }}</span>
      <span class="mg-panel__query">
        <span class="mg-panel__dot"></span>"quantum&nbsp;physics"
      </span>
    </div>

    <div class="mg-rows">
      <div class="mg-row">
        <div class="mg-row__top">
          <span class="mg-row__name">MySQL&nbsp;FULLTEXT</span>
          <span class="mg-row__val mg-row__val--slow">{{ featured.mysql.p50Ms.toFixed(0) }}<small>ms</small></span>
        </div>
        <div class="mg-track"><div class="mg-bar mg-bar--slow"></div></div>
      </div>

      <div class="mg-row">
        <div class="mg-row__top">
          <span class="mg-row__name">MygramDB<span class="mg-row__tag">{{ t.tag }}</span></span>
          <span class="mg-row__val mg-row__val--fast">{{ featured.mygramdb.p50Ms.toFixed(2) }}<small>ms</small></span>
        </div>
        <div class="mg-track"><div class="mg-bar mg-bar--fast"></div></div>
      </div>
    </div>

    <div class="mg-panel__foot">{{ t.note }}</div>
  </div>
</template>

<style scoped>
.mg-panel {
  width: 100%;
  max-width: 440px;
  margin-left: auto;
  padding: 22px 22px 18px;
  background: var(--mg-panel-bg);
  border: 1px solid var(--mg-panel-border);
  border-radius: 14px;
  font-family: var(--vp-font-family-mono);
}

.mg-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 20px;
}

.mg-panel__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--vp-c-text-3);
}

.mg-panel__query {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.mg-panel__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vp-c-brand-3);
}

.mg-rows {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mg-row__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.mg-row__name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.mg-row__tag {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-radius: 4px;
  padding: 1px 6px;
}

.mg-row__val {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.mg-row__val small {
  font-size: 0.62em;
  font-weight: 500;
  opacity: 0.7;
  margin-left: 1px;
}

.mg-row__val--slow { color: var(--mg-slow-2); }
.mg-row__val--fast { color: var(--vp-c-brand-1); }

.mg-track {
  height: 8px;
  border-radius: 5px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--mg-panel-border);
  overflow: hidden;
}

.mg-bar {
  height: 100%;
  border-radius: 5px;
}

.mg-bar--slow {
  width: 100%;
  background: var(--mg-slow-2);
  opacity: 0.85;
}

.mg-bar--fast {
  width: 4%;
  background: var(--vp-c-brand-2);
}

.mg-panel__foot {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 12px;
  color: var(--vp-c-text-3);
}

@media (max-width: 960px) {
  .mg-panel {
    margin: 0 auto;
    max-width: 460px;
  }
}
</style>
