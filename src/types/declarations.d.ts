import 'discord.js';

declare module 'google-tts-api' {
    export interface GetAllAudioUrlsOptions {
        lang?: string;
        slow?: boolean;
        host?: string;
        timeout?: number;
        splitPunct?: string;
    }

    export interface AudioUrlItem {
        url: string;
        shortText: string;
    }

    export function getAllAudioUrls(text: string, options?: GetAllAudioUrlsOptions): AudioUrlItem[];
    export function getAudioUrl(text: string, options?: GetAllAudioUrlsOptions): string;
}

declare module 'fast-average-color-node' {
    export interface FastAverageColorResult {
        rgb: string;
        rgba: string;
        hex: string;
        hexa: string;
        isDark: boolean;
        isLight: boolean;
        value: [number, number, number, number];
        error?: Error;
    }

    export function getAverageColor(resource: string | Buffer, options?: any): Promise<FastAverageColorResult>;
}

declare module 'discord.js' {
    export enum MessageFlags {
        IsComponentsV2 = 32768
    }

    export class ContainerBuilder {
        constructor();
        setAccentColor(color: number): this;
        addTextDisplayComponents(...components: any[]): this;
        addSeparatorComponents(...components: any[]): this;
        addMediaGalleryComponents(...components: any[]): this;
        addActionRowComponents(...components: any[]): this;
        addSectionComponents(...components: any[]): this;
        toJSON(): any;
    }
    export class TextDisplayBuilder {
        constructor();
        setContent(content: string): this;
        toJSON(): any;
    }
    export class SeparatorBuilder {
        constructor();
        setSpacing(spacing: any): this;
        setDivider(divider: boolean): this;
        toJSON(): any;
    }
    export enum SeparatorSpacingSize {
        Small = 1,
        Medium = 2,
        Large = 3
    }
    export class MediaGalleryBuilder {
        constructor();
        addItems(...items: any[]): this;
        toJSON(): any;
    }
    export class MediaGalleryItemBuilder {
        constructor();
        setURL(url: string): this;
        toJSON(): any;
    }
    export class SectionBuilder {
        constructor();
        addTextDisplayComponents(...components: any[]): this;
        setThumbnailAccessory(accessory: any): this;
        setButtonAccessory?(accessory: any): this;
        toJSON(): any;
    }
    export class ThumbnailBuilder {
        constructor();
        setURL(url: string): this;
        toJSON(): any;
    }
}
