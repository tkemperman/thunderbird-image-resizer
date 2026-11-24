# Image Resizer privacy statement

Image Resizer does not collect analytics, track users, or transmit personal information to its developer or to external image-processing services. It has no advertising, telemetry, or third-party service integrations.

The add-on reads images in the message being composed and processes them locally. This includes image attachments and eligible inline images. Original images and resized variants are held in memory while the compose window is open. Thunderbird may use temporary files for replacement attachments. The add-on does not overwrite original files on disk.

Embedded images already permitted by Thunderbird may be read through Thunderbird's existing message services. Web-hosted images are not downloaded by the add-on, and Thunderbird's blocked-content restrictions are respected.

When the user saves or sends a message, Thunderbird saves or sends the currently selected image contents through the user's configured mail account. The add-on does not send email independently.

The native image-size controls require a Thunderbird Experiment API. Thunderbird describes this as full, unrestricted access to Thunderbird and the computer. The API is used for the compose controls, inline-image access, and the large-image confirmation described in the README.
