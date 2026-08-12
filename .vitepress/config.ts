import { defineConfig } from 'vitepress'
import { generateLlmsTxt, llmsDevPlugin, type LlmsLocale } from './llms'
import mygramGrammar from './mygram.tmLanguage.mjs'
import benchmark from '../src/data/benchmark-v1.10.0.json'

const siteUrl = 'https://mygramdb.libraz.net'
const githubUrl = 'https://github.com/libraz/mygram-db'
const latestVersion = '1.10.0'

/** Per-locale structured data and social-card copy. Japanese answers mirror /ja/faq. */
type Locale = 'en' | 'ja'

const softwareApplicationJsonLd = (lang: Locale) => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MygramDB',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Linux, macOS',
  inLanguage: lang,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD'
  },
  description: lang === 'ja'
    ? 'MySQL の binlog をリアルタイムに取り込む、インメモリ全文検索エンジン。'
    : 'In-memory full-text search engine with real-time MySQL binlog replication.',
  url: lang === 'ja' ? `${siteUrl}/ja/` : siteUrl,
  downloadUrl: githubUrl,
  softwareVersion: latestVersion,
  author: {
    '@type': 'Person',
    name: 'libraz'
  },
  license: 'https://opensource.org/licenses/MIT',
  keywords: lang === 'ja'
    ? 'MySQL FULLTEXT, 全文検索, インメモリDB, MySQLレプリケーション, N-gram検索, 日本語検索'
    : 'MySQL FULLTEXT, full-text search, in-memory database, MySQL replication, N-gram search, CJK search'
})

const FAQ: Record<Locale, { q: string; a: string }[]> = {
  en: [
    {
      q: 'Why is MySQL FULLTEXT so slow?',
      a: 'MySQL FULLTEXT is slow because it stores indexes on disk using B-tree pages, requires disk I/O for every query, and uses uncompressed posting lists. MygramDB solves this with in-memory N-gram indexing delivering consistent millisecond-scale latency.'
    },
    {
      q: 'How does MygramDB sync with MySQL?',
      a: 'MygramDB uses GTID-based binlog replication to sync with MySQL in real-time. It acts as a MySQL replica, receiving changes via the binary log. No ETL pipelines or manual sync needed. Write to MySQL as usual, MygramDB updates automatically.'
    },
    {
      q: 'How much faster is MygramDB than MySQL FULLTEXT?',
      a: `The current reproducible benchmark compares MygramDB and MySQL FULLTEXT on ${benchmark.run.datasetRows.toLocaleString()} Wikipedia articles with MygramDB's query cache disabled. It includes search, COUNT, CJK, result-consistency, and concurrent-throughput results.`
    },
    {
      q: 'Does MygramDB support Japanese/Chinese/Korean text?',
      a: 'Yes, MygramDB has excellent CJK support using ICU-based Unicode normalization and N-gram tokenization. It handles Japanese, Chinese, and Korean text perfectly without additional plugins or configuration.'
    },
    {
      q: 'What is the difference between MygramDB and Elasticsearch?',
      a: 'MygramDB is a single-binary deployment with direct MySQL binlog sync, millisecond-scale latency, and low operational complexity. Elasticsearch offers distributed search and advanced features but requires cluster management, ETL pipelines, and JVM tuning. Choose MygramDB for simpler MySQL-based applications; Elasticsearch for large-scale distributed search.'
    }
  ],
  ja: [
    {
      q: 'MySQL FULLTEXTが遅いのはなぜですか？',
      a: 'ディスクI/O、非圧縮の転置リスト、キャッシュ依存、並列アクセス時の伸びにくさが主な原因です。MygramDBは検索インデックスをメモリ上に保持し、ミリ秒台のレイテンシで応答します。'
    },
    {
      q: 'MygramDBはMySQLとどう同期しますか？',
      a: 'GTIDベースのbinlogレプリケーションでリアルタイムに同期します。MygramDBはMySQLのレプリカとして振る舞い、バイナリログ経由で変更を受け取ります。ETLパイプラインや手動同期は不要で、MySQLに書き込めばMygramDB側は自動的に更新されます。'
    },
    {
      q: 'MygramDBはMySQL FULLTEXTよりどれくらい速いですか？',
      a: `現行の再現可能なベンチマークは、MygramDBのクエリキャッシュを無効にした状態で、Wikipedia記事${benchmark.run.datasetRows.toLocaleString()}件に対してMySQL FULLTEXTと比較しています。検索・COUNT・日本語検索・結果整合性・並列スループットの結果を公開しています。`
    },
    {
      q: 'MygramDBは日本語に対応していますか？',
      a: 'はい。ICUベースのUnicode正規化とN-gramトークナイズを使用しています。日本語・中国語・韓国語は追加プラグインや設定なしでそのまま動作します。'
    },
    {
      q: 'MygramDBとElasticsearchの違いは何ですか？',
      a: 'MygramDBはシングルバイナリで、MySQLのbinlogと直接同期し、ミリ秒台のレイテンシと低い運用コストで動きます。Elasticsearchは分散検索や高度な分析機能を備えますが、クラスタ管理・ETLパイプライン・JVMチューニングが必要です。データがRAMに収まりMySQLとのシンプルな連携が欲しいならMygramDB、複数ノードにまたがる大規模分散検索ならElasticsearchです。'
    }
  ]
}

const faqJsonLd = (lang: Locale) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  inLanguage: lang,
  mainEntity: FAQ[lang].map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a }
  }))
})

const SEO: Record<Locale, { title: string; description: string; keywords: string }> = {
  en: {
    title: 'MygramDB - In-memory full-text search with MySQL replication',
    description: `MySQL FULLTEXT too slow? MygramDB is an in-memory full-text search engine that syncs via MySQL replication. Millisecond-scale queries, up to ${benchmark.summary.bestSpeedup}x faster than FULLTEXT.`,
    keywords: 'MySQL FULLTEXT slow, MySQL full-text search slow, MySQL search timeout, MySQL FULLTEXT performance, MySQL search optimization, MySQL N-gram slow, MySQL FULLTEXT concurrent, MySQL FULLTEXT alternative, full-text search engine, in-memory search, MySQL replication, binlog search'
  },
  ja: {
    title: 'MygramDB - MySQLレプリケーションで同期するインメモリ全文検索',
    description: `MySQL FULLTEXTが遅い？MygramDBはMySQLレプリケーションで同期するインメモリ全文検索エンジンです。ミリ秒台のクエリで、FULLTEXT比 最大${benchmark.summary.bestSpeedup}倍。`,
    keywords: 'MySQL FULLTEXT 遅い, MySQL 全文検索 遅い, MySQL 検索 タイムアウト, MySQL FULLTEXT 性能, MySQL 検索 高速化, MySQL FULLTEXT 代替, 全文検索エンジン, インメモリ検索, MySQLレプリケーション, binlog 検索, 日本語 全文検索'
  }
}

/** `ja/docs/foo.md` -> `/ja/docs/foo`, `index.md` -> `/` */
function routeOf(relativePath: string): string {
  const clean = relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
  return `/${clean}`.replace(/\/{2,}/g, '/')
}

const localeOf = (relativePath: string): Locale => relativePath.startsWith('ja/') ? 'ja' : 'en'

/** The same page in the other language, or null when it has no counterpart. */
function alternateRoute(relativePath: string): string {
  return relativePath.startsWith('ja/')
    ? routeOf(relativePath.slice(3))
    : routeOf(`ja/${relativePath}`)
}

/** Prose for the per-locale llms.txt indexes; the page lists come from the nav/sidebar. */
const LLMS_LOCALES: LlmsLocale[] = [
  {
    key: 'root',
    prefix: '',
    title: 'MygramDB',
    summary:
      `In-memory full-text search engine that mirrors MySQL through binlog replication, built for CJK text where MySQL FULLTEXT falls short. Millisecond-scale queries, up to ${benchmark.summary.bestSpeedup}x faster than FULLTEXT.`,
    intro:
      'MygramDB indexes with character n-grams rather than word tokenization, so it needs no\ndictionary and no morphological analyzer. It follows a MySQL primary as a replica,\napplying row events as they arrive, and answers queries over its own wire protocol\nor HTTP. The links below point to the canonical HTML documentation.',
    overviewHeading: 'Key pages',
    homeText: 'MygramDB home',
    alternate: {
      heading: 'Japanese (日本語)',
      items: [
        {
          text: '日本語版インデックス',
          link: '/ja/llms.txt',
          description: 'The same index in Japanese, covering the /ja/ documentation.'
        }
      ]
    }
  },
  {
    key: 'ja',
    prefix: '/ja',
    title: 'MygramDB',
    summary:
      'MySQL の binlog をリアルタイムに取り込むインメモリ全文検索エンジン。日本語のような CJK テキストを想定し、MySQL FULLTEXT に対して最大 190 倍、ミリ秒台で応答する。',
    intro:
      'MygramDB は単語分割ではなく文字 N-gram で索引を作るため、辞書も形態素解析器も必要ない。\nMySQL のレプリカとして行イベントを逐次適用し、独自のワイヤプロトコルまたは HTTP で\nクエリに応答する。以下は日本語ドキュメントへのリンク一覧。',
    overviewHeading: '主要ページ',
    homeText: 'MygramDB トップ',
    alternate: {
      heading: 'English',
      items: [
        {
          text: 'English index',
          link: '/llms.txt',
          description: '英語ドキュメントを対象とした同じ構成のインデックス。'
        }
      ]
    }
  }
]

export default defineConfig({
  srcDir: 'src',
  appearance: true,
  title: 'MygramDB',
  description: 'MySQL FULLTEXT too slow? MygramDB makes it tens to hundreds of times faster. In-memory full-text search engine with MySQL replication.',

  // Markdown / Shiki syntax highlighting
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    // Custom Shiki language for MygramDB's query / wire-protocol syntax.
    // Canonical fence id: ```mygram (alias: ```mygramql).
    languages: [mygramGrammar as any],
    // Allow HTML in markdown to prevent Vue from parsing angle brackets
    html: true
  },



  // Sitemap
  sitemap: {
    hostname: siteUrl
  },

  vite: {
    plugins: [llmsDevPlugin({ siteUrl, locales: LLMS_LOCALES })]
  },

  buildEnd(siteConfig) {
    generateLlmsTxt({
      siteUrl,
      srcDir: siteConfig.srcDir,
      outDir: siteConfig.outDir,
      cleanUrls: siteConfig.cleanUrls,
      site: siteConfig.site,
      locales: LLMS_LOCALES
    })
  },

  // Locale-independent only. Everything that differs per page or per language
  // (canonical, OGP, keywords, JSON-LD) is emitted from transformHead below.
  head: [
    // Google Fonts — Orbitron (logo wordmark), IBM Plex Sans (body/headings), IBM Plex Mono (metrics/code)
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap' }],

    // OGP — shared across pages and languages
    ['meta', { property: 'og:site_name', content: 'MygramDB' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:image', content: `${siteUrl}/og-image.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: `${siteUrl}/og-image.png` }],
  ],

  transformHead({ pageData, description }) {
    const lang = localeOf(pageData.relativePath)
    const seo = SEO[lang]
    const url = `${siteUrl}${routeOf(pageData.relativePath)}`
    const altLang: Locale = lang === 'ja' ? 'en' : 'ja'
    const altUrl = `${siteUrl}${alternateRoute(pageData.relativePath)}`
    // Page frontmatter wins; the site-level copy is the fallback for pages without one.
    const title = pageData.frontmatter.title ? `${pageData.frontmatter.title} | MygramDB` : seo.title
    const desc = description || seo.description

    return [
      ['link', { rel: 'canonical', href: url }],
      ['meta', { name: 'keywords', content: seo.keywords }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: desc }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:locale', content: lang }],
      ['meta', { property: 'og:locale:alternate', content: altLang }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: desc }],
      ['link', { rel: 'alternate', hreflang: lang, href: url }],
      ['link', { rel: 'alternate', hreflang: altLang, href: altUrl }],
      ['link', { rel: 'alternate', hreflang: 'x-default', href: `${siteUrl}${routeOf(pageData.relativePath.replace(/^ja\//, ''))}` }],
      ['script', { type: 'application/ld+json' }, JSON.stringify(softwareApplicationJsonLd(lang))],
      ['script', { type: 'application/ld+json' }, JSON.stringify(faqJsonLd(lang))],
    ]
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
    },
    ja: {
      label: '日本語',
      lang: 'ja',
      description: 'MySQL FULLTEXTが遅い？MygramDBで桁違いに高速化。インメモリ全文検索エンジン。',
      themeConfig: {
        nav: [
          { text: 'MygramDBとは', link: '/ja/why' },
          { text: 'ドキュメント', link: '/ja/docs/getting-started' },
          { text: 'ベンチマーク', link: '/ja/benchmarks' },
          { text: '比較', link: '/ja/comparison' },
          { text: 'FAQ', link: '/ja/faq' },
          {
            text: `v${latestVersion}`,
            items: [
              { text: 'リリースノート', link: `https://github.com/libraz/mygram-db/blob/main/docs/releases/v${latestVersion}.md` },
              { text: '変更履歴', link: 'https://github.com/libraz/mygram-db/blob/main/CHANGELOG.md' }
            ]
          }
        ],
        sidebar: {
          '/ja/docs/': [
            {
              text: '概要',
              items: [
                { text: '仕組み', link: '/ja/docs/how-it-works' },
                { text: 'アーキテクチャ', link: '/ja/docs/architecture' },
                { text: '用語集', link: '/ja/docs/glossary' }
              ]
            },
            {
              text: 'はじめに',
              items: [
                { text: 'クイックスタート', link: '/ja/docs/getting-started' },
                { text: 'インストール', link: '/ja/docs/installation' },
                { text: '設定', link: '/ja/docs/configuration' },
                { text: 'クエリガイド', link: '/ja/docs/queries' }
              ]
            },
            {
              text: 'ガイド',
              items: [
                { text: '運用', link: '/ja/docs/operations' },
                { text: 'レプリケーション', link: '/ja/docs/replication' },
                { text: 'レプリケーション管理', link: '/ja/docs/replication-management' },
                { text: 'スナップショット', link: '/ja/docs/snapshot' },
                { text: 'パフォーマンス', link: '/ja/docs/performance' },
                { text: 'Dockerデプロイ', link: '/ja/docs/docker-deployment' },
                { text: '開発', link: '/ja/docs/development' },
                { text: 'Linuxテスト', link: '/ja/docs/linux-testing' }
              ]
            },
            {
              text: 'リファレンス',
              items: [
                { text: 'プロトコル', link: '/ja/docs/protocol' },
                { text: 'HTTP API', link: '/ja/docs/http-api' },
                { text: 'クエリ構文', link: '/ja/docs/query-syntax' },
                { text: 'SYNCコマンド', link: '/ja/docs/sync-command' },
                { text: '公式クライアント', link: '/ja/docs/client-libraries' },
                { text: 'C/C++ libmygramclient', link: '/ja/docs/client-library' }
              ]
            },
            {
              text: 'アップグレード',
              items: [
                { text: 'v1.10 へのアップグレード', link: '/ja/docs/upgrade-v1.10' },
                { text: 'v1.9 へのアップグレード', link: '/ja/docs/upgrade-v1.9' },
                { text: 'v1.8 へのアップグレード', link: '/ja/docs/upgrade-v1.8' },
                { text: 'v1.7 へのアップグレード', link: '/ja/docs/migration-v1.7' }
              ]
            }
          ]
        }
      }
    }
  },

  themeConfig: {
    nav: [
      { text: 'Why', link: '/why' },
      { text: 'Docs', link: '/docs/getting-started' },
      { text: 'Benchmarks', link: '/benchmarks' },
      { text: 'Comparison', link: '/comparison' },
      { text: 'FAQ', link: '/faq' },
      {
        text: `v${latestVersion}`,
        items: [
          { text: 'Release Notes', link: `https://github.com/libraz/mygram-db/blob/main/docs/releases/v${latestVersion}.md` },
          { text: 'Changelog', link: 'https://github.com/libraz/mygram-db/blob/main/CHANGELOG.md' }
        ]
      }
    ],

    sidebar: {
      '/docs/': [
        {
          text: 'Overview',
          items: [
            { text: 'How it Works', link: '/docs/how-it-works' },
            { text: 'Architecture', link: '/docs/architecture' },
            { text: 'Glossary', link: '/docs/glossary' }
          ]
        },
        {
          text: 'Getting Started',
          items: [
            { text: 'Quick Start', link: '/docs/getting-started' },
            { text: 'Installation', link: '/docs/installation' },
            { text: 'Configuration', link: '/docs/configuration' },
            { text: 'Query Guide', link: '/docs/queries' }
          ]
        },
        {
          text: 'Guides',
          items: [
            { text: 'Operations', link: '/docs/operations' },
            { text: 'Replication', link: '/docs/replication' },
            { text: 'Replication Management', link: '/docs/replication-management' },
            { text: 'Snapshot', link: '/docs/snapshot' },
            { text: 'Performance', link: '/docs/performance' },
            { text: 'Docker Deployment', link: '/docs/docker-deployment' },
            { text: 'Development', link: '/docs/development' },
            { text: 'Linux Testing', link: '/docs/linux-testing' }
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'Protocol', link: '/docs/protocol' },
            { text: 'HTTP API', link: '/docs/http-api' },
            { text: 'Query Syntax', link: '/docs/query-syntax' },
            { text: 'SYNC Command', link: '/docs/sync-command' },
            { text: 'Official Clients', link: '/docs/client-libraries' },
            { text: 'C/C++ libmygramclient', link: '/docs/client-library' }
          ]
        },
        {
          text: 'Upgrading',
          items: [
            { text: 'Upgrade to v1.10', link: '/docs/upgrade-v1.10' },
            { text: 'Upgrade to v1.9', link: '/docs/upgrade-v1.9' },
            { text: 'Upgrade to v1.8', link: '/docs/upgrade-v1.8' },
            { text: 'Upgrade to v1.7', link: '/docs/migration-v1.7' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/libraz/mygram-db' }
    ],

    footer: {
      message: 'Released under the <a href="https://github.com/libraz/mygram-db/blob/main/LICENSE" target="_blank" rel="noopener">MIT License</a> · a personal project by <a href="https://libraz.net" target="_blank" rel="noopener">libraz</a>'
    }
  }
})
