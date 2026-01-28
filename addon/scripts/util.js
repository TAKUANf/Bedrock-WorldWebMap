import { system } from "@minecraft/server";
import { Logger } from "./logger.js";
import { IgnoredBlocks, IgnoreFloatingBlocks, AquaticBlocks, SurfaceFeatureBlocks, TransparentDecorationBlocks } from "./config.js";

export function waitTicks(ticks) {
    return new Promise(resolve => {
        system.runTimeout(resolve, ticks);
    });
}

export function verifyChunksLoaded(dimension, from, to) {
    const midX = Math.floor((from.x + to.x) / 2);
    const midZ = Math.floor((from.z + to.z) / 2);
    try {
        const b = dimension.getBlock({ x: midX, y: dimension.heightRange.max - 1, z: midZ });
        return !!b;
    } catch (e) {
        return false;
    }
}

export function isSurfaceUpdate(dimension, block) {
    try {
        const x = block.x;
        const y = block.y;
        const z = block.z;

        const checkLimitY = Math.min(dimension.heightRange.max, Math.max(120, y + 20));

        let currentY = y + 1;

        while (currentY < checkLimitY) {
            const b = dimension.getBlock({ x, y: currentY, z });

            if (!b) return true;

            const id = b.typeId;

            if (IgnoredBlocks.has(id)) {
                currentY++;
                continue;
            }

            if (TransparentDecorationBlocks.has(id) || IgnoreFloatingBlocks.has(id)) {
                currentY++;
                continue;
            }

            return false;
        }

        return true;

    } catch (e) {
        return true;
    }
}

export function findSurfaceBlock(dimension, x, z) {
    try {
        let topmostBlock = dimension.getTopmostBlock({ x, z });
        if (!topmostBlock) return null;

        try {
            while (topmostBlock && TransparentDecorationBlocks.has(topmostBlock.typeId)) {
                const lowerY = topmostBlock.y - 1;
                if (lowerY < dimension.heightRange.min) break;

                const lowerBlock = dimension.getBlock({ x, y: lowerY, z });
                if (lowerBlock) {
                    topmostBlock = lowerBlock;
                } else {
                    break;
                }
            }
        } catch (e) { /* 無視 */ }

        try {
            let currentY = topmostBlock.y + 1;

            const scanLimitY = Math.min(dimension.heightRange.max, currentY + 20);

            while (currentY < scanLimitY) {
                const b = dimension.getBlock({ x, y: currentY, z });
                if (!b) break;
                const id = b.typeId;

                if (id === "minecraft:air" || id === "minecraft:void_air" || id === "minecraft:light_block") {
                    currentY++;
                    continue;
                }

                if (id.includes("leaves") || id.includes("vine") || id.includes("mangrove_roots") ||
                    id.includes("wart_block") || id.includes("shroomlight") ||
                    id.includes("snow") || id.includes("carpet") || id.includes("wool")) {

                    topmostBlock = b;
                }
                else if (!IgnoredBlocks.has(id) && !IgnoreFloatingBlocks.has(id) && !TransparentDecorationBlocks.has(id)) {
                    topmostBlock = b;
                }

                currentY++;
            }
        } catch (e) { }

        let hasWater = false;

        try {
            let currentY = topmostBlock.y + 1;
            const limitY = Math.min(dimension.heightRange.max, currentY + 30);

            while (currentY < limitY) {
                const b = dimension.getBlock({ x, y: currentY, z });
                if (!b) break;
                const id = b.typeId;

                if (id === "minecraft:air" || id === "minecraft:void_air") break;

                if (id.includes("water") || AquaticBlocks.has(id)) {
                    hasWater = true;
                }
                else if (TransparentDecorationBlocks.has(id)) {
                }
                else if (SurfaceFeatureBlocks.has(id) || !IgnoredBlocks.has(id)) {
                    topmostBlock = b;
                    hasWater = false;
                    break;
                }
                currentY++;
            }
        } catch (e) { }

        if (hasWater) {
            return { typeId: "minecraft:water", location: { x: topmostBlock.x, y: topmostBlock.y, z: topmostBlock.z } };
        }

        const typeId = topmostBlock.typeId;

        if (SurfaceFeatureBlocks.has(typeId) || typeId.includes("leaves") || typeId.includes("log") ||
            typeId.includes("wool") || typeId.includes("carpet") || typeId.includes("snow")) {
            return { typeId: typeId, location: { x: topmostBlock.x, y: topmostBlock.y, z: topmostBlock.z } };
        }

        if (IgnoreFloatingBlocks.has(typeId)) {
            let currentY = topmostBlock.y - 1;
            const limitY = Math.max(dimension.heightRange.min, currentY - 20);
            while (currentY > limitY) {
                const b = dimension.getBlock({ x, y: currentY, z });
                if (b && !b.isAir && !IgnoreFloatingBlocks.has(b.typeId) && !IgnoredBlocks.has(b.typeId)) {
                    topmostBlock = b;
                    break;
                }
                currentY--;
            }
        }

        return { typeId: topmostBlock.typeId, location: { x: topmostBlock.x, y: topmostBlock.y, z: topmostBlock.z } };

    } catch (e) {
        return null;
    }
}