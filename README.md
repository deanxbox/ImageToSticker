# ImageToSticker

A [Vencord](https://github.com/Vendicated/Vencord) userplugin that adds **Create Sticker** to the right-click menu of images and GIFs. It does what ExpressionCloner's *Clone Sticker* does, but for any image.

## Features

- **Create Sticker** appears when you right-click:
  - an image or GIF in a message (under *Copy Link*)
  - an image in the image viewer / lightbox (next to *Copy Image Link*)
- Pick a name, then click the server to create the sticker in.
- Only servers where you can create expressions and still have free sticker slots are listed.
- Discord-hosted media is resized through Discord's media proxy until it fits the 512 kB sticker limit.
- Videos are skipped (stickers cannot be video).
- Emoji and sticker right-clicks are left to ExpressionCloner.

## Limits

- Stickers must be PNG, APNG or GIF and at most 512 kB.
- Files from non-Discord hosts are uploaded as-is, so they must already meet those limits.
- Video links without a file extension may still show the menu item.

## Install

You need a [Vencord source install](https://docs.vencord.dev/installing/custom-plugins/).

```sh
cd src/userplugins
git clone https://github.com/deanxbox/ImageToSticker
cd ../..
pnpm build
```

Restart Discord, then enable **ImageToSticker** under Settings > Vencord > Plugins.

## License

GPL-3.0-or-later, the same as Vencord.