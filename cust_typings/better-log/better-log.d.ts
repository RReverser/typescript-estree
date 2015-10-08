declare var betterLog: betterLog.betterLog;

declare module betterLog {
    export interface install {
        (newConfig: betterLogConfig): betterLog;
    }

    export interface betterLog extends Console {
        install(newConfig: betterLogConfig): betterLog;
        uninstall(): Console;
        setConfig(newConfig: betterLogConfig): betterLog;
    }

    export interface betterLogConfig {
        depth?: number;
        colors?: boolean;
        /* are there more options? */
    }
}
declare module "better-log" {
    export = betterLog;
}
