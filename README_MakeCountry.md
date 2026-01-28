# Make a Country 導入ガイド

このドキュメントでは、Web Map Systemを**「Make a Country」アドオンのプラグインとして統合する手順**を説明します。
この手順を行うことで、Webマップ上に**国家の領土、国旗、詳細情報**が表示されるようになります。

※ バックエンドサーバーの構築やBDSの設定（permissions.json等）は、通常の [README.md](./README.md) を参照して完了させておいてください。

---

## 📂 1. ファイルの配置

Make a Country アドオンのスクリプトフォルダ内に、本システムのファイルを配置します。

1.  `MakeCountry/scripts/` 内に新しいフォルダ（例: `plugins/web_map`）を作成します。
2.  本システムの `addon/scripts/` 直下にある**全てのファイル**（`main.js`, `sync.js`, `config.js`, `util.js`, `logger.js`, `state.js`）を、作成したフォルダにコピーします。

**構成イメージ:**
```text
MakeCountry/
└── scripts/
    ├── (MakeCountry本体)
    ├── plugin_config.js
    └── plugins/
        └── web_map/  <-- 作成
            ├── main.js (コピー)
            ├── sync.js (コピー)
            └── ... (他すべて)
```

---

## 📝 2. 設定ファイルの編集

### plugin_config.js の編集

Make a Country にプラグインを読み込ませます。
`MakeCountry/scripts/plugin_config.js` を開き、以下の行を追加してください。

```javascript
// MakeCountry/scripts/plugin_config.js

// ...既存のインポート...

// Web Map System の読み込み
import("./plugins/web_map/main.js");
import("./plugins/web_map/sync.js");
```

### manifest.json の確認・編集

Make a Country が外部通信を行えるように依存関係を追加します。
`MakeCountry/manifest.json` を開き、`dependencies` に `@minecraft/server-net` があるか確認し、なければ追加してください。

```json
"dependencies": [
    {
        "module_name": "@minecraft/server",
        "version": "..." 
    },
    {
        "module_name": "@minecraft/server-net",
        "version": "1.0.0-beta" 
    }
]
```

※ バージョンは環境に合わせて調整してください。

### config.js の設定

コピーした `MakeCountry/scripts/plugins/web_map/config.js` を開き、設定を確認します。

```javascript
export const Config = {
    SERVER_URL: "http://localhost:4400", // バックエンドのURLを指定
    
    // Make a Countryのデータを読み取るため false に設定 (デフォルト)
    STANDALONE_MODE: false, 
    
    // ...
};
```

### main.js のコマンド名変更

コピーした `MakeCountry/scripts/plugins/web_map/main.js` を開き、コマンド登録部分を編集します。

**変更前:**
```javascript
system.beforeEvents.startup.subscribe(ev => {
    try {
        ev.customCommandRegistry.registerCommand({
            name: "worldmap:wmap",
```

**変更後:**
```javascript
system.beforeEvents.startup.subscribe(ev => {
    try {
        ev.customCommandRegistry.registerCommand({
            name: "makecountry:wmap",
```

これにより、コマンドが `/wmap` として使用可能になります（`/makecountry:wmap` でも動作します）。

---

## ✅ 3. 完了

これで導入は完了です。BDSを起動すると、以下の機能が有効になります。

| 機能 | 説明 |
|------|------|
| **領土データの同期** | 領土（Claim）の更新や国家情報の変更が、定期的にWebマップへ送信されます。 |
| **手動同期** | ゲーム内で `/wmap sync` コマンドを実行すると、全ての国家・領土データを強制的に同期できます。 |
| **レンダリング** | 通常通り `/wmap render` 等のコマンドで地形データをスキャンできます。 |

> ⚠️ **注意**: 権限管理のため、操作するプレイヤーには `/tag @s add map_admin` を付与することを忘れないでください。
