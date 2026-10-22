<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import BenchChart from './BenchChart.vue'
import benchmark from '../../../src/data/benchmark-v1.10.0.json'

const { lang } = useData()
const isJa = computed(() => lang.value.startsWith('ja'))

const base = benchmark.baseline
const workingSetMb = base.tableDataMb + base.tableIndexMb + base.ftsAuxMb

const copy = computed(() =>
  isJa.value
    ? {
        environment: '計測条件',
        environmentText: `${benchmark.run.datasetRows.toLocaleString()}件のWikipedia記事、MySQL ${benchmark.run.mysqlVersion} FULLTEXT（ngram パーサー）、MygramDB v${benchmark.run.mygramdbVersion}、verify_text: ${benchmark.run.verifyText}、クエリキャッシュ無効。1クエリあたり${benchmark.run.iterations}回計測（ウォームアップ${benchmark.run.warmup}回は除外）し、下表には p50 と p99 を載せています。計測機は ${benchmark.run.host}（${benchmark.run.hostCores}コア / ${benchmark.run.hostMemoryGiB}GB）。`,
        baseline: '対照のMySQLに与えた条件',
        baselineText: `MygramDBはインデックス全体をメモリに置くため、既定の128MBバッファプールのままのMySQLと比べると、相手がしなくてよいディスクI/Oを測ることになります。そこでバッファプールを${base.innodbBufferPoolGiB}GiBに設定しました。テーブル${base.tableDataMb}MB、副次インデックス${base.tableIndexMb}MB、FULLTEXT補助テーブル${base.ftsAuxMb}MBの合計約${(workingSetMb / 1024).toFixed(1)}GiBが丸ごと収まる量です。`,
        baselineEvidence: `この計測中、MySQL はページ要求の ${base.bufferPoolHitRatioPct}% にバッファプールから応答し、ディスク読み込みは ${base.diskReadsDuringRun.toLocaleString()} 回でした。クエリごとにディスクを読む条件での比較ではありません。応答時間にはインデックス構造に加え、実行計画、ソート、同時実行時の処理も影響します。`,
        portability: '倍率と絶対値の扱い',
        portabilityText: `応答時間も速度比も、ハードウェア、データ、クエリ、設定によって変わります。自分の環境では make bench-up && make bench-run で同じ計測を再現できます。`,
        summary: `このデータセットでの高速化は中央値${benchmark.summary.medianSpeedup}倍、最良${benchmark.summary.bestSpeedup}倍、最悪${benchmark.summary.worstSpeedup}倍です。`,
        search: '検索レイテンシ（SORT id LIMIT 100）',
        cjk: 'CJK検索レイテンシ（SORT id LIMIT 100）',
        count: 'COUNT性能',
        consistency: '結果一致性',
        concurrent: '並列スループット',
        memory: 'メモリ使用量',
        queryType: 'クエリタイプ', query: 'クエリ', matches: 'マッチ数', countLabel: 'カウント',
        mysql: 'MySQL', mygramdb: 'MygramDB', speedup: '高速化', match: '一致',
        p50: 'p50', p99: 'p99',
        connections: '接続数', mysqlQps: 'MySQL QPS', mygramdbQps: 'MygramDB QPS',
        documents: 'ドキュメント数', index: 'インデックス', documentsText: 'ドキュメント+テキスト', rss: 'RSS合計', perMillion: '100万件あたり',
        exact: '一致',
        concurrentNote: `クエリ: "algorithm"、接続数ごとに${benchmark.run.concurrentDurationSeconds}秒。`,
        chartNote: '棒の長さはグラフ内の最大値に対する割合です。小さな値にも表示用の最小幅があるため、正確な値と速度比は表を参照してください。',
        memoryNote: `Docker Desktopには${benchmark.run.dockerMemoryGiB} GiBを割り当て、コンテナからは${benchmark.run.containerMemoryGiB} GiBが利用可能でした。`
      }
    : {
        environment: 'Benchmark Environment',
        environmentText: `${benchmark.run.datasetRows.toLocaleString()} Wikipedia articles, MySQL ${benchmark.run.mysqlVersion} FULLTEXT (ngram parser), MygramDB v${benchmark.run.mygramdbVersion}, verify_text: ${benchmark.run.verifyText}, and the query cache disabled. Each query is measured ${benchmark.run.iterations} times after ${benchmark.run.warmup} discarded warmup runs; the tables below report p50 and p99. Measured on ${benchmark.run.host} (${benchmark.run.hostCores} cores, ${benchmark.run.hostMemoryGiB}GB).`,
        baseline: 'What the MySQL baseline was given',
        baselineText: `MygramDB holds its whole index in RAM, so a MySQL left on the default 128MB buffer pool would be measured on disk I/O its opponent never had to do. The pool is set to ${base.innodbBufferPoolGiB}GiB instead — enough to hold the ${base.tableDataMb}MB table, its ${base.tableIndexMb}MB of secondary indexes and the ${base.ftsAuxMb}MB of FULLTEXT auxiliary tables outright, about ${(workingSetMb / 1024).toFixed(1)}GiB in all.`,
        baselineEvidence: `During this run MySQL served ${base.bufferPoolHitRatioPct}% of its page requests from the buffer pool, with ${base.diskReadsDuringRun.toLocaleString()} disk reads. The comparison does not assume a disk read on every query. Index structure, execution plans, sorting, and concurrency can all affect the measured latency.`,
        portability: 'Applying these results to another deployment',
        portabilityText: `Both latency and speedup ratios depend on hardware, data, queries, and configuration. Run make bench-up && make bench-run to repeat the benchmark on your own hardware.`,
        summary: `On this dataset the speedup is ${benchmark.summary.medianSpeedup}x at the median, ${benchmark.summary.bestSpeedup}x at best and ${benchmark.summary.worstSpeedup}x at worst.`,
        search: 'Search Latency (SORT id LIMIT 100)',
        cjk: 'CJK Search Latency (SORT id LIMIT 100)',
        count: 'COUNT Performance',
        consistency: 'Result Consistency',
        concurrent: 'Concurrent Throughput',
        memory: 'Memory Usage',
        queryType: 'Query Type', query: 'Query', matches: 'Matches', countLabel: 'Count',
        mysql: 'MySQL', mygramdb: 'MygramDB', speedup: 'Speedup', match: 'Match',
        p50: 'p50', p99: 'p99',
        connections: 'Connections', mysqlQps: 'MySQL QPS', mygramdbQps: 'MygramDB QPS',
        documents: 'Documents', index: 'Index', documentsText: 'Documents + Text', rss: 'Total RSS', perMillion: 'Per 1M docs',
        exact: 'exact',
        concurrentNote: `Query: "algorithm", ${benchmark.run.concurrentDurationSeconds} seconds per connection level.`,
        chartNote: 'Bars are scaled to the largest value in each chart, with a minimum visible width for small values. Use the tables for exact values and speedup ratios.',
        memoryNote: `Docker Desktop was allocated ${benchmark.run.dockerMemoryGiB} GiB; ${benchmark.run.containerMemoryGiB} GiB was visible to the containers.`
      }
)

const comma = (value: number) => value.toLocaleString('en-US')
const ms = (value: number) => `${value.toFixed(2)}ms`
const times = (value: number) => `${value.toLocaleString('en-US')}x`
const searchChart = benchmark.search.map((row) => ({ label: row.label, mysql: row.mysql.p50Ms, mygramdb: row.mygramdb.p50Ms }))
const cjkChart = benchmark.cjkSearch.map((row) => ({ label: row.label, mysql: row.mysql.p50Ms, mygramdb: row.mygramdb.p50Ms }))
const countChart = benchmark.count.map((row) => ({ label: row.label, mysql: row.mysql.p50Ms, mygramdb: row.mygramdb.p50Ms }))
const concurrentChart = computed(() => benchmark.concurrent.map((row) => ({ label: `${row.connections} ${isJa.value ? '接続' : row.connections === 1 ? 'connection' : 'connections'}`, mysql: row.mysqlQps, mygramdb: row.mygramdbQps })))
</script>

<template>
  <h2>{{ copy.environment }}</h2>
  <p>{{ copy.environmentText }}</p>
  <p>{{ copy.summary }}</p>

  <h2>{{ copy.baseline }}</h2>
  <p>{{ copy.baselineText }}</p>
  <p>{{ copy.baselineEvidence }}</p>

  <h2>{{ copy.portability }}</h2>
  <p>{{ copy.portabilityText }}</p>

  <h2>{{ copy.search }}</h2>
  <p>{{ copy.chartNote }}</p>
  <BenchChart :title="`${copy.search} (p50)`" :data="searchChart" />
  <table>
    <thead><tr><th>{{ copy.queryType }}</th><th>{{ copy.matches }}</th><th>{{ copy.mysql }} {{ copy.p50 }}</th><th>{{ copy.mysql }} {{ copy.p99 }}</th><th>{{ copy.mygramdb }} {{ copy.p50 }}</th><th>{{ copy.mygramdb }} {{ copy.p99 }}</th><th>{{ copy.speedup }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.search" :key="row.query"><td>{{ row.label }} ("{{ row.query }}")</td><td>{{ comma(row.matches) }}</td><td>{{ ms(row.mysql.p50Ms) }}</td><td>{{ ms(row.mysql.p99Ms) }}</td><td>{{ ms(row.mygramdb.p50Ms) }}</td><td>{{ ms(row.mygramdb.p99Ms) }}</td><td>{{ times(row.speedup) }}</td></tr></tbody>
  </table>

  <h2>{{ copy.cjk }}</h2>
  <BenchChart :title="`${copy.cjk} (p50)`" :data="cjkChart" />
  <table>
    <thead><tr><th>{{ copy.query }}</th><th>{{ copy.matches }}</th><th>{{ copy.mysql }} {{ copy.p50 }}</th><th>{{ copy.mysql }} {{ copy.p99 }}</th><th>{{ copy.mygramdb }} {{ copy.p50 }}</th><th>{{ copy.mygramdb }} {{ copy.p99 }}</th><th>{{ copy.speedup }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.cjkSearch" :key="row.query"><td>{{ row.query }}</td><td>{{ comma(row.matches) }}</td><td>{{ ms(row.mysql.p50Ms) }}</td><td>{{ ms(row.mysql.p99Ms) }}</td><td>{{ ms(row.mygramdb.p50Ms) }}</td><td>{{ ms(row.mygramdb.p99Ms) }}</td><td>{{ times(row.speedup) }}</td></tr></tbody>
  </table>

  <h2>{{ copy.count }}</h2>
  <BenchChart :title="`${copy.count} (p50)`" :data="countChart" />
  <table>
    <thead><tr><th>{{ copy.queryType }}</th><th>{{ copy.countLabel }}</th><th>{{ copy.mysql }} {{ copy.p50 }}</th><th>{{ copy.mysql }} {{ copy.p99 }}</th><th>{{ copy.mygramdb }} {{ copy.p50 }}</th><th>{{ copy.mygramdb }} {{ copy.p99 }}</th><th>{{ copy.speedup }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.count" :key="row.query"><td>{{ row.label }} ("{{ row.query }}")</td><td>{{ comma(row.count) }}</td><td>{{ ms(row.mysql.p50Ms) }}</td><td>{{ ms(row.mysql.p99Ms) }}</td><td>{{ ms(row.mygramdb.p50Ms) }}</td><td>{{ ms(row.mygramdb.p99Ms) }}</td><td>{{ times(row.speedup) }}</td></tr></tbody>
  </table>

  <h2>{{ copy.consistency }}</h2>
  <table>
    <thead><tr><th>{{ copy.query }}</th><th>{{ copy.mysql }}</th><th>{{ copy.mygramdb }}</th><th>{{ copy.match }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.consistency" :key="row.query"><td>{{ row.query }}</td><td>{{ comma(row.mysqlCount) }}</td><td>{{ comma(row.mygramdbCount) }}</td><td>{{ row.diff === 0 ? copy.exact : `${row.diff > 0 ? '+' : ''}${comma(row.diff)}` }}</td></tr></tbody>
  </table>

  <h2>{{ copy.concurrent }}</h2>
  <BenchChart :title="`${copy.concurrent} — QPS`" :data="concurrentChart" unit=" QPS" />
  <p>{{ copy.concurrentNote }}</p>
  <table>
    <thead><tr><th>{{ copy.connections }}</th><th>{{ copy.mysqlQps }}</th><th>{{ copy.mygramdbQps }}</th><th>{{ copy.mysql }} {{ copy.p50 }}</th><th>{{ copy.mysql }} {{ copy.p99 }}</th><th>{{ copy.mygramdb }} {{ copy.p50 }}</th><th>{{ copy.mygramdb }} {{ copy.p99 }}</th></tr></thead>
    <tbody><tr v-for="row in benchmark.concurrent" :key="row.connections"><td>{{ row.connections }}</td><td>{{ row.mysqlQps.toFixed(2) }}</td><td>{{ comma(row.mygramdbQps) }}</td><td>{{ ms(row.mysqlP50Ms) }}</td><td>{{ ms(row.mysqlP99Ms) }}</td><td>{{ ms(row.mygramdbP50Ms) }}</td><td>{{ ms(row.mygramdbP99Ms) }}</td></tr></tbody>
  </table>

  <h2>{{ copy.memory }}</h2>
  <table>
    <thead><tr><th>{{ copy.documents }}</th><th>{{ copy.index }}</th><th>{{ copy.documentsText }}</th><th>{{ copy.rss }}</th><th>{{ copy.perMillion }}</th></tr></thead>
    <tbody><tr><td>{{ comma(benchmark.run.datasetRows) }}</td><td>{{ benchmark.memory.indexMb }}MB</td><td>{{ benchmark.memory.documentsGb }}GB</td><td>{{ benchmark.memory.processRssGb }}GB</td><td>~{{ benchmark.memory.perMillionDocumentsGb }}GB</td></tr></tbody>
  </table>
  <p>{{ copy.memoryNote }}</p>
</template>
