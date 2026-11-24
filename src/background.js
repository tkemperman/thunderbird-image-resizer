import { ResizeController } from "./controller.js";

const controller = new ResizeController(browser);
browser.imageResizeUI.onChange.addListener((tabId, value) => {
  if (value === "refresh") void controller.refresh(tabId);
  else void controller.select(tabId, value);
});
browser.compose.onAttachmentAdded.addListener(tab => { void controller.refresh(tab.id); });
browser.compose.onAttachmentRemoved.addListener(tab => { void controller.refresh(tab.id); });
browser.compose.onBeforeSend.addListener(tab => controller.beforeSend(tab));
browser.tabs.onRemoved.addListener(id => controller.tabRemoved(id));
await browser.imageResizeUI.init({
  size: browser.i18n.getMessage("sizeLabel"),
  total: browser.i18n.getMessage("totalLabel"),
  calculating: browser.i18n.getMessage("calculating"),
  unchanged: browser.i18n.getMessage("unchanged", "$1"),
  tooltip: browser.i18n.getMessage("sizeTooltip"),
  updateFailed: browser.i18n.getMessage("updateFailed"),
  restoreFailed: browser.i18n.getMessage("restoreFailed"),
  retry: browser.i18n.getMessage("retry"),
  locale: "en-US",
  largeWarning: browser.i18n.getMessage("largeWarning"),
  largeTitle: browser.i18n.getMessage("largeTitle"),
  largeMessage: browser.i18n.getMessage("largeMessage", "$1"),
  continueSending: browser.i18n.getMessage("continueSending"),
  goBack: browser.i18n.getMessage("goBack"),
});
