<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import BenchChart from './BenchChart.vue'
import benchmark from '../../../src/data/benchmark-v1.9.0.json'

const { lang } = useData()
const isJa = computed(() => lang.value.startsWith('ja'))

const copy = computed(() =>
  isJa.value
    ? {
        environment: '計測条件',
        environmentText: `${benchmark.run.datasetRows.toLocaleString()}件のWikipedia記事、MySQL ${benchmark.run.mysqlVersion} FULLTEXT（ngram パーサー）、MygramDB v${benchmark.run.mygramdbVersion}、verify_text: ${benchmark.run.verifyText}、クエリキャッシュ無効。レイテンシは${benchmark.run.iterations}回計測のp50です。`,
        search: '検索レイテンシ（SORT id LIMIT 100）',
        cjk: 'CJK検索レイテンシ（SORT id LIMIT 100）',
        count: 'COUNT性能',
        consistency: '結果一致性',
        concurrent: '並列スループット',
        memory: 'メモリ使用量',
        queryType: 'クエリタイプ', query: 'クエリ', matches: 'マッチ数', countLabel: 'カウント',
        mysql: 'MySQL', mygramdb: 'MygramDB', speedup: '高速化', match: '一致',
        connections: '接続数', mysqlQps: 'MySQL QPS', mygramdbQps: 'MygramDB QPS', mysqlP50: 'MySQL p50', mygramdbP50: 'MygramDB p50',
        documents: 'ドキュメント数', index: 'インデックス', documentsText: 'ドキュメント+テキスト', rss: 'RSS合計', perMillion: '100万件あたり',
        exact: '一致',
        concurrentNote: `クエリ: "algorithm"、接続数ごとに${benchmark.run.concurrentDurationSeconds}秒。`,
        memoryNote: `Docker Desktopには${benchmark.run.dockerMemoryGiB} GiBを割り当て、コンテナからは${benchmark.run.containerMemoryGiB} GiBが利用可能でした。`
      }
    : {
        environment: 'Benchmark Environment',
        environmentText: `${benchmark.run.datasetRows.toLocaleString()} Wikipedia articles, MySQL ${benchmark.run.mysqlVersion} FULLTEXT (ngram parser), MygramDB v${benchmark.run.mygramdbVersion}, verify_text: ${benchmark.run.verifyText}, and the query cache disabled. Latencies are p50 over ${benchmark.run.iterations} iterations.`,
        search: 'Search Latency (SORT id LIMIT 100)',
        cjk: 'CJK Search Latency (SORT id LIMIT 100)',
        count: 'COUNT Performance',
        consistency: 'Result Consistency',
        concurrent: 'Concurrent Throughput',
        memory: 'Memory Usage',
        queryType: 'Query Type', query: 'Query', matches: 'Matches', countLabel: 'Count',
        mysql: 'MySQL', mygramdb: 'MygramDB', speedup: 'Speedup', match: 'Match',
        connections: 'Connections', mysqlQps: 'MySQL QPS', mygramdbQps: 'MygramDB QPS', mysqlP50: 'MySQL p50', mygramdbP50: 'MygramDB p50',
        documents: 'Documents', index: 'Index', documentsText: 'Documents + Text', rss: 'Total RSS', perMillion: 'Per 1M docs',
        exact: 'exact',
        concurrentNote: `Query: "algorithm", ${benchmark.run.concurrentDurationSeconds} seconds per connection level.`,
        memoryNote: `Docker Desktop was allocated ${benchmark.run.dockerMemoryGiB} GiB; ${benchmark.run.containerMemoryGiB} GiB was visible to the containers.`
      }
)

const comma = (value: number) => value.toLocaleString('en-US')
const ms = (value: number) => `${value.toFixed(2)}ms`
const speedup = (mysql: number, mygramdb: number) => `${Math.round(mysql / mygramdb).toLocaleString('en-US')}x`
const searchChart = benchmark.search.map((row) => ({ label: row.label, mysql: row.mysqlP50Ms, mygramdb: row.mygramdbP50Ms }))
const cjkChart = benchmark.cjkSearch.map((row) => ({ label: row.label, mysql: row.mysqlP50Ms, mygramdb: row.mygramdbP50Ms }))
const countChart = benchmark.count.map((row) => ({ label: row.label, mysql: row.mysqlP50Ms, mygramdb: row.mygramdbP50Ms }))
const concurrentChart = computed(() => benchmark.concurrent.map((row) => ({ label: `${row.connections} ${isJa.value ? '接続' : row.connections === 1 ? 'connection' : 'connections'}`, mysql: row.mysqlQps, mygramdb: row.mygramdbQps })))
</script>

<template>
  <h2>{{ copy.environment }}</h2>
  <p>{{ copy.environmentText }}</p>

  <h2>{{ copy.search }}</h2>
  <BenchChart :title="`${copy.search} (p50, log scale)`" :data="searchChart" />
  <table>
    <thead><tr><th>{{ copy.queryType }}</th><th>{{ copy.matches }}</th><th>{{ copy.mysql }}</th><th>{{ copy.mygramdb }}</th><th>{{ copy.speedup }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.search" :key="row.query"><td>{{ row.label }} ("{{ row.query }}")</td><td>{{ comma(row.matches) }}</td><td>{{ ms(row.mysqlP50Ms) }}</td><td>{{ ms(row.mygramdbP50Ms) }}</td><td>{{ speedup(row.mysqlP50Ms, row.mygramdbP50Ms) }}</td></tr></tbody>
  </table>

  <h2>{{ copy.cjk }}</h2>
  <BenchChart :title="`${copy.cjk} (p50, log scale)`" :data="cjkChart" />
  <table>
    <thead><tr><th>{{ copy.query }}</th><th>{{ copy.matches }}</th><th>{{ copy.mysql }}</th><th>{{ copy.mygramdb }}</th><th>{{ copy.speedup }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.cjkSearch" :key="row.query"><td>{{ row.query }}</td><td>{{ comma(row.matches) }}</td><td>{{ ms(row.mysqlP50Ms) }}</td><td>{{ ms(row.mygramdbP50Ms) }}</td><td>{{ speedup(row.mysqlP50Ms, row.mygramdbP50Ms) }}</td></tr></tbody>
  </table>

  <h2>{{ copy.count }}</h2>
  <BenchChart :title="`${copy.count} (p50, log scale)`" :data="countChart" />
  <table>
    <thead><tr><th>{{ copy.queryType }}</th><th>{{ copy.countLabel }}</th><th>{{ copy.mysql }}</th><th>{{ copy.mygramdb }}</th><th>{{ copy.speedup }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.count" :key="row.query"><td>{{ row.label }} ("{{ row.query }}")</td><td>{{ comma(row.matches) }}</td><td>{{ ms(row.mysqlP50Ms) }}</td><td>{{ ms(row.mygramdbP50Ms) }}</td><td>{{ speedup(row.mysqlP50Ms, row.mygramdbP50Ms) }}</td></tr></tbody>
  </table>

  <h2>{{ copy.consistency }}</h2>
  <table>
    <thead><tr><th>{{ copy.query }}</th><th>{{ copy.mysql }}</th><th>{{ copy.mygramdb }}</th><th>{{ copy.match }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.consistency" :key="row.query"><td>{{ row.query }}</td><td>{{ comma(row.matches) }}</td><td>{{ comma(row.matches) }}</td><td>{{ copy.exact }}</td></tr></tbody>
  </table>

  <h2>{{ copy.concurrent }}</h2>
  <BenchChart :title="`${copy.concurrent} — QPS`" :data="concurrentChart" unit=" QPS" />
  <p>{{ copy.concurrentNote }}</p>
  <table>
    <thead><tr><th>{{ copy.connections }}</th><th>{{ copy.mysqlQps }}</th><th>{{ copy.mygramdbQps }}</th><th>{{ copy.mysqlP50 }}</th><th>{{ copy.mygramdbP50 }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.concurrent" :key="row.connections"><td>{{ row.connections }}</td><td>{{ row.mysqlQps.toFixed(2) }}</td><td>{{ comma(row.mygramdbQps) }}</td><td>{{ ms(row.mysqlP50Ms) }}</td><td>{{ ms(row.mygramdbP50Ms) }}</td></tr></tbody>
  </table>

  <h2>{{ copy.memory }}</h2>
  <table>
    <thead><tr><th>{{ copy.documents }}</th><th>{{ copy.index }}</th><th>{{ copy.documentsText }}</th><th>{{ copy.rss }}</th><th>{{ copy.perMillion }}</th></tr></thead>
    <tbody><tr><td>{{ comma(benchmark.run.datasetRows) }}</td><td>{{ benchmark.memory.indexMb }}MB</td><td>{{ benchmark.memory.documentsGb }}GB</td><td>{{ benchmark.memory.processRssGb }}GB</td><td>~{{ benchmark.memory.perMillionDocumentsGb }}GB</td></tr></tbody>
  </table>
  <p>{{ copy.memoryNote }}</p>
</template>
