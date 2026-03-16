import { defineConfig } from 'vitepress'

const siteUrl = 'https://mygramdb.libraz.net'
const githubUrl = 'https://github.com/libraz/mygram-db'

// JSON-LD: SoftwareApplication schema
const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MygramDB',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Linux, macOS',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD'
  },
  description: 'In-memory full-text search engine that replaces slow MySQL FULLTEXT. Tens to hundreds of times faster with real-time MySQL binlog replication.',
  url: siteUrl,
  downloadUrl: githubUrl,
  softwareVersion: '1.4.0',
  author: {
    '@type': 'Person',
    name: 'libraz'
  },
  license: 'https://opensource.org/licenses/MIT',
  keywords: 'MySQL FULLTEXT, full-text search, in-memory database, MySQL replication, N-gram search, CJK search'
}

// JSON-LD: FAQ schema (for AI search)
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Why is MySQL FULLTEXT so slow?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MySQL FULLTEXT is slow because it stores indexes on disk using B-tree pages, requires disk I/O for every query, uses uncompressed posting lists, and suffers from cache dependency. Under concurrent load, 90% of queries fail at just 10 connections. MygramDB solves this with in-memory indexing delivering consistent sub-80ms latency.'
      }
    },
    {
      '@type': 'Question',
      name: 'How does MygramDB sync with MySQL?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MygramDB uses GTID-based binlog replication to sync with MySQL in real-time. It acts as a MySQL replica, receiving changes via the binary log. No ETL pipelines or manual sync needed. Write to MySQL as usual, MygramDB updates automatically.'
      }
    },
    {
      '@type': 'Question',
      name: 'How much faster is MygramDB than MySQL FULLTEXT?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MygramDB is tens to hundreds of times faster than MySQL FULLTEXT. For typical ORDER BY id LIMIT 100 queries, it achieves 19-32x speedup. COUNT queries are 400x+ faster. Under 10 concurrent queries, MySQL fails 90% while MygramDB achieves 288 QPS with 100% success rate.'
      }
    },
    {
      '@type': 'Question',
      name: 'Does MygramDB support Japanese/Chinese/Korean text?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, MygramDB has excellent CJK support using ICU-based Unicode normalization and N-gram tokenization. It handles Japanese, Chinese, and Korean text perfectly without additional plugins or configuration.'
      }
    },
    {
      '@type': 'Question',
      name: 'What is the difference between MygramDB and Elasticsearch?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MygramDB is a single-binary deployment with direct MySQL binlog sync, sub-80ms latency, and low operational complexity. Elasticsearch offers distributed search and advanced features but requires cluster management, ETL pipelines, and JVM tuning. Choose MygramDB for simpler MySQL-based applications; Elasticsearch for large-scale distributed search.'
      }
    }
  ]
}

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
    // Allow HTML in markdown to prevent Vue from parsing angle brackets
    html: true
  },



  // Sitemap
  sitemap: {
    hostname: siteUrl
  },

  head: [
    // Google Fonts
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Space+Grotesk:wght@400;500;600&display=swap' }],

    // JSON-LD structured data
    ['script', { type: 'application/ld+json' }, JSON.stringify(softwareApplicationJsonLd)],
    ['script', { type: 'application/ld+json' }, JSON.stringify(faqJsonLd)],

    // SEO - Problem-oriented keywords
    ['meta', { name: 'keywords', content: 'MySQL FULLTEXT slow, MySQL full-text search slow, MySQL search timeout, MySQL FULLTEXT performance, MySQL search optimization, MySQL N-gram slow, MySQL FULLTEXT concurrent, MySQL FULLTEXT alternative, full-text search engine, in-memory search, MySQL replication, binlog search, MySQL FULLTEXT 遅い, MySQL 全文検索 遅い, MySQL 検索 タイムアウト' }],
    ['link', { rel: 'canonical', href: siteUrl }],

    // OGP
    ['meta', { property: 'og:site_name', content: 'MygramDB' }],
    ['meta', { property: 'og:title', content: 'MygramDB - Hundreds of times faster than MySQL FULLTEXT' }],
    ['meta', { property: 'og:description', content: 'MySQL FULLTEXT too slow? MygramDB is an in-memory full-text search engine that syncs via MySQL replication. Sub-80ms queries, 100% success rate under load.' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: siteUrl }],
    ['meta', { property: 'og:image', content: `${siteUrl}/og-image.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],

    // Twitter
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'MygramDB - Hundreds of times faster than MySQL FULLTEXT' }],
    ['meta', { name: 'twitter:description', content: 'MySQL FULLTEXT too slow? MygramDB is an in-memory full-text search engine that syncs via MySQL replication. Sub-80ms queries, 100% success rate under load.' }],
    ['meta', { name: 'twitter:image', content: `${siteUrl}/og-image.png` }],
  ],

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
            text: 'v1.4.0',
            items: [
              { text: 'リリースノート', link: 'https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.4.0.md' },
              { text: '変更履歴', link: 'https://github.com/libraz/mygram-db/blob/main/CHANGELOG.md' }
            ]
          }
        ],
        sidebar: {
          '/ja/docs/': [
            {
              text: 'ドキュメント',
              items: [
                { text: 'クイックスタート', link: '/ja/docs/getting-started' },
                { text: 'インストール', link: '/ja/docs/installation' },
                { text: '設定', link: '/ja/docs/configuration' },
                { text: 'クエリガイド', link: '/ja/docs/queries' }
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
        text: 'v1.4.0',
        items: [
          { text: 'Release Notes', link: 'https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.4.0.md' },
          { text: 'Changelog', link: 'https://github.com/libraz/mygram-db/blob/main/CHANGELOG.md' }
        ]
      }
    ],

    sidebar: {
      '/docs/': [
        {
          text: 'Documentation',
          items: [
            { text: 'Getting Started', link: '/docs/getting-started' },
            { text: 'Installation', link: '/docs/installation' },
            { text: 'Configuration', link: '/docs/configuration' },
            { text: 'Query Guide', link: '/docs/queries' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/libraz/mygram-db' }
    ],

    footer: {
      message: 'a personal project by <a href="https://libraz.net" target="_blank" rel="noopener">libraz</a>'
    }
  }
})
