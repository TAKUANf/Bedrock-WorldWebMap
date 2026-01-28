import { world } from "@minecraft/server";
import { Config } from "./config.js";

export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

let currentLevel = Config.DEBUG_MODE ? LogLevel.DEBUG : LogLevel.INFO;

export class Logger {
    static setLevel(levelStr) {
        if (typeof levelStr === 'number') {
            currentLevel = levelStr;
            return;
        }
        const key = levelStr.toUpperCase();
        if (LogLevel.hasOwnProperty(key)) {
            currentLevel = LogLevel[key];
            this.broadcast(`§e[Map] Log level set to: ${key}`);
        }
    }
    
    static getLevel() {
        return currentLevel;
    }

    static broadcast(msg) {
        console.warn(`[Map][BCAST] ${msg}`);
        if (Config.LOG_TO_CHAT) {
            try {
                world.sendMessage(`§b[Map] §r${msg}`);
            } catch (e) {}
        }
    }

    static debug(msg) {
        if (currentLevel <= LogLevel.DEBUG) console.warn(`[Map][DBG] ${msg}`);
    }

    static info(msg) {
        if (currentLevel <= LogLevel.INFO) console.warn(`[Map][INF] ${msg}`);
    }

    static warn(msg) {
        if (currentLevel <= LogLevel.WARN) console.warn(`[Map][WRN] ${msg}`);
    }

    static error(msg, errorObj = null) {
        if (currentLevel <= LogLevel.ERROR) {
            console.warn(`[Map][ERR] ${msg}`);
            if (errorObj) {
                if (errorObj.stack) console.warn(`[Stack] ${errorObj.stack}`);
                else console.warn(`[ErrorDetails] ${JSON.stringify(errorObj)}`);
            }
        }
    }
    
    // 計測用
    static time(label) {
        if (currentLevel <= LogLevel.DEBUG) console.warn(`[TimeStart] ${label}`);
    }
    
    static timeEnd(label) {
        if (currentLevel <= LogLevel.DEBUG) console.warn(`[TimeEnd] ${label}`);
    }
}