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
  description: 'In-memory full-text search engine that replaces slow MySQL FULLTEXT. 27-3700x faster with real-time MySQL binlog replication.',
  url: siteUrl,
  downloadUrl: githubUrl,
  softwareVersion: '1.0',
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
        text: 'MygramDB is 27-3700x faster than MySQL FULLTEXT. For typical ORDER BY id LIMIT 100 queries, it achieves 19-32x speedup. COUNT queries are 413-431x faster. Under 10 concurrent queries, MySQL fails 90% while MygramDB achieves 288 QPS with 100% success rate.'
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
  description: 'MySQL FULLTEXT too slow? MygramDB makes it 27-3700x faster. In-memory full-text search engine with MySQL replication.',

  // Sitemap
  sitemap: {
    hostname: siteUrl
  },

  head: [
    // JSON-LD structured data
    ['script', { type: 'application/ld+json' }, JSON.stringify(softwareApplicationJsonLd)],
    ['script', { type: 'application/ld+json' }, JSON.stringify(faqJsonLd)],

    // SEO - Problem-oriented keywords
    ['meta', { name: 'keywords', content: 'MySQL FULLTEXT slow, MySQL full-text search slow, MySQL search timeout, MySQL FULLTEXT performance, MySQL search optimization, MySQL N-gram slow, MySQL FULLTEXT concurrent, MySQL FULLTEXT alternative, full-text search engine, in-memory search, MySQL replication, binlog search, MySQL FULLTEXT 遅い, MySQL 全文検索 遅い, MySQL 検索 タイムアウト' }],
    ['link', { rel: 'canonical', href: siteUrl }],

    // OGP
    ['meta', { property: 'og:site_name', content: 'MygramDB' }],
    ['meta', { property: 'og:title', content: 'MygramDB - 27-3700x faster than MySQL FULLTEXT' }],
    ['meta', { property: 'og:description', content: 'MySQL FULLTEXT too slow? MygramDB is an in-memory full-text search engine that syncs via MySQL replication. Sub-80ms queries, 100% success rate under load.' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: siteUrl }],
    ['meta', { property: 'og:image', content: `${siteUrl}/og-image.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],

    // Twitter
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'MygramDB - 27-3700x faster than MySQL FULLTEXT' }],
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
      description: 'MySQL FULLTEXTが遅い？MygramDBで27〜3700倍高速化。インメモリ全文検索エンジン。',
      themeConfig: {
        nav: [
          { text: 'MygramDBとは', link: '/ja/why' },
          { text: 'ベンチマーク', link: '/ja/benchmarks' },
          { text: '比較', link: '/ja/comparison' },
          { text: 'FAQ', link: '/ja/faq' }
        ]
      }
    }
  },

  themeConfig: {
    nav: [
      { text: 'Why', link: '/why' },
      { text: 'Benchmarks', link: '/benchmarks' },
      { text: 'Comparison', link: '/comparison' },
      { text: 'FAQ', link: '/faq' }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/libraz/mygram-db' }
    ],

    footer: {
      message: 'Released under the MIT License.'
    }
  }
})
