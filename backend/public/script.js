document.addEventListener('DOMContentLoaded', () => {
    const state = {
        map: null,
        players: [],
        countries: [],
        chunks: [],
        playerMarkers: new Map(),
        layers: {
            tiles: null,
            players: L.layerGroup(),
            countries: L.layerGroup(),
            borders: L.layerGroup(),
        },
        urlParams: new URLSearchParams(window.location.hash.slice(1))
    };

    const TILE_SIZE = 512;
    const MIN_NATIVE_ZOOM = -5;
    const MAX_NATIVE_ZOOM = 0;
    const MIN_ZOOM_CLIENT = -8;
    const MAX_ZOOM_CLIENT = 2;

    // --- I18n 翻訳データ ---
    const translations = {
        ja: {
            map_title: '<i class="fa-solid fa-map"></i> サーバーマップ',
            tab_players: '<i class="fa-solid fa-users"></i>',
            tab_countries: '<i class="fa-solid fa-flag"></i>',
            tab_layers: '<i class="fa-solid fa-layer-group"></i>',
            tab_logs: '<i class="fa-solid fa-terminal"></i>',
            search_players: 'プレイヤーを検索...',
            online_count: 'オンライン',
            search_countries: '国家を検索...',
            settings_display: '表示設定',
            layer_players: 'プレイヤーを表示',
            layer_names: '名前を常時表示',
            layer_territories: '領土と国境',
            settings_info: '情報',
            coords_system: '座標系',
            updated_realtime: '更新: リアルタイム',
            log_header: '通信ログ',
            toast_copied: 'URLをコピーしました！',
            label_id: 'ID',
            label_level: '国家Lv',
            label_king: '国王',
            status_peace: '<i class="fa-solid fa-dove"></i> 平和',
            status_war: '<i class="fa-solid fa-person-rifle"></i> 戦争',
            status_invite: '<i class="fa-solid fa-lock"></i> 招待制',
            status_open: '<i class="fa-solid fa-door-open"></i> 参加自由',
            label_citizens: '国民',
            label_allies: '同盟国',
            label_friendly: '友好国',
            label_enemies: '敵対国',
            none: 'なし'
        },
        en: {
            map_title: '<i class="fa-solid fa-map"></i> Server Map',
            tab_players: '<i class="fa-solid fa-users"></i>',
            tab_countries: '<i class="fa-solid fa-flag"></i>',
            tab_layers: '<i class="fa-solid fa-layer-group"></i>',
            tab_logs: '<i class="fa-solid fa-terminal"></i>',
            search_players: 'Search players...',
            online_count: 'Online',
            search_countries: 'Search countries...',
            settings_display: 'Display Settings',
            layer_players: 'Show Players',
            layer_names: 'Always Show Names',
            layer_territories: 'Show Territories',
            settings_info: 'Info',
            coords_system: 'Coords System',
            updated_realtime: 'Updated: Realtime',
            log_header: 'Network Logs',
            toast_copied: 'URL Copied!',
            label_id: 'ID',
            label_level: 'Level',
            label_king: 'King',
            status_peace: '<i class="fa-solid fa-dove"></i> Peace',
            status_war: '<i class="fa-solid fa-person-rifle"></i> War',
            status_invite: '<i class="fa-solid fa-lock"></i> Invite',
            status_open: '<i class="fa-solid fa-door-open"></i> Open',
            label_citizens: 'Citizens',
            label_allies: 'Allies',
            label_friendly: 'Friendly',
            label_enemies: 'Enemies',
            none: 'None'
        }
    };

    let currentLang = 'ja';

    function t(key) {
        return translations[currentLang][key] || key;
    }

    function updateUIText() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.innerHTML = t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = t(key);
        });
        document.getElementById('lang-toggle').textContent = currentLang === 'ja' ? 'EN' : 'JP';
        renderCountries();
        updatePlayers();
    }

    const MinecraftCRS = L.Util.extend({}, L.CRS.Simple, {
        transformation: new L.Transformation(1, 0, 1, 0)
    });

    function addLogEntry(method, url, status, timeMs, isError) {
        const container = document.getElementById('api-logs');
        if (!container) return;
        const el = document.createElement('div');
        el.className = `log-entry ${isError ? 'error' : 'success'}`;
        let displayUrl = url.replace(window.location.origin, '');
        if (displayUrl.startsWith('/tiles/overworld/')) displayUrl = displayUrl.replace('/tiles/overworld/', 'Tile: ');
        el.innerHTML = `<span class="log-method">${method}</span><span class="log-url" title="${url}">${displayUrl}</span><div class="log-info"><span class="log-status ${isError ? 'status-err' : 'status-ok'}">${status}</span><span class="log-time">${timeMs}ms</span></div>`;
        container.insertBefore(el, container.firstChild);
        if (container.children.length > 100) container.removeChild(container.lastChild);
    }

    async function fetchWithLog(url, options = {}) {
        const method = options.method || 'GET';
        const start = performance.now();
        try {
            const res = await fetch(url, options);
            const time = (performance.now() - start).toFixed(0);
            addLogEntry(method, url, res.status, time, !res.ok);
            return res;
        } catch (e) {
            const time = (performance.now() - start).toFixed(0);
            addLogEntry(method, url, "ERR", time, true);
            console.error(e);
            throw e;
        }
    }

    const clearLogsBtn = document.getElementById('clear-logs');
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', () => {
            const c = document.getElementById('api-logs');
            if (c) c.innerHTML = '';
        });
    }

    const LogTileLayer = L.TileLayer.extend({
        getTileUrl: function (coords) { return `/tiles/overworld/${coords.z}/${coords.x}/${coords.y}.png`; },
        createTile: function (coords, done) {
            const tile = document.createElement('img');
            L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
            L.DomEvent.on(tile, 'error', L.Util.bind(this._tileOnError, this, done, tile));
            if (this.options.crossOrigin) tile.crossOrigin = '';
            tile.alt = '';
            tile.src = this.getTileUrl(coords);
            const start = performance.now();
            const onLoaded = () => { addLogEntry('IMG', tile.src, 200, (performance.now() - start).toFixed(0), false); };
            const onError = () => { addLogEntry('IMG', tile.src, '404', (performance.now() - start).toFixed(0), true); };
            tile.addEventListener('load', onLoaded, { once: true });
            tile.addEventListener('error', onError, { once: true });
            return tile;
        }
    });

    const mcColorMap = { black: '#1D1D21', red: '#B02E26', green: '#5E7C16', brown: '#835432', blue: '#3C44AA', purple: '#8932B8', cyan: '#169C9C', light_gray: '#9D9D97', gray: '#474F52', pink: '#F38BAA', lime: '#80C71F', yellow: '#FED83D', light_blue: '#3AB3DA', magenta: '#C74EBD', orange: '#F9801D', white: '#F9FFFE' };
    const bannerPatterns = { b: (ctx) => { ctx.fillRect(0, 0, 20, 40) }, bs: (ctx) => { ctx.fillRect(0, 34, 20, 6) }, ts: (ctx) => { ctx.fillRect(0, 0, 20, 6) }, ls: (ctx) => { ctx.fillRect(0, 0, 6, 40) }, rs: (ctx) => { ctx.fillRect(14, 0, 6, 40) }, cs: (ctx) => { ctx.fillRect(7, 0, 6, 40) }, ms: (ctx) => { ctx.fillRect(0, 17, 20, 6) }, dls: (ctx) => { ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(20, 0); ctx.lineTo(20, 6); ctx.lineTo(6, 40); ctx.fill() }, drs: (ctx) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 40); ctx.lineTo(14, 40); ctx.lineTo(0, 6); ctx.fill() }, cr: (ctx) => { ctx.fillRect(0, 14, 20, 12); ctx.fillRect(4, 0, 12, 40) }, sc: (ctx) => { ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 40); ctx.moveTo(0, 40); ctx.lineTo(20, 0); ctx.stroke() }, ld: (ctx) => { ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(20, 0); ctx.lineTo(0, 0); ctx.fill() }, rd: (ctx) => { ctx.beginPath(); ctx.moveTo(20, 40); ctx.lineTo(0, 0); ctx.lineTo(20, 0); ctx.fill() }, vh: (ctx) => { ctx.fillRect(0, 0, 20, 20) }, vhr: (ctx) => { ctx.fillRect(0, 20, 20, 20) }, hh: (ctx) => { ctx.fillRect(0, 0, 10, 40) }, hhr: (ctx) => { ctx.fillRect(10, 0, 10, 40) }, bo: (ctx, c) => { ctx.lineWidth = 4; ctx.strokeStyle = c; ctx.strokeRect(2, 2, 16, 36) }, cbo: (ctx, c) => { ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.strokeRect(1, 1, 18, 38) }, bt: (ctx) => { ctx.beginPath(); ctx.moveTo(10, 24); ctx.lineTo(0, 34); ctx.lineTo(20, 34); ctx.fill() }, tt: (ctx) => { ctx.beginPath(); ctx.moveTo(10, 16); ctx.lineTo(0, 6); ctx.lineTo(20, 6); ctx.fill() }, bts: (ctx) => { ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(10, 30); ctx.lineTo(20, 40); ctx.fill() }, tts: (ctx) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 10); ctx.lineTo(20, 0); ctx.fill() }, cre: (ctx) => { ctx.fillRect(4, 4, 12, 12); ctx.fillRect(8, 16, 4, 8); ctx.fillRect(4, 24, 4, 4); ctx.fillRect(12, 24, 4, 4) }, sku: (ctx) => { ctx.fillRect(4, 8, 12, 12); ctx.fillRect(8, 4, 4, 4); ctx.fillRect(8, 20, 4, 4) }, flo: (ctx) => { ctx.beginPath(); ctx.arc(10, 10, 4, 0, 2 * Math.PI); ctx.fill(); ctx.fillRect(8, 0, 4, 20); ctx.fillRect(0, 8, 20, 4) } };

    function drawBanner(bannerJSON, canvas) {
        if (!bannerJSON || !canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let patterns;
        try { patterns = JSON.parse(bannerJSON); } catch (e) { return; }
        if (!Array.isArray(patterns)) return;
        const baseCanvas = document.createElement('canvas'); baseCanvas.width = 20; baseCanvas.height = 40;
        const bCtx = baseCanvas.getContext('2d');
        patterns.forEach(p => {
            const func = bannerPatterns[p.Pattern];
            const color = mcColorMap[p.Color] || p.Color || '#FFF';
            if (func) { bCtx.fillStyle = color; bCtx.strokeStyle = color; func(bCtx, color); }
        });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(baseCanvas, 0, 0, canvas.width, canvas.height);
    }

    function showToast(msg) {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = 'toast'; el.textContent = msg; container.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2000);
    }

    function updateUrl() {
        const center = state.map.getCenter();
        const zoom = state.map.getZoom();
        const x = Math.round(center.lng);
        const z = Math.round(center.lat);
        history.replaceState(null, null, `#x=${x}&z=${z}&zoom=${zoom}`);
    }

    function initTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            });
        });
    }

    function initLayers() {
        document.getElementById('layer-players').addEventListener('change', (e) => {
            e.target.checked ? state.map.addLayer(state.layers.players) : state.map.removeLayer(state.layers.players);
        });

        document.getElementById('layer-territories').addEventListener('change', (e) => {
            if (e.target.checked) {
                state.map.addLayer(state.layers.countries);
                state.map.addLayer(state.layers.borders);
            } else {
                state.map.removeLayer(state.layers.countries);
                state.map.removeLayer(state.layers.borders);
            }
        });

        const namesToggle = document.getElementById('layer-names');
        const mapEl = document.getElementById('map');
        const updateNamesVisibility = () => {
            if (namesToggle.checked) mapEl.classList.add('map-show-names');
            else mapEl.classList.remove('map-show-names');
        };
        namesToggle.addEventListener('change', updateNamesVisibility);
        updateNamesVisibility();
    }

    function initMap() {
        const initX = parseInt(state.urlParams.get('x')) || 0;
        const initZ = parseInt(state.urlParams.get('z')) || 0;
        const initZoom = parseInt(state.urlParams.get('zoom')) || 0;

        state.map = L.map('map', {
            crs: MinecraftCRS,
            minZoom: MIN_ZOOM_CLIENT,
            maxZoom: MAX_ZOOM_CLIENT,
            zoomSnap: 0.5,
            zoomDelta: 0.5,
            center: [initZ, initX],
            zoom: initZoom,
            attributionControl: false,
            zoomControl: false
        });

        L.control.zoom({ position: 'bottomright' }).addTo(state.map);

        state.map.createPane('claimsPane').style.zIndex = 450;
        state.map.createPane('bordersPane').style.zIndex = 451;

        const tileLayer = new LogTileLayer('', {
            tileSize: TILE_SIZE,
            minNativeZoom: MIN_NATIVE_ZOOM,
            maxNativeZoom: MAX_NATIVE_ZOOM,
            minZoom: MIN_ZOOM_CLIENT,
            maxZoom: MAX_ZOOM_CLIENT,
            errorTileUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiB2aWV3Qm94PSIwIDAgNTEyIDUxMiI+PHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmVkIiBzdHJva2Utd2lkdGg9IjIiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0icmVkIiBmb250LXNpemU9IjI0Ij5Xcm9uZyBDb29yZDwvdGV4dD48L3N2Zz4=',
            noWrap: true,
            bounds: null
        });

        state.layers.tiles = tileLayer;
        state.layers.tiles.addTo(state.map);
        Object.values(state.layers).forEach(l => l && state.map.hasLayer(l) === false && l.addTo(state.map));

        state.map.on('moveend', updateUrl);
        state.map.on('mousemove', (e) => {
            const x = Math.round(e.latlng.lng);
            const z = Math.round(e.latlng.lat);
            document.getElementById('coords-text').textContent = `X: ${x}, Z: ${z}`;
        });

        document.getElementById('coord-box').addEventListener('click', () => {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => showToast(t('toast_copied')));
        });

        document.getElementById('lang-toggle').addEventListener('click', () => {
            currentLang = currentLang === 'ja' ? 'en' : 'ja';
            updateUIText();
        });
    }

    function renderCountries() {
        const g = state.layers.countries;
        const bg = state.layers.borders;
        g.clearLayers();
        bg.clearLayers();

        const cMap = new Map(state.countries.map(c => [c.id, c]));
        const chunks = new Map();
        state.chunks.filter(c => c.dimension === 'overworld' && c.id > 0).forEach(c => chunks.set(`${c.x}_${c.z}`, c.id));

        const countryListEl = document.getElementById('country-list');
        if (countryListEl) {
            countryListEl.innerHTML = '';
            const searchVal = document.getElementById('search-countries').value.toLowerCase();
            state.countries.filter(c => c.name.toLowerCase().includes(searchVal)).forEach(c => {
                const li = document.createElement('li');
                li.innerHTML = `<span style="width:12px;height:12px;border-radius:50%;background:${c.color || '#fff'};display:inline-block"></span> ${c.name}`;
                li.onclick = () => {
                    const chunk = state.chunks.find(chk => chk.id === c.id);
                    if (chunk) state.map.setView([chunk.z * 16, chunk.x * 16], -1);
                };
                countryListEl.appendChild(li);
            });
        }

        state.chunks.forEach(c => {
            if (c.dimension !== 'overworld' || c.id <= 0) return;
            const country = cMap.get(c.id);
            const bounds = [[c.z * 16, c.x * 16], [(c.z + 1) * 16, (c.x + 1) * 16]];
            const color = country ? (country.color || '#fff') : '#888';

            const poly = L.rectangle(bounds, {
                color: 'transparent', weight: 0, fillColor: color, fillOpacity: 0.3, pane: 'claimsPane'
            }).addTo(g);

            if (country) {
                const peopleList = country.members ? country.members : t('none');
                const allyList = country.alliance ? country.alliance.replace(/§./g, '') : null;
                const friendlyList = country.friendly ? country.friendly.replace(/§./g, '') : null;
                const enemyList = country.hostility ? country.hostility.replace(/§./g, '') : null;

                const popup = `
                    <div class="country-popup">
                        <div class="country-header">
                            <div class="banner-container"><canvas id="ban-${c.id}-${c.x}-${c.z}"></canvas></div>
                            <div class="country-title">
                                <h3>${country.name}</h3>
                                <p class="country-lore">${country.lore || ''}</p>
                            </div>
                        </div>

                        <div class="country-badges">
                            <span class="status-badge ${country.peace ? 'peace' : 'war'}">
                                ${country.peace ? t('status_peace') : t('status_war')}
                            </span>
                            <span class="status-badge">
                                ${country.invite ? t('status_invite') : t('status_open')}
                            </span>
                        </div>

                        <div class="country-stats">
                            <div class="stat-item"><span class="stat-label">${t('label_id')}</span><span class="stat-value">${country.id}</span></div>
                            <div class="stat-item"><span class="stat-label">${t('label_level')}</span><span class="stat-value">${country.lv || 0}</span></div>
                            <div class="stat-item"><span class="stat-label">${country.ownername}</span><span class="stat-value">${country.owner || 'N/A'}</span></div>
                        </div>

                        <div class="country-relations">
                            <div class="relation-group">
                                <span class="relation-label">${country.membersname}</span>
                                <div class="relation-list">${peopleList}</div>
                            </div>
                            ${allyList ? `
                                <div class="relation-group">
                                    <span class="relation-label" style="color:#a6e3a1">${t('label_allies')}</span>
                                    <div class="relation-list">${allyList}</div>
                                </div>` : ''}
                            ${friendlyList ? `
                                <div class="relation-group">
                                    <span class="relation-label" style="color:#89b4fa">${t('label_friendly')}</span>
                                    <div class="relation-list">${friendlyList}</div>
                                </div>` : ''}
                            ${enemyList ? `
                                <div class="relation-group">
                                    <span class="relation-label" style="color:#f38ba8">${t('label_enemies')}</span>
                                    <div class="relation-list">${enemyList}</div>
                                </div>` : ''}
                        </div>
                    </div>`;
                poly.bindPopup(popup, { minWidth: 320 });
                poly.on('popupopen', () => {
                    setTimeout(() => {
                        const cvs = document.getElementById(`ban-${c.id}-${c.x}-${c.z}`);
                        if (cvs && country.banner) {
                            const ctx = cvs.getContext('2d');
                            const img = new Image();
                            img.crossOrigin = 'Anonymous';
                            img.src = country.banner;
                            img.onload = () => {
                                ctx.clearRect(0, 0, cvs.width, cvs.height);
                                ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
                            };
                        }
                    }, 10);
                });
            }

            const opts = { color: color, weight: 2, pane: 'bordersPane', opacity: 0.8, interactive: false };
            const n = chunks.get(`${c.x}_${c.z - 1}`), s = chunks.get(`${c.x}_${c.z + 1}`), w = chunks.get(`${c.x - 1}_${c.z}`), e = chunks.get(`${c.x + 1}_${c.z}`);
            if (n !== c.id) L.polyline([[c.z * 16, c.x * 16], [c.z * 16, (c.x + 1) * 16]], opts).addTo(bg);
            if (s !== c.id) L.polyline([[(c.z + 1) * 16, c.x * 16], [(c.z + 1) * 16, (c.x + 1) * 16]], opts).addTo(bg);
            if (w !== c.id) L.polyline([[c.z * 16, c.x * 16], [(c.z + 1) * 16, c.x * 16]], opts).addTo(bg);
            if (e !== c.id) L.polyline([[c.z * 16, (c.x + 1) * 16], [(c.z + 1) * 16, (c.x + 1) * 16]], opts).addTo(bg);
        });
    }

    async function updatePlayers() {
        try {
            const res = await fetchWithLog('/api/map/players');
            if (!res.ok) return;
            const players = await res.json();
            state.players = players;

            const searchVal = document.getElementById('search-players').value.toLowerCase();
            const online = state.players.filter(p => {
                if (!p.point) return false;
                return p.name.toLowerCase().includes(searchVal);
            });
            document.getElementById('player-count').textContent = online.length;

            const currentActiveNames = new Set();

            online.forEach(p => {
                const name = p.name;
                currentActiveNames.add(name);
                const latlng = [p.point.y, p.point.x];
                let skinUrl = `https://cravatar.eu/helmavatar/${name.replace(/\s+/g, '_')}/64.png`;
                if (p.skin) skinUrl = p.skin;

                const popupContent = `
                    <div class="player-popup">
                        <b>${p.name}</b>
                        <span>X: ${p.point.x}, Z: ${p.point.y}</span>
                    </div>
                `;

                if (!p.point.invisibility) {
                    if (state.playerMarkers.has(name)) {
                        const marker = state.playerMarkers.get(name);
                        marker.setLatLng(latlng);
                        if (marker.getPopup()) marker.setPopupContent(popupContent);
                    } else {
                        const icon = L.divIcon({
                            className: 'player-marker-icon',
                            html: `<div class="player-marker-name">${name}</div><img class="player-marker-img" src="${skinUrl}">`,
                            iconSize: [36, 36], iconAnchor: [18, 18]
                        });
                        const marker = L.marker(latlng, { icon }).addTo(state.layers.players)
                            .bindPopup(popupContent)
                            .on('click', () => state.map.flyTo(latlng, 0));
                        state.playerMarkers.set(name, marker);
                    }
                } else {
                    if (state.playerMarkers.has(name)) {
                        state.layers.players.removeLayer(state.playerMarkers.get(name));
                        state.playerMarkers.delete(name);
                    }
                }
            });

            state.playerMarkers.forEach((marker, name) => {
                if (!currentActiveNames.has(name)) {
                    state.layers.players.removeLayer(marker);
                    state.playerMarkers.delete(name);
                }
            });

            const listEl = document.getElementById('player-list');
            if (listEl) {
                listEl.innerHTML = '';
                online.forEach(p => {
                    const li = document.createElement('li');
                    let listSkinUrl = `https://cravatar.eu/helmavatar/${p.name.replace(/\s+/g, '_')}/32.png`;
                    if (p.skin) listSkinUrl = p.skin;
                    li.innerHTML = `<img src="${listSkinUrl}" class="player-head"> ${p.name}`;
                    if (p.point.invisibility) {
                        li.classList.add('player-invisible');
                    } else {
                        li.onclick = () => {
                            const ll = [p.point.y, p.point.x];
                            state.map.flyTo(ll, 0);
                        };
                    }
                    listEl.appendChild(li);
                });
            }

        } catch (e) { }
    }

    async function loadData() {
        try {
            const [pRes, iRes] = await Promise.all([
                fetchWithLog('/api/map/players'),
                fetchWithLog('/api/initial-data')
            ]);

            if (pRes.ok) state.players = await pRes.json();
            if (iRes.ok) {
                const data = await iRes.json();
                state.countries = data.countries || [];
                state.chunks = data.chunks || [];
            }

            updateUIText();

            document.getElementById('loading-screen').style.opacity = '0';
            setTimeout(() => document.getElementById('loading-screen').style.display = 'none', 500);
        } catch (e) { console.error(e); }
    }

    initMap();
    initTabs();
    initLayers();
    loadData();

    document.getElementById('search-players').addEventListener('input', updatePlayers);
    document.getElementById('search-countries').addEventListener('input', renderCountries);

    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const openBtn = document.createElement('button');
    openBtn.id = 'sidebar-open-btn';
    openBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    document.getElementById('ui-layer').appendChild(openBtn);

    const toggleSidebar = () => {
        sidebar.classList.toggle('collapsed');
        const isClosed = sidebar.classList.contains('collapsed');
        openBtn.style.display = isClosed ? 'block' : 'none';
        toggleBtn.innerHTML = isClosed ? '<i class="fa-solid fa-chevron-left"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
    };

    toggleBtn.onclick = toggleSidebar;
    openBtn.onclick = toggleSidebar;

    setInterval(updatePlayers, 2000);
});
