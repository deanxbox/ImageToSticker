/*
 * Vencord, a modification for Discord's desktop app
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { BaseText } from "@components/BaseText";
import { CheckedTextInput } from "@components/CheckedTextInput";
import { PlusIcon } from "@components/Icons";
import { getGuildAcronym } from "@utils/discord";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { Guild } from "@vencord/discord-types";
import { Constants, FluxDispatcher, Forms, GuildStore, IconUtils, Menu, Modal, openModal, PermissionsBits, PermissionStore, React, RestAPI, showToast, StickersStore, Tooltip, UserStore } from "@webpack/common";

const MAX_BYTES = 512 * 1024;
const SLOTS = { 0: 5, 1: 15, 2: 30, 3: 60 } as const;
const logger = new Logger("ImageToSticker");

const slotsFor = (g: Guild) => g.features.has("MORE_STICKERS") && g.premiumTier === 3 ? 120 : SLOTS[g.premiumTier] ?? 5;

function guildCandidates() {
    const me = UserStore.getCurrentUser().id;
    return Object.values(GuildStore.getGuilds()).filter(g => {
        const can = g.ownerId === me || (PermissionStore.getGuildPermissions({ id: g.id }) & PermissionsBits.CREATE_GUILD_EXPRESSIONS) === PermissionsBits.CREATE_GUILD_EXPRESSIONS;
        return can && (StickersStore.getStickersByGuildId(g.id)?.length ?? 0) < slotsFor(g);
    }).sort((a, b) => a.name.localeCompare(b.name));
}

const isDiscordMedia = (u: URL) => /^(cdn\.discordapp\.com|media\.discordapp\.net)$/.test(u.hostname);
const isVideo = (u: URL) => /\.(mp4|webm|mov|mkv)$/i.test(u.pathname);

// Sticker uploads only accept PNG/APNG/GIF <= 512kB. Discord's media proxy can convert/shrink; other hosts are fetched as-is.
async function fetchStickerBlob(src: string) {
    const u = new URL(src);
    const isGif = u.pathname.toLowerCase().endsWith(".gif");
    if (!isDiscordMedia(u)) {
        const blob = await (await fetch(src)).blob();
        if (!/^image\/(png|apng|gif)$/.test(blob.type)) throw new Error("Only PNG, APNG and GIF can be used as stickers");
        if (blob.size > MAX_BYTES) throw new Error("File is over 512kB");
        return blob;
    }
    u.hostname = "media.discordapp.net";
    for (let size = 320; size >= 40; size = Math.floor(size / 1.5)) {
        u.searchParams.set("format", isGif ? "gif" : "png");
        u.searchParams.set("width", String(size));
        u.searchParams.set("height", String(size));
        u.searchParams.set("animated", String(isGif));
        const res = await fetch(u);
        if (!res.ok) throw new Error("Failed to fetch " + u + " - " + res.status);
        const blob = await res.blob();
        if (blob.size <= MAX_BYTES) return blob;
    }
    throw new Error("Could not shrink image under 512kB");
}

async function createSticker(guildId: string, name: string, src: string) {
    const data = new FormData();
    data.append("name", name);
    data.append("tags", name);
    data.append("description", "");
    const blob = await fetchStickerBlob(src);
    data.append("file", blob, name + (blob.type === "image/gif" ? ".gif" : ".png"));

    const { body } = await RestAPI.post({ url: Constants.Endpoints.GUILD_STICKER_PACKS(guildId), body: data });
    FluxDispatcher.dispatch({
        type: "GUILD_STICKERS_CREATE_SUCCESS",
        guildId,
        sticker: { ...body, user: UserStore.getCurrentUser() }
    });
}

function StickerModal({ src, defaultName }: { src: string; defaultName: string; }) {
    const [busy, setBusy] = React.useState(false);
    const [name, setName] = React.useState(defaultName);
    const [x, refresh] = React.useReducer(n => n + 1, 0);
    const guilds = React.useMemo(guildCandidates, [x]);
    const valid = name.length >= 2 && name.length <= 30;

    const create = async (g: Guild) => {
        setBusy(true);
        try {
            await createSticker(g.id, name, src);
            showToast({ text: "Created sticker " + name + " in " + g.name + "!", variant: "success" });
        } catch (e: any) {
            let message = e?.message ?? "Something went wrong (check console!)";
            try { message = JSON.parse(e.text).message; } catch { }
            logger.error("Failed to create sticker", e);
            showToast({ text: "Failed to create sticker: " + message, variant: "critical" });
        } finally {
            refresh();
            setBusy(false);
        }
    };

    return (
        <>
            <Forms.FormTitle>Sticker Name</Forms.FormTitle>
            <CheckedTextInput initialValue={name} onChange={setName} validate={v => (v.length >= 2 && v.length <= 30) || "Name must be 2-30 characters"} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1em", padding: "1em 0.5em", justifyContent: "center" }}>
                {guilds.length === 0 && <Forms.FormText>No servers with permission and free sticker slots.</Forms.FormText>}
                {guilds.map(g => {
                    const disabled = busy || !valid;
                    return (
                        <Tooltip key={g.id} text={g.name}>
                            {({ onMouseLeave, onMouseEnter }) => (
                                <div
                                    onMouseLeave={onMouseLeave}
                                    onMouseEnter={onMouseEnter}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={"Create sticker in " + g.name}
                                    aria-disabled={disabled}
                                    style={{ borderRadius: "50%", background: "var(--background-base-lower)", display: "inline-flex", justifyContent: "center", alignItems: "center", width: "4em", height: "4em", cursor: disabled ? "not-allowed" : "pointer", filter: disabled ? "brightness(50%)" : "none" }}
                                    onClick={disabled ? void 0 : () => create(g)}
                                    onKeyDown={e => { if (!disabled && (e.key === "Enter" || e.key === " ")) create(g); }}
                                >
                                    {g.icon
                                        ? <img aria-hidden style={{ borderRadius: "50%", width: "100%", height: "100%" }} alt={g.name} src={IconUtils.getGuildIconURL({ id: g.id, icon: g.icon, canAnimate: true, size: 512 })} />
                                        : <Forms.FormText style={{ width: "100%", textAlign: "center", overflow: "hidden", whiteSpace: "nowrap" }}>{getGuildAcronym(g)}</Forms.FormText>}
                                </div>
                            )}
                        </Tooltip>
                    );
                })}
            </div>
        </>
    );
}

function addItem(children: any[], src: string | undefined, anchorId: string) {
    if (!src) return;

    let url: URL;
    try { url = new URL(src); } catch { return; }
    if (!/^https?:$/.test(url.protocol) || isVideo(url)) return;

    const base = decodeURIComponent(url.pathname.split("/").pop() ?? "").replace(/\.[^.]*$/, "").replace(/\W+/g, "_");
    const defaultName = (base || "sticker").slice(0, 30).padEnd(2, "_");

    const item = (
        <Menu.MenuItem
            id="vc-image-to-sticker"
            key="vc-image-to-sticker"
            label="Create Sticker"
            leadingAccessory={{ type: "icon", icon: PlusIcon }}
            action={() => openModal(props => (
                <Modal {...props} title={<BaseText tag="h3" size="md" weight="medium">Create Sticker</BaseText>}>
                    <StickerModal src={src} defaultName={defaultName} />
                </Modal>
            ))}
        />
    );
    (findGroupChildrenByChildId(anchorId, children) ?? children).push(item);
}

// emojis/stickers are handled by ExpressionCloner
const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props: Record<"favoriteableId" | "itemHref" | "itemSrc", string | undefined>) => {
    if (props?.favoriteableId) return;
    addItem(children, props?.itemHref ?? props?.itemSrc, "copy-link");
};

// right click on an image inside the image viewer/lightbox
const imageContextMenuPatch: NavContextMenuPatchCallback = (children, props: { src?: string; }) =>
    addItem(children, props?.src, "copy-native-link");

export default definePlugin({
    name: "ImageToSticker",
    description: "Right click an image or GIF to create a server sticker from it",
    tags: ["Servers", "Emotes"],
    authors: [{ name: ".dean.", id: 285021062578700289n }],
    contextMenus: { "message": messageContextMenuPatch, "image-context": imageContextMenuPatch }
});