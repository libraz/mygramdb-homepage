import { defineConfig } from 'vitepress'
import mygramGrammar from './mygram.tmLanguage.mjs'
import benchmark from '../src/data/benchmark-v1.9.0.json'

const siteUrl = 'https://mygramdb.libraz.net'
const githubUrl = 'https://github.com/libraz/mygram-db'
const latestVersion = '1.10.0'

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
  description: 'In-memory full-text search engine with real-time MySQL binlog replication.',
  url: siteUrl,
  downloadUrl: githubUrl,
  softwareVersion: latestVersion,
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
        text: 'MySQL FULLTEXT is slow because it stores indexes on disk using B-tree pages, requires disk I/O for every query, and uses uncompressed posting lists. MygramDB solves this with in-memory N-gram indexing delivering consistent sub-millisecond latency.'
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
        text: `The current reproducible benchmark compares MygramDB and MySQL FULLTEXT on ${benchmark.run.datasetRows.toLocaleString()} Wikipedia articles with MygramDB's query cache disabled. It includes search, COUNT, CJK, result-consistency, and concurrent-throughput results.`
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
        text: 'MygramDB is a single-binary deployment with direct MySQL binlog sync, sub-millisecond latency, and low operational complexity. Elasticsearch offers distributed search and advanced features but requires cluster management, ETL pipelines, and JVM tuning. Choose MygramDB for simpler MySQL-based applications; Elasticsearch for large-scale distributed search.'
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

  head: [
    // Google Fonts — Orbitron (logo wordmark), IBM Plex Sans (body/headings), IBM Plex Mono (metrics/code)
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap' }],

    // JSON-LD structured data
    ['script', { type: 'application/ld+json' }, JSON.stringify(softwareApplicationJsonLd)],
    ['script', { type: 'application/ld+json' }, JSON.stringify(faqJsonLd)],

    // SEO - Problem-oriented keywords
    ['meta', { name: 'keywords', content: 'MySQL FULLTEXT slow, MySQL full-text search slow, MySQL search timeout, MySQL FULLTEXT performance, MySQL search optimization, MySQL N-gram slow, MySQL FULLTEXT concurrent, MySQL FULLTEXT alternative, full-text search engine, in-memory search, MySQL replication, binlog search, MySQL FULLTEXT 遅い, MySQL 全文検索 遅い, MySQL 検索 タイムアウト' }],
    ['link', { rel: 'canonical', href: siteUrl }],

    // OGP
    ['meta', { property: 'og:site_name', content: 'MygramDB' }],
    ['meta', { property: 'og:title', content: 'MygramDB - In-memory full-text search with MySQL replication' }],
    ['meta', { property: 'og:description', content: 'MySQL FULLTEXT too slow? MygramDB is an in-memory full-text search engine that syncs via MySQL replication. Sub-millisecond queries on million-row datasets.' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: siteUrl }],
    ['meta', { property: 'og:image', content: `${siteUrl}/og-image.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],

    // Twitter
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'MygramDB - In-memory full-text search with MySQL replication' }],
    ['meta', { name: 'twitter:description', content: 'MySQL FULLTEXT too slow? MygramDB is an in-memory full-text search engine that syncs via MySQL replication. Sub-millisecond queries on million-row datasets.' }],
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
      message: 'a personal project by <a href="https://libraz.net" target="_blank" rel="noopener">libraz</a>'
    }
  }
})
