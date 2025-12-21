# クイックスタート

5分でMygramDBを起動しましょう。

## 前提条件

- GTIDが有効なMySQL 8.0以上
- RHEL/AlmaLinux/Rocky Linux 9、またはDocker

## インストール

### RPM（RHEL/AlmaLinux/Rocky Linux 9）

[GitHub Releases](https://github.com/libraz/mygram-db/releases/latest)からダウンロードしてインストール：

```bash
sudo rpm -i mygramdb-*.el9.x86_64.rpm
```

### Docker

```bash
docker pull ghcr.io/libraz/mygramdb:latest
```

## 最小構成

`/etc/mygramdb/config.yaml`を作成：

```yaml
mysql:
  host: "localhost"
  port: 3306
  user: "mygramdb"
  password: "your_password"
  database: "myapp"

tables:
  - name: "articles"
    text_source:
      column: "content"
    primary_key: "id"

api:
  tcp:
    port: 11016
  http:
    enable: true
    port: 8080
```

## サービスを開始

```bash
sudo systemctl enable --now mygramdb
```

## 動作確認

```bash
# CLIで接続
mygram-cli -h localhost -p 11016

# 検索
SEARCH articles hello world
```

## 次のステップ

- [インストール](/ja/docs/installation) - インストール方法
- [設定](/ja/docs/configuration) - 設定リファレンス
- [クエリガイド](/ja/docs/queries) - 検索構文とサンプル

## 詳細ドキュメント

- [設定リファレンス（詳細）](https://github.com/libraz/mygram-db/blob/main/docs/ja/configuration.md)
- [MySQLレプリケーション](https://github.com/libraz/mygram-db/blob/main/docs/ja/replication.md)
- [運用ガイド](https://github.com/libraz/mygram-db/blob/main/docs/ja/operations.md)
