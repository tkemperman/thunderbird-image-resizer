# Thunderbird Add-ons listing

## Name

Image Resizer

## Summary

Resize inline images and attachments in Thunderbird, with a live total size and a warning for large images.

## Description

Choose **Original size**, **Small**, **Medium**, or **Large** directly above your email's message body.

Image Resizer updates inline images and image attachments immediately, while **Total** shows their combined size in KB or MB. The controls appear automatically when you add eligible images, including images inserted through **Insert → Image** or dragged into the message.

- Small: up to 320 pixels on the longest side.
- Medium: up to 640 pixels on the longest side.
- Large: up to 1280 pixels on the longest side.
- Original size: restore the original image bytes while the compose window remains open.

Images keep their aspect ratio and are never enlarged. Transparency and image orientation are preserved. Animated and unsupported formats remain unchanged.

When images exceed 10 MB, an inline warning suggests choosing a smaller size. Sending while still over the limit asks whether to **Go back** or **Continue sending**.

All image processing happens locally. The add-on does not collect analytics or use an external image-processing service. Its interface is in English.

The original-image cache lasts for the open compose window. Saved drafts contain the selected image sizes. After reopening a draft, reattach the original files if you need their earlier full resolution. Total excludes other attachments and is measured before email encoding.

## Reviewer notes

The add-on uses Manifest V2 and a bundled Experiment API because the standard compose APIs do not provide a native image-size selector or access to inline editor images.

The Experiment implementation is in `src/api/imageResizeUI/implementation.js`. It inserts the compose controls, observes image changes, reads eligible inline image contents, updates their sources and dimensions, and displays a confirmation when the total image size exceeds 10 MB. It removes its UI and listeners when unloaded. HTTP(S) images are excluded and blocked local/message images are not read.

The `compose` API handles attachment reads and replacements. `src/images.js` performs resizing with browser image decoding and canvas. There is no minified code, third-party JavaScript, or dependency installation step.

Run `npm run check` with Node.js 20+ and Python 3. This runs the tests and builds the XPI. `npm run build` packages the files from `src/` without transformation. The source archive also includes the build script, tests, documentation, and privacy statement, but no local test emails or screenshots.

The manifest targets Thunderbird 128–160, with `strict_max_version` set to `160.*` because the add-on includes an Experiment API. Live validation has been performed on Thunderbird 160 on Linux; compatibility with other versions still needs testing before making broader compatibility claims.

## Validator compatibility warnings

A Firefox-oriented validator may warn that the `compose` permission and `compose.onAttachmentAdded`, `compose.onAttachmentRemoved`, and `compose.onBeforeSend` are unsupported. These are documented Thunderbird APIs required by this Thunderbird-only add-on; see the [compose API reference](https://webextension-api.thunderbird.net/en/mv2/compose.html). Do not remove them to satisfy Firefox compatibility checks.

The manifest includes the finite `strict_max_version` required for Mail Experiments. Future Thunderbird major versions require compatibility testing and an updated maximum version.

## Submission materials

- XPI: `dist/image-resizer-1.0.3.xpi`
- Source: `dist/image-resizer-1.0.3-source.zip`
- Privacy statement: `PRIVACY.md`
- Add-on icon (64 × 64 PNG): `src/icons/image-resizer-64.png`
- Screenshot (1280 × 800 PNG): `distribution/images/compose-medium.png`
- Website: the public repository's home page.

Select **MIT License** in the submission form and choose the publisher display name. The full license is in `LICENSE`. No personal author or contact information is embedded in the package. These prepared materials have not been submitted to Thunderbird Add-ons.

## Screenshot caption

Resize inline images as you compose and see the combined image size instantly. The size selector offers Original size, Small, Medium, and Large.

The screenshot is an actual Thunderbird compose window captured through Marionette in an isolated demo profile. It uses fictional example.com addresses and a generated landscape illustration. It contains no personal email or account data.
