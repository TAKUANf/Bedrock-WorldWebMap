# Minecraft Bedrock Web Map System

Minecraft Bedrock Edition (統合版) 専用のリアルタイムWebマップシステムです。
地形、プレイヤーの位置、およびブロックの設置・破壊をリアルタイムでWebブラウザ上に表示します。

## ✨ システム構成

1.  **Backend (Node.js)**: Webサーバー、データベース管理、画像生成。
2.  **Addon (BDS)**: Minecraftサーバー内で動作し、地形データをスキャンして送信。

---

## 🛠️ バックエンド (Backend) の構築

**前提条件**: Node.js (v18以上), PostgreSQL

### PostgreSQL のセットアップ

1.  **PostgreSQL のインストール**
    - **Windows**: [公式サイト](https://www.postgresql.org/download/windows/) からインストーラーをダウンロード
    - **Linux (Ubuntu/Debian)**:
      ```bash
      sudo apt update
      sudo apt install postgresql postgresql-contrib
      sudo systemctl start postgresql
      sudo systemctl enable postgresql
      ```

2.  **データベースとユーザーの作成**
    PostgreSQL にログインし、データベースを作成します。
    ```bash
    # PostgreSQLにログイン (Linux)
    sudo -u postgres psql
    
    # または (Windows - コマンドプロンプト)
    psql -U postgres
    ```
    
    SQL コマンドでデータベースとユーザーを作成:
    ```sql
    -- ユーザー作成 (パスワードは適宜変更)
    CREATE USER mapuser WITH PASSWORD 'your_password';
    
    -- データベース作成
    CREATE DATABASE minecraft_map OWNER mapuser;
    
    -- 権限付与
    GRANT ALL PRIVILEGES ON DATABASE minecraft_map TO mapuser;
    
    -- 終了
    \q
    ```

### Node.js バックエンドのセットアップ

1.  **インストール**
    `backend` ディレクトリへ移動し、依存ライブラリをインストールします。
    ```bash
    cd backend
    npm install
    ```

2.  **データベース設定**
    `backend` ディレクトリ直下に `.env` ファイルを作成し、PostgreSQLの接続情報を記述します。
    ```ini
    DATABASE_URL=postgres://mapuser:your_password@localhost:5432/minecraft_map
    ```

3.  **APIキー設定（推奨）**
    外部からのAPI不正アクセスを防ぐため、APIキー認証を設定できます。
    `.env` ファイルに以下を追加します。
    ```ini
    API_KEY=your_random_api_key_here
    ```
    ランダムなキーを生成するには:
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```
    ⚠️ **このキーはアドオン側の `config.js` にも同じ値を設定してください。**

4.  **サーバー起動**
    ```bash
    node server.js
    ```
    これだけでリアルタイム更新（部分更新）は動作します。

4.  **【重要】全体地図の生成 (fullRender)**
    ゲーム内でレンダリングコマンドを実行した後、データベースにはデータが保存されますが、**ズームアウト用の広域タイル**はサーバー負荷軽減のため自動生成されません。
    スキャン完了後や、定期的に以下のコマンドを実行して地図全体を更新してください。
    ```bash
    node fullRender.js
    ```

---

## 🖥️ BDS (Bedrock Dedicated Server) の設定

本システムは外部通信を行うため、BDSの設定変更が必須です。

1.  **permissions.json の編集**
    BDSのルートにある `config/default/permissions.json` を開き、`allowed_modules` に `"@minecraft/server-net"` を追加してください。
    ```json
    {
      "allowed_modules": [
        "@minecraft/server-gametest",
        "@minecraft/server",
        "@minecraft/server-ui",
        "@minecraft/server-admin",
        "@minecraft/server-editor",
        "@minecraft/server-net"
      ]
    }
    ```

2.  **Beta API の有効化**
    ワールドをBDSに配置する際、レベル設定で**「ベータ API (Beta APIs)」**を必ず有効にしてください。無効な場合、アドオンは動作しません。

---

## 📦 アドオン (Addon) の導入

通常のBehavior Packとして導入する場合の手順です。

1.  **配置**: `addon` フォルダを `behavior_packs` 内に配置し、ワールドに適用します。
2.  **設定**: `scripts/config.js` を開き、バックエンドのURLとAPIキーを設定します。
    ```javascript
    export const Config = {
        SERVER_URL: "http://localhost:4400", // サーバーのIPとポート
        API_KEY: "your_random_api_key_here", // バックエンドの.envと同じ値
        // ...
    };
    ```

---

## 🎮 ゲーム内での操作

権限管理にはタグを使用します。マップを操作するプレイヤーには以下のタグを付与してください。
```mcfunction
/tag @s add map_admin
```

### コマンド一覧

ゲーム内で `/wmap` コマンドを使用します。

| コマンド | 説明 |
|---------|------|
| `/wmap render <半径>` | (プレイヤーのみ) 現在地を中心に指定半径のチャンクをスキャン・保存します。 |
| `/wmap render <x1> <z1> <x2> <z2>` | 指定座標の範囲をスキャンします。 |
| `/wmap repair ...` | 指定範囲のうち、データベースに未保存のチャンクのみをスキャンします（高速）。 |
| `/wmap stop` | レンダリングを停止します。 |
| `/wmap resume` | レンダリングを再開します（サーバー再起動時は自動再開されます）。 |
| `/wmap sync` | 国家・領土データを強制的に同期します。 |

---

## 🗺️ Make a Country との連携について

このシステムは「Make a Country」アドオンのプラグインとして統合することで、国家や領土のデータをマップ上に表示できます。

👉 **Make a Country への導入手順は [README_MakeCountry.md](./README_MakeCountry.md) を参照してください。**

---

## 📜 サードパーティライブラリ

本プロジェクトでは以下のライブラリを使用しています。

| ライブラリ | ライセンス | 用途 |
|-----------|-----------|------|
| [Leaflet](https://leafletjs.com/) | BSD 2-Clause | Webマップ表示 |
