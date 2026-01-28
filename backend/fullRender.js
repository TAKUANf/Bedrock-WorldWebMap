require('dotenv').config();
const { Pool } = require('pg');
const TileGenerator = require('./tileGenerator');
const cliProgress = require('cli-progress');
const fs = require('fs-extra');
const path = require('path');

const MIN_ZOOM = -8; // -5なら 1px = 32ブロック (かなり広域)
const BASE_ZOOM = 0; // DBから生成する基準ズーム
const TILE_SIZE = 512;
const CONCURRENCY = 4;

const PUBLIC_DIR = path.join(__dirname, './public');
const TILES_DIR = path.join(PUBLIC_DIR, 'tiles');

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const generator = new TileGenerator();

    console.log("🚀 Starting Optimized Pyramid Render...");
    
    const client = await pool.connect();
    let bounds;
    try {
        const res = await client.query(`SELECT MIN(cx) as min_x, MAX(cx) as max_x, MIN(cz) as min_z, MAX(cz) as max_z FROM chunks`);
        if (res.rows[0].min_x === null) { console.error("❌ No data."); return; }
        
        bounds = {
            minX: res.rows[0].min_x * 16, maxX: (res.rows[0].max_x + 1) * 16,
            minZ: res.rows[0].min_z * 16, maxZ: (res.rows[0].max_z + 1) * 16,
        };
        console.log(`🌍 Bounds: [${bounds.minX}, ${bounds.minZ}] ~ [${bounds.maxX}, ${bounds.maxZ}]`);
    } finally { client.release(); }

    console.log(`\n🔹 Generating Base Tiles (Zoom ${BASE_ZOOM})...`);
    
    const tileWorldSize = TILE_SIZE;
    const startTx = Math.floor(bounds.minX / tileWorldSize);
    const endTx = Math.floor(bounds.maxX / tileWorldSize);
    const startTz = Math.floor(bounds.minZ / tileWorldSize);
    const endTz = Math.floor(bounds.maxZ / tileWorldSize);

    const baseTasks = [];
    for (let tx = startTx; tx <= endTx; tx++) {
        for (let tz = startTz; tz <= endTz; tz++) {
            baseTasks.push({ x: tx, y: tz });
        }
    }

    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(baseTasks.length, 0);

    // 並列実行
    for (let i = 0; i < baseTasks.length; i += CONCURRENCY) {
        const batch = baseTasks.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async t => {
            try { await generator.generateFromDB(t.x, t.y); } catch(e) {}
            bar.increment();
        }));
    }
    bar.stop();

    for (let z = BASE_ZOOM - 1; z >= MIN_ZOOM; z--) {
        console.log(`\n🔹 Generating Zoom ${z} (Composite)...`);
        
        const diff = BASE_ZOOM - z;
        const scaleDiv = Math.pow(2, diff);
        
        const zStartTx = Math.floor(startTx / scaleDiv);
        const zEndTx = Math.floor(endTx / scaleDiv);
        const zStartTz = Math.floor(startTz / scaleDiv);
        const zEndTz = Math.floor(endTz / scaleDiv);

        const tasks = [];
        for (let tx = zStartTx; tx <= zEndTx; tx++) {
            for (let tz = zStartTz; tz <= zEndTz; tz++) {
                tasks.push({ x: tx, y: tz });
            }
        }

        const zBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        zBar.start(tasks.length, 0);

        for (let i = 0; i < tasks.length; i += CONCURRENCY) {
            const batch = tasks.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async t => {
                try { await generator.generateCompositeTile(z, t.x, t.y); } catch(e) { console.error(e); }
                zBar.increment();
            }));
        }
        zBar.stop();
    }

    console.log("\n✅ All Renders Complete!");
    await pool.end();
}

main().catch(console.error);