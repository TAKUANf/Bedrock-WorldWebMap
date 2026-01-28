require('dotenv').config();
const fastify = require('fastify')({ 
    logger: { level: 'info', transport: { target: 'pino-pretty' } } 
});
const { Pool } = require('pg');
const fs = require('fs-extra');
const path = require('path');
const TileGenerator = require('./tileGenerator');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tileGenerator = new TileGenerator();

const PUBLIC_DIR = path.join(__dirname, 'public');
const TILES_DIR = path.join(PUBLIC_DIR, 'tiles');
const MIN_NATIVE_ZOOM = -5;
const TILE_SIZE = 512;

async function initDB() {
    await fs.ensureDir(TILES_DIR);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`CREATE TABLE IF NOT EXISTS chunks (cx INT NOT NULL, cz INT NOT NULL, data JSONB, updated_at BIGINT, PRIMARY KEY (cx, cz));`);
        await client.query(`CREATE TABLE IF NOT EXISTS countries (id INT PRIMARY KEY,lv INT DEFAULT 0, name TEXT NOT NULL, owner TEXT, ownername TEXT, banner TEXT, lore TEXT, color TEXT, members TEXT, membersname TEXT, peace INT DEFAULT 0, invite INT DEFAULT 0, alliance TEXT, hostility TEXT, friendly TEXT);`);
        await client.query(`CREATE TABLE IF NOT EXISTS land (cx INT NOT NULL, cz INT NOT NULL, country_id INT NOT NULL, dimension TEXT DEFAULT 'overworld', PRIMARY KEY (cx, cz, dimension));`);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        process.exit(1);
    } finally { client.release(); }
}
initDB();

fastify.register(require('@fastify/cors'), { origin: '*' });
fastify.register(require('@fastify/static'), { root: PUBLIC_DIR, prefix: '/' });

const API_KEY = process.env.API_KEY || '';
const PROTECTED_ROUTES = ['/api/map/update', '/api/map/update-partial', '/countries', '/land', '/players'];

fastify.addHook('preHandler', async (req, reply) => {
    if (API_KEY && PROTECTED_ROUTES.some(r => req.url.startsWith(r))) {
        const key = req.headers['x-api-key'];
        if (key !== API_KEY) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
    }
});

const tileQueue = new Set();
let isProcessingQueue = false;

function getZoom0Keys(cx, cz) {
    const keys = [];
    const wx = cx * 16;
    const wz = cz * 16;
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wz / TILE_SIZE);
    keys.push(`0/${tx}/${ty}`);
    return keys;
}

function propagateTileUpdate(key) {
    const [z, x, y] = key.split('/').map(Number);
    if (z <= MIN_NATIVE_ZOOM) return;
    const nextZ = z - 1;
    const parentX = Math.floor(x / 2);
    const parentY = Math.floor(y / 2);
    tileQueue.add(`${nextZ}/${parentX}/${parentY}`);
}

async function processTileQueue() {
    if (isProcessingQueue || tileQueue.size === 0) return;
    isProcessingQueue = true;
    
    const queueArray = Array.from(tileQueue).sort((a, b) => {
        const zA = parseInt(a.split('/')[0]);
        const zB = parseInt(b.split('/')[0]);
        return zB - zA;
    });
    tileQueue.clear();

    for (const key of queueArray) {
        try {
            const [z, x, y] = key.split('/').map(Number);
            await tileGenerator.generateAndCacheTile(z, x, y);
            propagateTileUpdate(key);
        } catch (e) {
            fastify.log.error(`Tile Gen Error (${key}): ${e.message}`);
        }
    }

    isProcessingQueue = false;
    if (tileQueue.size > 0) setTimeout(processTileQueue, 50);
}

fastify.post('/api/map/update', async (req, reply) => {
    let chunks = req.body.data || (Array.isArray(req.body) ? req.body : [req.body]);
    if (!chunks || chunks.length === 0) return { status: "ignored" };
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const c of chunks) {
            if (c.cx == null || c.cz == null) continue;
            await client.query(`
                INSERT INTO chunks (cx, cz, data, updated_at) 
                VALUES ($1, $2, $3, $4) 
                ON CONFLICT (cx, cz) 
                DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
            `, [c.cx, c.cz, JSON.stringify(c), Date.now()]);
            
            getZoom0Keys(c.cx, c.cz).forEach(k => tileQueue.add(k));
        }
        await client.query('COMMIT');
        processTileQueue();
        return { status: "ok", count: chunks.length };
    } catch (e) { await client.query('ROLLBACK'); return reply.code(500).send(e.message); } finally { client.release(); }
});

fastify.post('/api/map/update-partial', async (req, reply) => {
    const updates = req.body.updates;
    if (!updates || updates.length === 0) return { status: "ignored" };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const chunksToUpdate = new Map();
        const immediateRenderTiles = new Set();

        for (const u of updates) {
            const cx = Math.floor(u.x / 16);
            const cz = Math.floor(u.z / 16);
            const key = `${cx},${cz}`;
            if (!chunksToUpdate.has(key)) chunksToUpdate.set(key, []);
            chunksToUpdate.get(key).push(u);
        }

        for (const [key, chunkUpdates] of chunksToUpdate.entries()) {
            const [cx, cz] = key.split(',').map(Number);
            const res = await client.query('SELECT data FROM chunks WHERE cx = $1 AND cz = $2', [cx, cz]);
            
            let chunkData;

            if (res.rows.length === 0) {
                chunkData = {
                    cx: cx,
                    cz: cz,
                    dimension: 'overworld',
                    palette: ["minecraft:air"],
                    s_ids: new Array(256).fill(0),
                    s_ys: new Array(256).fill(0)
                };
            } else {
                chunkData = res.rows[0].data;
                if (typeof chunkData === 'string') chunkData = JSON.parse(chunkData);
            }

            let modified = false;
            let updateNeighbors = { n: false, s: false, w: false, e: false };

            for (const u of chunkUpdates) {
                const lx = ((u.x % 16) + 16) % 16;
                const lz = ((u.z % 16) + 16) % 16;
                const index = lz * 16 + lx;

                if (lx === 0) updateNeighbors.w = true;
                if (lx === 15) updateNeighbors.e = true;
                if (lz === 0) updateNeighbors.n = true;
                if (lz === 15) updateNeighbors.s = true;

                let paletteId = chunkData.palette.indexOf(u.block_id);
                if (paletteId === -1) {
                    chunkData.palette.push(u.block_id);
                    paletteId = chunkData.palette.length - 1;
                }

                if (chunkData.s_ids[index] !== paletteId || chunkData.s_ys[index] !== u.y) {
                    chunkData.s_ids[index] = paletteId;
                    chunkData.s_ys[index] = u.y;
                    modified = true;
                }
            }

            if (modified) {
                await client.query(`
                    INSERT INTO chunks (cx, cz, data, updated_at) 
                    VALUES ($1, $2, $3, $4) 
                    ON CONFLICT (cx, cz) 
                    DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
                `, [cx, cz, JSON.stringify(chunkData), Date.now()]);
                getZoom0Keys(cx, cz).forEach(k => immediateRenderTiles.add(k));
                if (updateNeighbors.w) getZoom0Keys(cx - 1, cz).forEach(k => immediateRenderTiles.add(k));
                if (updateNeighbors.e) getZoom0Keys(cx + 1, cz).forEach(k => immediateRenderTiles.add(k));
                if (updateNeighbors.n) getZoom0Keys(cx, cz - 1).forEach(k => immediateRenderTiles.add(k));
                if (updateNeighbors.s) getZoom0Keys(cx, cz + 1).forEach(k => immediateRenderTiles.add(k));
            }
        }

        await client.query('COMMIT');
        
        if (immediateRenderTiles.size > 0) {
            await Promise.all(Array.from(immediateRenderTiles).map(async (key) => {
                try {
                    const [z, x, y] = key.split('/').map(Number);
                    await tileGenerator.generateAndCacheTile(z, x, y);
                    propagateTileUpdate(key);
                } catch (e) {
                    fastify.log.error(`Immediate Render Error (${key}): ${e.message}`);
                }
            }));
        }
        processTileQueue();

        return { status: "ok", count: updates.length };

    } catch (e) {
        await client.query('ROLLBACK');
        fastify.log.error(`Partial Update Error: ${e.message}`);
        return reply.code(500).send(e.message);
    } finally {
        client.release();
    }
});

let playersCache = [];
fastify.post('/players', async (req) => {
    const data = req.body.data || req.body;
    if (Array.isArray(data)) playersCache = data;
    return { status: "ok" };
});
fastify.get('/api/map/players', async () => playersCache || []);

fastify.post('/countries', async (req, reply) => {
    const countries = Array.isArray(req.body) ? req.body : [];
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE countries');
        for (const c of countries) {
            await client.query(`INSERT INTO countries (id, name, owner, ownername, banner, lore, color, members, membersname, peace, invite, alliance, hostility, friendly, lv) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, [c.id, c.name, c.owner, c.ownername, c.banner, c.lore, c.color, c.members, c.membersname, c.peace, c.invite, c.alliance, c.hostility, c.friendly, c.lv]);
        }
        await client.query('COMMIT');
        return { status: "ok" };
    } catch (e) { await client.query('ROLLBACK'); return reply.code(500).send(e.message); } finally { client.release(); }
});

fastify.post('/land', async (req, reply) => {
    const lands = Array.isArray(req.body) ? req.body : [];
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const l of lands) {
            const [cx, cz] = l.x_y.split('_').map(Number);
            const countryId = l.id;
            const dim = l.dimension || 'overworld';
            if (countryId === 0) await client.query('DELETE FROM land WHERE cx = $1 AND cz = $2 AND dimension = $3', [cx, cz, dim]);
            else await client.query(`INSERT INTO land (cx, cz, country_id, dimension) VALUES ($1, $2, $3, $4) ON CONFLICT (cx, cz, dimension) DO UPDATE SET country_id = EXCLUDED.country_id`, [cx, cz, countryId, dim]);
        }
        await client.query('COMMIT');
        return { status: "ok" };
    } catch (e) { await client.query('ROLLBACK'); return reply.code(500).send(e.message); } finally { client.release(); }
});

fastify.post('/api/map/check', async (req, reply) => {
    const chunks = req.body.chunks;
    if (!chunks || chunks.length === 0) return { existing: [] };
    const client = await pool.connect();
    try {
        const params = [];
        const valueStrings = chunks.map((c, i) => {
            const idx = i * 2;
            params.push(c.cx, c.cz);
            return `($${idx + 1}, $${idx + 2})`;
        });
        const query = `SELECT cx, cz FROM chunks WHERE (cx, cz) IN (${valueStrings.join(', ')})`;
        const res = await client.query(query, params);
        return { existing: res.rows };
    } catch (e) { return reply.code(500).send(e.message); } finally { client.release(); }
});

fastify.get('/api/initial-data', async () => {
    const client = await pool.connect();
    try {
        const countriesRes = await client.query('SELECT * FROM countries');
        const landRes = await client.query('SELECT cx as x, cz as z, country_id as id, dimension FROM land');
        return { players: playersCache, countries: countriesRes.rows, chunks: landRes.rows };
    } finally { client.release(); }
});

const generatingTiles = new Set();
fastify.get('/tiles/overworld/:z/:x/:y', async (req, reply) => {
    const { z, x, y } = req.params;
    const tileX = parseInt(x);
    const tileY = parseInt(y.replace('.png', ''));
    const zoom = parseInt(z);

    const tilePath = path.join(TILES_DIR, z, x, y);
    const key = `${z}/${x}/${tileY}`;

    try {
        await fs.access(tilePath);
        return reply.sendFile(path.join('tiles', z, x, y));
    } catch {
        if (generatingTiles.has(key)) return reply.code(202).send(); 
        generatingTiles.add(key);
        try {
            const outPath = await tileGenerator.generateAndCacheTile(zoom, tileX, tileY);
            if (!outPath) return reply.code(404).send(); 
            const buffer = await fs.readFile(outPath);
            reply.type('image/png').send(buffer);
        } catch (e) {
            reply.code(404).send();
        } finally {
            generatingTiles.delete(key);
        }
    }
});

const start = async () => {
    try { await fastify.listen({ port: 4400, host: '0.0.0.0' }); } 
    catch (err) { console.error(err); process.exit(1); }
};
start();