const fs = require('fs-extra');
const path = require('path');
const { Pool } = require('pg');
const sharp = require('sharp');

const TILE_SIZE = 512;
const TILES_DIR = path.join(__dirname, './public/tiles');
const COLOR_MAP_PATH = path.join(__dirname, './colormap.json');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let COLOR_MAP = {};
const unknownBlockLogSet = new Set();

try {
    if (fs.existsSync(COLOR_MAP_PATH)) {
        COLOR_MAP = fs.readJsonSync(COLOR_MAP_PATH);
        console.log(`[TileGenerator] ✅ Loaded colormap with ${Object.keys(COLOR_MAP).length} entries.`);
    } else {
        console.warn(`[TileGenerator] ⚠️ colormap.json not found.`);
    }
} catch (e) { console.error(`[TileGenerator] Colormap load error: ${e.message}`); }

const MANUAL_COLORS = {
     "minecraft:leaves": { r: 50, g: 120, b: 30, a: 1.0 }, // 旧ID
    "minecraft:leaves2": { r: 50, g: 120, b: 30, a: 1.0 }, // 旧ID2
    // --- 水・氷・空 ---
    "minecraft:water": { r: 64, g: 100, b: 232, a: 0.6 },
    "minecraft:flowing_water": { r: 64, g: 100, b: 232, a: 0.6 },
    "minecraft:bubble_column": { r: 64, g: 100, b: 232, a: 0.6 },
    "minecraft:ice": { r: 160, g: 190, b: 255, a: 0.8 },
    "minecraft:packed_ice": { r: 160, g: 190, b: 255, a: 0.9 },
    "minecraft:blue_ice": { r: 160, g: 190, b: 255, a: 1.0 },
    "minecraft:frosted_ice": { r: 160, g: 190, b: 255, a: 0.8 },
    "minecraft:snow": { r: 255, g: 255, b: 255, a: 1.0 },
    "minecraft:snow_layer": { r: 255, g: 255, b: 255, a: 1.0 },
    "minecraft:powder_snow": { r: 240, g: 240, b: 240, a: 1.0 },
    "minecraft:air": { r: 0, g: 0, b: 0, a: 0 },
    
    "minecraft:void_air": { r: 0, g: 0, b: 0, a: 0 },
    "minecraft:cave_air": { r: 0, g: 0, b: 0, a: 0 },
    "minecraft:structure_void": { r: 0, g: 0, b: 0, a: 0 },
    "minecraft:light_block": { r: 0, g: 0, b: 0, a: 0 },
    "minecraft:barrier": { r: 0, g: 0, b: 0, a: 0 },

    // --- 羊毛 (Wool) ---
    "minecraft:white_wool": { r: 233, g: 236, b: 236, a: 1.0 },
    "minecraft:orange_wool": { r: 240, g: 118, b: 19, a: 1.0 },
    "minecraft:magenta_wool": { r: 189, g: 68, b: 179, a: 1.0 },
    "minecraft:light_blue_wool": { r: 58, g: 175, b: 217, a: 1.0 },
    "minecraft:yellow_wool": { r: 248, g: 197, b: 39, a: 1.0 },
    "minecraft:lime_wool": { r: 112, g: 185, b: 25, a: 1.0 },
    "minecraft:pink_wool": { r: 237, g: 141, b: 172, a: 1.0 },
    "minecraft:gray_wool": { r: 62, g: 68, b: 71, a: 1.0 },
    "minecraft:light_gray_wool": { r: 142, g: 142, b: 134, a: 1.0 },
    "minecraft:cyan_wool": { r: 21, g: 137, b: 145, a: 1.0 },
    "minecraft:purple_wool": { r: 121, g: 42, b: 172, a: 1.0 },
    "minecraft:blue_wool": { r: 53, g: 57, b: 157, a: 1.0 },
    "minecraft:brown_wool": { r: 114, g: 71, b: 40, a: 1.0 },
    "minecraft:green_wool": { r: 84, g: 109, b: 27, a: 1.0 },
    "minecraft:red_wool": { r: 161, g: 39, b: 34, a: 1.0 },
    "minecraft:black_wool": { r: 20, g: 21, b: 25, a: 1.0 },

    // --- 地形・木・葉 ---
    "minecraft:grass_block": { r: 124, g: 189, b: 107, a: 1.0 },
    "minecraft:dirt": { r: 134, g: 96, b: 67, a: 1.0 },
    "minecraft:coarse_dirt": { r: 119, g: 85, b: 59, a: 1.0 },
    "minecraft:rooted_dirt": { r: 134, g: 96, b: 67, a: 1.0 },
    "minecraft:podzol": { r: 90, g: 63, b: 44, a: 1.0 },
    "minecraft:farmland": { r: 134, g: 96, b: 67, a: 1.0 },
    "minecraft:dirt_path": { r: 160, g: 120, b: 80, a: 1.0 },
    "minecraft:sand": { r: 219, g: 211, b: 160, a: 1.0 },
    "minecraft:red_sand": { r: 180, g: 100, b: 40, a: 1.0 },
    "minecraft:suspicious_sand": { r: 219, g: 211, b: 160, a: 1.0 },
    "minecraft:suspicious_gravel": { r: 130, g: 125, b: 125, a: 1.0 },
    "minecraft:gravel": { r: 130, g: 125, b: 125, a: 1.0 },
    "minecraft:clay": { r: 160, g: 165, b: 175, a: 1.0 },
    "minecraft:lava": { r: 255, g: 90, b: 0, a: 1.0 },
    "minecraft:flowing_lava": { r: 255, g: 90, b: 0, a: 1.0 },
    "minecraft:magma_block": { r: 100, g: 50, b: 20, a: 1.0 },
    "minecraft:obsidian": { r: 20, g: 18, b: 26, a: 1.0 },
    "minecraft:crying_obsidian": { r: 30, g: 10, b: 50, a: 1.0 },

    // --- 石材 ---
    "minecraft:stone": { r: 125, g: 125, b: 125, a: 1.0 },
    "minecraft:cobblestone": { r: 100, g: 100, b: 100, a: 1.0 },
    "minecraft:mossy_cobblestone": { r: 80, g: 100, b: 80, a: 1.0 },
    "minecraft:smooth_stone": { r: 140, g: 140, b: 140, a: 1.0 },
    "minecraft:diorite": { r: 180, g: 180, b: 180, a: 1.0 },
    "minecraft:granite": { r: 150, g: 110, b: 90, a: 1.0 },
    "minecraft:andesite": { r: 110, g: 110, b: 110, a: 1.0 },
    "minecraft:deepslate": { r: 60, g: 60, b: 65, a: 1.0 },
    "minecraft:cobbled_deepslate": { r: 50, g: 50, b: 55, a: 1.0 },
    "minecraft:polished_deepslate": { r: 60, g: 60, b: 65, a: 1.0 },
    "minecraft:tuff": { r: 80, g: 80, b: 75, a: 1.0 },
    "minecraft:dripstone_block": { r: 100, g: 80, b: 70, a: 1.0 },
    "minecraft:calcite": { r: 220, g: 220, b: 220, a: 1.0 },
    "minecraft:bedrock": { r: 30, g: 30, b: 30, a: 1.0 },

    // --- 深層岩鉱石 ---
    "minecraft:deepslate_coal_ore": { r: 60, g: 60, b: 65, a: 1.0 },
    "minecraft:deepslate_iron_ore": { r: 60, g: 60, b: 65, a: 1.0 },
    "minecraft:deepslate_gold_ore": { r: 60, g: 60, b: 65, a: 1.0 },
    "minecraft:deepslate_copper_ore": { r: 60, g: 60, b: 65, a: 1.0 },
    "minecraft:deepslate_lapis_ore": { r: 60, g: 60, b: 65, a: 1.0 },
    "minecraft:deepslate_redstone_ore": { r: 60, g: 60, b: 65, a: 1.0 },
    "minecraft:deepslate_emerald_ore": { r: 60, g: 60, b: 65, a: 1.0 },
    "minecraft:deepslate_diamond_ore": { r: 60, g: 60, b: 65, a: 1.0 },

    // --- プリズマリン ---
    "minecraft:prismarine": { r: 99, g: 156, b: 151, a: 1.0 },
    "minecraft:prismarine_bricks": { r: 99, g: 171, b: 158, a: 1.0 },
    "minecraft:dark_prismarine": { r: 51, g: 91, b: 75, a: 1.0 },

    // --- 植物 ---
    "minecraft:cactus": { r: 80, g: 120, b: 50, a: 1.0 },
    "minecraft:bamboo": { r: 100, g: 140, b: 40, a: 1.0 },
    "minecraft:sugar_cane": { r: 140, g: 190, b: 100, a: 1.0 },
    "minecraft:reeds": { r: 140, g: 190, b: 100, a: 1.0 },
    "minecraft:vine": { r: 50, g: 100, b: 30, a: 1.0 },
    "minecraft:lily_pad": { r: 40, g: 100, b: 20, a: 1.0 },
    "minecraft:pumpkin": { r: 200, g: 120, b: 20, a: 1.0 },
    "minecraft:carved_pumpkin": { r: 200, g: 120, b: 20, a: 1.0 },
    "minecraft:jack_o_lantern": { r: 220, g: 150, b: 50, a: 1.0 },
    "minecraft:melon_block": { r: 120, g: 160, b: 40, a: 1.0 },
    "minecraft:hay_block": { r: 200, g: 180, b: 40, a: 1.0 },
    "minecraft:brown_mushroom_block": { r: 130, g: 100, b: 80, a: 1.0 },
    "minecraft:red_mushroom_block": { r: 200, g: 40, b: 40, a: 1.0 },
    "minecraft:mushroom_stem": { r: 200, g: 200, b: 190, a: 1.0 },
    "minecraft:brown_mushroom": { r: 130, g: 100, b: 80, a: 1.0 },
    "minecraft:red_mushroom": { r: 200, g: 40, b: 40, a: 1.0 },
    "minecraft:cocoa": { r: 150, g: 100, b: 50, a: 1.0 },
    "minecraft:beetroots": { r: 0, g: 120, b: 0, a: 1.0 },
    "minecraft:beetroot": { r: 0, g: 120, b: 0, a: 1.0 },

    // 花・草・低木
    "minecraft:dandelion": { r: 255, g: 255, b: 0, a: 1.0 },
    "minecraft:poppy": { r: 255, g: 0, b: 0, a: 1.0 },
    "minecraft:blue_orchid": { r: 100, g: 100, b: 255, a: 1.0 },
    "minecraft:allium": { r: 200, g: 100, b: 255, a: 1.0 },
    "minecraft:azure_bluet": { r: 220, g: 220, b: 255, a: 1.0 },
    "minecraft:red_tulip": { r: 255, g: 0, b: 0, a: 1.0 },
    "minecraft:orange_tulip": { r: 255, g: 150, b: 0, a: 1.0 },
    "minecraft:white_tulip": { r: 255, g: 255, b: 255, a: 1.0 },
    "minecraft:pink_tulip": { r: 255, g: 150, b: 200, a: 1.0 },
    "minecraft:oxeye_daisy": { r: 220, g: 220, b: 220, a: 1.0 },
    "minecraft:cornflower": { r: 50, g: 50, b: 200, a: 1.0 },
    "minecraft:lily_of_the_valley": { r: 255, g: 255, b: 255, a: 1.0 },
    "minecraft:wither_rose": { r: 30, g: 30, b: 30, a: 1.0 },
    "minecraft:sunflower": { r: 255, g: 255, b: 0, a: 1.0 },
    "minecraft:lilac": { r: 200, g: 100, b: 200, a: 1.0 },
    "minecraft:rose_bush": { r: 200, g: 0, b: 0, a: 1.0 },
    "minecraft:peony": { r: 255, g: 150, b: 200, a: 1.0 },
    "minecraft:large_fern": { r: 50, g: 120, b: 30, a: 1.0 },
    "minecraft:tall_grass": { r: 100, g: 150, b: 70, a: 1.0 },
    "minecraft:fern": { r: 50, g: 120, b: 30, a: 1.0 },
    "minecraft:deadbush": { r: 100, g: 80, b: 40, a: 1.0 },
    "minecraft:big_dripleaf": { r: 112, g: 142, b: 51, a: 1.0 },
    "minecraft:small_dripleaf_block": { r: 95, g: 119, b: 47, a: 1.0 },
    "minecraft:azalea": { r: 92, g: 110, b: 42, a: 1.0 },
    "minecraft:flowering_azalea": { r: 100, g: 112, b: 61, a: 1.0 },
    "minecraft:mangrove_roots": { r: 76, g: 60, b: 38, a: 1.0 },
    "minecraft:muddy_mangrove_roots": { r: 61, g: 58, b: 61, a: 1.0 },

    // 葉っぱ
    "minecraft:oak_leaves": { r: 50, g: 120, b: 30, a: 1.0 },
    "minecraft:spruce_leaves": { r: 50, g: 80, b: 50, a: 1.0 },
    "minecraft:birch_leaves": { r: 100, g: 140, b: 60, a: 1.0 },
    "minecraft:jungle_leaves": { r: 40, g: 180, b: 20, a: 1.0 },
    "minecraft:acacia_leaves": { r: 80, g: 100, b: 30, a: 1.0 },
    "minecraft:dark_oak_leaves": { r: 30, g: 70, b: 10, a: 1.0 },
    "minecraft:mangrove_leaves": { r: 30, g: 100, b: 30, a: 1.0 },
    "minecraft:cherry_leaves": { r: 240, g: 150, b: 200, a: 1.0 },
    "minecraft:azalea_leaves": { r: 80, g: 120, b: 40, a: 1.0 },
    "minecraft:flowering_azalea_leaves": { r: 100, g: 140, b: 60, a: 1.0 },
    "minecraft:leaves": { r: 50, g: 120, b: 30, a: 1.0 },

    // 原木
    "minecraft:oak_log": { r: 115, g: 90, b: 55, a: 1.0 },
    "minecraft:spruce_log": { r: 60, g: 40, b: 20, a: 1.0 },
    "minecraft:birch_log": { r: 210, g: 210, b: 200, a: 1.0 },
    "minecraft:jungle_log": { r: 150, g: 110, b: 70, a: 1.0 },
    "minecraft:acacia_log": { r: 105, g: 95, b: 85, a: 1.0 },
    "minecraft:dark_oak_log": { r: 40, g: 30, b: 15, a: 1.0 },
    "minecraft:mangrove_log": { r: 80, g: 30, b: 30, a: 1.0 },
    "minecraft:cherry_log": { r: 60, g: 40, b: 50, a: 1.0 },
    "minecraft:crimson_stem": { r: 100, g: 30, b: 50, a: 1.0 },
    "minecraft:warped_stem": { r: 30, g: 100, b: 80, a: 1.0 },
    "minecraft:stripped_oak_log": { r: 160, g: 130, b: 80, a: 1.0 },
    "minecraft:stripped_spruce_log": { r: 100, g: 80, b: 50, a: 1.0 },
    "minecraft:stripped_birch_log": { r: 220, g: 200, b: 140, a: 1.0 },
    "minecraft:stripped_jungle_log": { r: 180, g: 140, b: 90, a: 1.0 },
    "minecraft:stripped_acacia_log": { r: 170, g: 100, b: 60, a: 1.0 },
    "minecraft:stripped_dark_oak_log": { r: 80, g: 60, b: 40, a: 1.0 },
    "minecraft:stripped_mangrove_log": { r: 120, g: 60, b: 60, a: 1.0 },
    "minecraft:stripped_cherry_log": { r: 230, g: 170, b: 180, a: 1.0 },

    // 木材・建材
    "minecraft:oak_planks": { r: 160, g: 130, b: 80, a: 1.0 },
    "minecraft:spruce_planks": { r: 100, g: 80, b: 50, a: 1.0 },
    "minecraft:birch_planks": { r: 220, g: 200, b: 140, a: 1.0 },
    "minecraft:jungle_planks": { r: 180, g: 140, b: 90, a: 1.0 },
    "minecraft:acacia_planks": { r: 170, g: 100, b: 60, a: 1.0 },
    "minecraft:dark_oak_planks": { r: 80, g: 60, b: 40, a: 1.0 },
    "minecraft:mangrove_planks": { r: 120, g: 60, b: 60, a: 1.0 },
    "minecraft:cherry_planks": { r: 230, g: 170, b: 180, a: 1.0 },
    "minecraft:crimson_planks": { r: 120, g: 60, b: 90, a: 1.0 },
    "minecraft:warped_planks": { r: 50, g: 120, b: 110, a: 1.0 },
    "minecraft:bamboo_planks": { r: 210, g: 190, b: 100, a: 1.0 },

    // サンゴブロック
    "minecraft:tube_coral_block": { r: 50, g: 88, b: 207, a: 1.0 },
    "minecraft:brain_coral_block": { r: 204, g: 85, b: 153, a: 1.0 },
    "minecraft:bubble_coral_block": { r: 161, g: 34, b: 159, a: 1.0 },
    "minecraft:fire_coral_block": { r: 160, g: 36, b: 46, a: 1.0 },
    "minecraft:horn_coral_block": { r: 206, g: 184, b: 62, a: 1.0 },
    
    // サンゴ(植物/ファン) - 水中で見えたとき用
    "minecraft:tube_coral": { r: 50, g: 88, b: 207, a: 1.0 },
    "minecraft:brain_coral": { r: 204, g: 85, b: 153, a: 1.0 },
    "minecraft:bubble_coral": { r: 161, g: 34, b: 159, a: 1.0 },
    "minecraft:fire_coral": { r: 160, g: 36, b: 46, a: 1.0 },
    "minecraft:horn_coral": { r: 206, g: 184, b: 62, a: 1.0 },
    "minecraft:tube_coral_fan": { r: 50, g: 88, b: 207, a: 1.0 },
    "minecraft:brain_coral_fan": { r: 204, g: 85, b: 153, a: 1.0 },
    "minecraft:bubble_coral_fan": { r: 161, g: 34, b: 159, a: 1.0 },
    "minecraft:fire_coral_fan": { r: 160, g: 36, b: 46, a: 1.0 },
    "minecraft:horn_coral_fan": { r: 206, g: 184, b: 62, a: 1.0 },

    // その他装飾
    "minecraft:crafting_table": { r: 150, g: 100, b: 60, a: 1.0 },
    "minecraft:bookshelf": { r: 150, g: 100, b: 60, a: 1.0 },
    "minecraft:chest": { r: 150, g: 100, b: 40, a: 1.0 },
    "minecraft:trapped_chest": { r: 150, g: 100, b: 40, a: 1.0 },
    "minecraft:barrel": { r: 120, g: 90, b: 60, a: 1.0 },
    "minecraft:composter": { r: 130, g: 90, b: 50, a: 1.0 },
    "minecraft:ladder": { r: 160, g: 130, b: 80, a: 1.0 },
    "minecraft:torch": { r: 255, g: 255, b: 100, a: 1.0 },
    "minecraft:lantern": { r: 80, g: 80, b: 90, a: 1.0 },
    "minecraft:bell": { r: 250, g: 220, b: 100, a: 1.0 },
    "minecraft:bed": { r: 180, g: 40, b: 40, a: 1.0 },
    "minecraft:anvil": { r: 70, g: 70, b: 70, a: 1.0 },
    "minecraft:glass": { r: 255, g: 255, b: 255, a: 0.1 },
    "minecraft:glass_pane": { r: 255, g: 255, b: 255, a: 0.1 },
    "minecraft:iron_bars": { r: 150, g: 150, b: 150, a: 1.0 },
    "minecraft:scaffolding": { r: 200, g: 180, b: 120, a: 1.0 },

    // テラコッタ
    "minecraft:terracotta": { r: 150, g: 90, b: 60, a: 1.0 },
    "minecraft:white_terracotta": { r: 210, g: 180, b: 160, a: 1.0 },
    "minecraft:orange_terracotta": { r: 160, g: 80, b: 30, a: 1.0 },
    "minecraft:yellow_terracotta": { r: 180, g: 130, b: 30, a: 1.0 },
    "minecraft:red_terracotta": { r: 140, g: 60, b: 40, a: 1.0 },
    "minecraft:brown_terracotta": { r: 70, g: 50, b: 30, a: 1.0 },
    "minecraft:light_gray_terracotta": { r: 130, g: 100, b: 90, a: 1.0 },
    "minecraft:cyan_terracotta": { r: 80, g: 90, b: 90, a: 1.0 },
    
    // コンクリート
    "minecraft:white_concrete": { r: 200, g: 200, b: 200, a: 1.0 },
    "minecraft:black_concrete": { r: 10, g: 10, b: 10, a: 1.0 },
    "minecraft:red_concrete": { r: 140, g: 30, b: 30, a: 1.0 },
    "minecraft:blue_concrete": { r: 40, g: 40, b: 140, a: 1.0 },
    "minecraft:lime_concrete": { r: 90, g: 170, b: 20, a: 1.0 },
    "minecraft:yellow_concrete": { r: 240, g: 170, b: 20, a: 1.0 },
};

function getColor(id) {
    if (!id || id === "minecraft:air") return { r:0, g:0, b:0, a:0 };
// 1. 外部colormap.jsonチェック
    if (COLOR_MAP[id]) {
        const c = COLOR_MAP[id];
        return { r: c.r, g: c.g, b: c.b, a: c.a !== undefined ? c.a : 1.0 };
    }
    // 2. 手動定義チェック
    if (MANUAL_COLORS[id]) return MANUAL_COLORS[id];

    

    // 3. キーワードフォールバック (強化版)
    if (id.includes("leaves")) return { r:50, g:100, b:30, a:1.0 };
    if (id.includes("grass")) return { r:124, g:189, b:107, a:1.0 };
    if (id.includes("water")) return { r:64, g:100, b:232, a:0.6 };
    
    if (id.includes("log") || id.includes("wood") || id.includes("planks") || id.includes("fence") || id.includes("stairs") || id.includes("slab") || id.includes("gate") || id.includes("door") || id.includes("trapdoor")) return { r:150, g:120, b:80, a:1.0 };
    
    if (id.includes("stone") || id.includes("cobble") || id.includes("brick") || id.includes("wall") || id.includes("polished") || id.includes("smooth")) return { r:125, g:125, b:125, a:1.0 };
    
    if (id.includes("sand")) return { r:219, g:211, b:160, a:1.0 };
    if (id.includes("snow") || id.includes("ice")) return { r:255, g:255, b:255, a:1.0 };
    if (id.includes("glass")) return { r:255, g:255, b:255, a:0.3 };
    if (id.includes("wool") || id.includes("carpet") || id.includes("concrete") || id.includes("terracotta") || id.includes("bed")) return { r:200, g:200, b:200, a:1.0 };
    if (id.includes("flower") || id.includes("plant") || id.includes("bush")) return { r:50, g:150, b:50, a:1.0 };

    // --- 追加: エラーログ頻出項目のフォールバック ---
    if (id.includes("deepslate")) return { r:60, g:60, b:65, a:1.0 }; // ディープスレート系
    if (id.includes("sculk")) return { r:13, g:31, b:37, a:1.0 }; // スカルク系
    if (id.includes("mangrove")) return { r:110, g:50, b:50, a:1.0 }; // マングローブ系
    if (id.includes("cherry")) return { r:230, g:170, b:180, a:1.0 }; // 桜系
    if (id.includes("prismarine")) return { r:99, g:156, b:151, a:1.0 }; // プリズマリン系
    if (id.includes("tuff")) return { r:80, g:80, b:75, a:1.0 }; // 凝灰岩
    if (id.includes("mud")) return { r:60, g:57, b:60, a:1.0 }; // 泥系
    if (id.includes("coral")) return { r:200, g:100, b:100, a:1.0 }; // サンゴ（その他）
    if (id.includes("amethyst")) return { r:150, g:100, b:200, a:1.0 }; // アメジスト
    if (id.includes("froglight")) return { r:250, g:250, b:200, a:1.0 }; // カエルライト

    // 4. 未知のブロック (ログ出し)
    if (!unknownBlockLogSet.has(id)) {
        console.warn(`[TileGenerator] ⚠️ Unknown block ID: "${id}". Using fallback gray.`);
        unknownBlockLogSet.add(id);
    }
    
    return { r:128, g:128, b:128, a:1.0 };
}

class TileGenerator {
    // Zoom 0 (DBから生成)
    async generateFromDB(tileX, tileY) {
        const tileWorldSize = TILE_SIZE; 
        const startCx = Math.floor((tileX * tileWorldSize) / 16);
        const startCz = Math.floor((tileY * tileWorldSize) / 16);
        const endCx = Math.floor(((tileX + 1) * tileWorldSize) / 16);
        const endCz = Math.floor(((tileY + 1) * tileWorldSize) / 16);

        const client = await pool.connect();
        const chunkMap = new Map();
        
        try {
            const res = await client.query(`
                SELECT cx, cz, data FROM chunks 
                WHERE cx >= $1 AND cx < $2 AND cz >= $3 AND cz < $4
            `, [startCx - 1, endCx, startCz - 1, endCz]);
            res.rows.forEach(r => chunkMap.set(`${r.cx},${r.cz}`, r.data));
        } finally { client.release(); }

        if (chunkMap.size === 0) return null;

        const buffer = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
        buffer.fill(0);

        for (let py = 0; py < TILE_SIZE; py++) {
            for (let px = 0; px < TILE_SIZE; px++) {
                const wx = (tileX * tileWorldSize) + px;
                const wz = (tileY * tileWorldSize) + py;

                const cx = Math.floor(wx / 16);
                const cz = Math.floor(wz / 16);
                const chunk = chunkMap.get(`${cx},${cz}`);

                if (!chunk) continue;

                const ox = wx & 15;
                const oz = wz & 15;
                const idx = oz * 16 + ox;

                if (!chunk.s_ids || chunk.s_ids.length <= idx) continue;

                const sId = chunk.palette[chunk.s_ids[idx]];
                const sY = chunk.s_ys[idx];
                
                let { r, g, b, a } = getColor(sId);

                // 影計算
                const nwx = wx - 1;
                const nwz = wz - 1;
                const nwcx = Math.floor(nwx / 16);
                const nwcz = Math.floor(nwz / 16);
                const nwChunk = chunkMap.get(`${nwcx},${nwcz}`);
                
                let nwY = sY;
                if (nwChunk && nwChunk.s_ys) {
                    const nwox = nwx & 15;
                    const nwoz = nwz & 15;
                    const nwIdx = nwoz * 16 + nwox;
                    if(nwChunk.s_ys.length > nwIdx) nwY = nwChunk.s_ys[nwIdx];
                }

                let brightness = 1.0 + ((sY - nwY) > 0 ? 0.15 : (sY - nwY) < 0 ? -0.15 : 0);
                brightness += (sY - 64) * 0.002;
                brightness = Math.max(0.4, Math.min(1.5, brightness));

                const pIdx = (py * TILE_SIZE + px) * 4;
                buffer[pIdx] = Math.min(255, r * brightness);
                buffer[pIdx+1] = Math.min(255, g * brightness);
                buffer[pIdx+2] = Math.min(255, b * brightness);
                buffer[pIdx+3] = Math.floor(a * 255);
            }
        }

        const outDir = path.join(TILES_DIR, "0", tileX.toString());
        await fs.ensureDir(outDir);
        const outPath = path.join(outDir, `${tileY}.png`);
        
        await sharp(buffer, { raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 } })
            .png({ compressionLevel: 6 })
            .toFile(outPath);

        return outPath;
    }

    // 画像合成 (Zoom -1 以降用)
    async generateCompositeTile(targetZoom, tileX, tileY) {
        const srcZoom = targetZoom + 1;
        const srcX = tileX * 2;
        const srcY = tileY * 2;

        const srcImages = [];
        let hasSource = false;

        const offsets = [
            { dx: 0, dy: 0, left: 0, top: 0 },
            { dx: 1, dy: 0, left: TILE_SIZE/2, top: 0 },
            { dx: 0, dy: 1, left: 0, top: TILE_SIZE/2 },
            { dx: 1, dy: 1, left: TILE_SIZE/2, top: TILE_SIZE/2 }
        ];

        for (const pos of offsets) {
            const sx = srcX + pos.dx;
            const sy = srcY + pos.dy;
            const pathStr = path.join(TILES_DIR, srcZoom.toString(), sx.toString(), `${sy}.png`);
            
            let buffer = null;
            try {
                if (await fs.pathExists(pathStr)) {
                    buffer = await fs.readFile(pathStr);
                } else {
                    const generatedPath = await this.generateAndCacheTile(srcZoom, sx, sy);
                    if (generatedPath) {
                        buffer = await fs.readFile(generatedPath);
                    }
                }
            } catch(e) {}

            if (buffer) {
                hasSource = true;
                const resizedBuffer = await sharp(buffer)
                    .resize(TILE_SIZE / 2, TILE_SIZE / 2, { kernel: 'lanczos3' })
                    .toBuffer();
                
                srcImages.push({ input: resizedBuffer, left: pos.left, top: pos.top });
            }
        }

        if (!hasSource) return null;

        let composite = sharp({
            create: {
                width: TILE_SIZE, height: TILE_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        });

        const outDir = path.join(TILES_DIR, targetZoom.toString(), tileX.toString());
        await fs.ensureDir(outDir);
        const outPath = path.join(outDir, `${tileY}.png`);

        await composite.composite(srcImages).png({ compressionLevel: 6 }).toFile(outPath);
        return outPath;
    }

    async generateAndCacheTile(zoom, x, y) {
        if (zoom === 0) {
            return await this.generateFromDB(x, y);
        } else if (zoom < 0) {
            return await this.generateCompositeTile(zoom, x, y);
        }
        return null;
    }
}

module.exports = TileGenerator;