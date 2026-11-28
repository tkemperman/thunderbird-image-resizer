/* global ExtensionCommon, Services, ChromeUtils */
var imageResizeUI = class extends ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs").ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
    const { ExtensionSupport } = ChromeUtils.importESModule("resource:///modules/ExtensionSupport.sys.mjs");
    const listenerId = `${context.extension.id}:image-size`;
    const views = new Map();
    const listeners = new Set();
    let labels;
    let registered = false;
    const emit = (window, value) => {
      const tabId = context.extension.tabManager.convert(window).id;
      for (const fire of listeners) fire.async(tabId, value);
    };
    const attach = window => {
      if (views.has(window)) return views.get(window);
      const document = window.document;
      const editor = document.getElementById("messageEditor") || document.getElementById("content-frame");
      if (!editor) return null;
      const html = tag => document.createElementNS("http://www.w3.org/1999/xhtml", tag);
      const bar = html("div");
      bar.id = "image-resize-bar";
      bar.hidden = true;
      bar.style.cssText = "flex:0 0 auto; padding:5px 12px; border-bottom:1px solid var(--splitter-color, GrayText); color:inherit; background:var(--toolbar-bgcolor, Canvas); font:message-box;";
      const row = html("div");
      row.style.cssText = "display:none; align-items:center; flex-wrap:wrap; gap:6px 12px; min-height:24px;";
      const total = html("span");
      total.id = "image-resize-total";
      total.style.cssText = "font-variant-numeric:tabular-nums; white-space:nowrap;";
      total.setAttribute("role", "status");
      total.setAttribute("aria-live", "polite");
      total.title = labels.tooltip;
      const status = html("span");
      status.id = "image-resize-status";
      status.style.cssText = "opacity:.75; font-size:.9em;";
      const field = html("label");
      field.style.cssText = "display:flex; align-items:center; gap:8px; margin-inline-start:auto;";
      const text = html("span");
      text.textContent = labels.size;
      const select = html("select");
      select.id = "image-resize-select";
      select.setAttribute("disableonsend", "true");
      select.style.cssText = "font:inherit; padding:2px 6px; min-width:132px; color:inherit; background-color:var(--field-background-color, Field); border:1px solid var(--field-border-color, GrayText); border-radius:4px;";
      for (const [value, label] of [["original", "Original size"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"]]) {
        const option = html("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
      }
      const change = () => emit(window, select.value);
      select.addEventListener("change", change);
      field.append(text, select);
      row.append(total, status, field);
      const error = html("div");
      error.id = "image-resize-error";
      error.setAttribute("role", "alert");
      error.style.cssText = "padding:5px 0; color:var(--color-red-60, #cf3030);";
      error.hidden = true;
      const errorText = html("span");
      const retry = html("button");
      retry.textContent = labels.retry;
      retry.style.marginInlineStart = "8px";
      retry.setAttribute("disableonsend", "true");
      const retryChange = () => emit(window, "refresh");
      retry.addEventListener("click", retryChange);
      error.append(errorText, retry);
      const warning = html("div");
      warning.id = "image-resize-warning";
      warning.setAttribute("role", "status");
      warning.style.cssText = "padding:5px 0; color:var(--warning-color, #b77900);";
      warning.hidden = true;
      warning.textContent = labels.largeWarning;
      bar.append(row, warning, error);
      editor.before(bar);
      const view = { bar, row, select, total, status, error, errorText, retry, change, retryChange, warning,
        editor, images: new Map(), nodeIds: new WeakMap(), timer: null, observer: null, editorDocument: null };
      views.set(window, view);
      const refresh = () => {
        window.clearTimeout(view.timer);
        view.timer = window.setTimeout(() => emit(window, "refresh"), 100);
      };
      const watchEditor = () => {
        const doc = editor.contentDocument;
        if (!doc || doc === view.editorDocument) return;
        view.observer?.disconnect();
        view.editorDocument?.removeEventListener("load", view.imageLoaded, true);
        view.editorDocument = doc;
        view.observer = new window.MutationObserver(mutations => {
          const hasImage = node => node.nodeType === 1 && (node.localName === "img" || !!node.querySelector?.("img"));
          if (mutations.some(mutation => {
            if (mutation.type !== "attributes") return [...mutation.addedNodes, ...mutation.removedNodes].some(hasImage);
            if (mutation.target.localName !== "img") return false;
            const record = view.images.get(view.nodeIds.get(mutation.target));
            if (mutation.attributeName === "moz-do-not-send") {
              return mutation.target.getAttribute("moz-do-not-send") === "true" ? !!record : !record;
            }
            return record?.currentSrc !== mutation.target.getAttribute("src");
          })) refresh();
        });
        view.observer.observe(doc, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "moz-do-not-send"] });
        view.imageLoaded = event => {
          if (event.target.localName === "img" && !view.nodeIds.has(event.target)) refresh();
        };
        doc.addEventListener("load", view.imageLoaded, true);
        refresh();
      };
      view.watchEditor = watchEditor;
      editor.addEventListener("load", watchEditor, true);
      window.addEventListener("compose-editor-ready", watchEditor);
      watchEditor();
      return view;
    };
    const detach = window => {
      const view = views.get(window);
      if (!view) return;
      view.select.removeEventListener("change", view.change);
      view.retry.removeEventListener("click", view.retryChange);
      window.clearTimeout(view.timer);
      view.observer?.disconnect();
      view.editorDocument?.removeEventListener("load", view.imageLoaded, true);
      view.editor.removeEventListener("load", view.watchEditor, true);
      window.removeEventListener("compose-editor-ready", view.watchEditor);
      view.images.clear();
      view.bar.remove();
      views.delete(window);
    };
    const formatBytes = bytes => {
      const units = ["B", "KB", "MB", "GB"];
      let unit = 0;
      // Use Thunderbird's 1024-based convention so the total matches its list.
      while (bytes >= 1024 && unit < units.length - 1) { bytes /= 1024; unit++; }
      return `${new Intl.NumberFormat(labels.locale, { maximumFractionDigits: unit ? 1 : 0 }).format(bytes)} ${units[unit]}`;
    };
    const scanInline = window => {
      const view = attach(window);
      if (!view) return [];
      view.watchEditor();
      const document = view.editor.contentDocument;
      const liveIds = new Set();
      const images = [];
      for (const element of document?.querySelectorAll("img[src]") || []) {
        const src = element.getAttribute("src");
        // Do not fetch web-hosted images or turn a linked image into an attachment.
        if (!/^(data:image\/|file:|blob:|mailbox:|imap:|imaps:)/i.test(src) || element.getAttribute("moz-do-not-send") === "true") continue;
        // Respect Thunderbird's blocked-content boundary. Local/message URLs are
        // eligible only after Thunderbird has already allowed and decoded them.
        if (/^(file:|mailbox:|imap:|imaps:)/i.test(src) && !element.naturalWidth) continue;
        let id = view.nodeIds.get(element);
        let record = view.images.get(id);
        if (!record || record.currentSrc !== src) {
          id = `inline-${Services.uuid.generateUUID()}`;
          record = {
            element, originalSrc: src, currentSrc: src,
            attributes: Object.fromEntries(["width", "height", "style", "moz-do-not-send"].map(name => [name, element.getAttribute(name)])),
            displayWidth: element.width || 0, displayHeight: element.height || 0,
            name: element.getAttribute("title") || "inline-image",
          };
          if (src.startsWith("file:")) {
            try { record.name = Services.io.newURI(src).QueryInterface(Ci.nsIFileURL).file.leafName; } catch { /* Keep the image title. */ }
          }
          view.images.set(id, record);
          view.nodeIds.set(element, id);
        }
        liveIds.add(id);
        images.push({ id, name: record.name });
      }
      for (const id of view.images.keys()) if (!liveIds.has(id)) view.images.delete(id);
      return images;
    };
    const inlineRecord = (tabId, id) => {
      const window = context.extension.tabManager.get(tabId).nativeTab;
      scanInline(window);
      const record = views.get(window)?.images.get(id);
      if (!record?.element.isConnected) throw new Error("Inline image was removed or replaced");
      return { window, record };
    };
    const asDataUrl = (bytes, type, window) => {
      const chunks = [];
      for (let start = 0; start < bytes.length; start += 32768) chunks.push(String.fromCharCode(...bytes.subarray(start, start + 32768)));
      return `data:${type};base64,${window.btoa(chunks.join(""))}`;
    };
    context.callOnClose({ close: () => {
      if (registered) ExtensionSupport.unregisterWindowListener(listenerId);
      for (const window of views.keys()) detach(window);
      listeners.clear();
    }});
    return { imageResizeUI: {
      onChange: new ExtensionCommon.EventManager({
        context, name: "imageResizeUI.onChange",
        register: fire => { listeners.add(fire); return () => listeners.delete(fire); },
      }).api(),
      async init(strings) {
        labels = strings;
        if (registered) return;
        registered = true;
        ExtensionSupport.registerWindowListener(listenerId, {
          chromeURLs: ["chrome://messenger/content/messengercompose/messengercompose.xhtml"],
          onLoadWindow(window) { attach(window); emit(window, "refresh"); },
          onUnloadWindow(window) { detach(window); },
        });
      },
      async setState(tabId, state) {
        const window = context.extension.tabManager.get(tabId).nativeTab;
        const view = attach(window);
        if (!view) return;
        view.bar.hidden = !state.visible;
        // An error can keep the bar visible even when no images were found.
        view.row.style.display = state.count > 0 ? "flex" : "none";
        view.select.value = state.selected;
        view.select.disabled = !!window.gWindowLocked;
        for (const option of view.select.options) option.disabled = option.value !== "original" && !state.ready;
        view.total.textContent = `${labels.total}: ${formatBytes(state.total)}`;
        view.status.textContent = state.busy ? labels.calculating : state.unchanged ? labels.unchanged.replace("$1", state.unchanged) : "";
        view.error.hidden = !state.error;
        view.errorText.textContent = labels[state.error] || "";
        view.retry.disabled = state.busy;
        view.bar.setAttribute("aria-busy", state.busy ? "true" : "false");
        view.warning.hidden = state.total <= 10 * 1024 * 1024;
      },
      async listInlineImages(tabId) {
        return scanInline(context.extension.tabManager.get(tabId).nativeTab);
      },
      async getInlineImage(tabId, id) {
        const { window, record } = inlineRecord(tabId, id);
        const src = record.originalSrc;
        if (src.startsWith("data:image/")) return { dataUrl: src };
        if (src.startsWith("file:")) {
          const file = Services.io.newURI(src).QueryInterface(Ci.nsIFileURL).file;
          const bytes = await IOUtils.read(file.path);
          let type;
          try { type = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService).getTypeFromFile(file); }
          catch { type = "application/octet-stream"; }
          return { dataUrl: asDataUrl(bytes, type, window) };
        }
        if (src.startsWith("blob:")) {
          const response = await record.element.ownerGlobal.fetch(src);
          const blob = await response.blob();
          return { dataUrl: asDataUrl(new Uint8Array(await blob.arrayBuffer()), blob.type, window) };
        }
        const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
        const channel = NetUtil.newChannel({ uri: src, loadUsingSystemPrincipal: true });
        return new Promise((resolve, reject) => {
          NetUtil.asyncFetch(channel, (stream, status) => {
            if (!Components.isSuccessCode(status)) { reject(new Error("Could not read embedded image")); return; }
            const data = NetUtil.readInputStreamToString(stream, stream.available());
            resolve({ dataUrl: `data:${channel.contentType || "application/octet-stream"};base64,${window.btoa(data)}` });
          });
        });
      },
      async updateInlineImage(tabId, id, data) {
        const { window, record } = inlineRecord(tabId, id);
        const image = record.element;
        if (!data.original && !/^data:image\/(jpeg|png|webp);base64,/.test(data.dataUrl)) throw new Error("Invalid inline image data");
        const src = data.original ? record.originalSrc : data.dataUrl;
        // Update the record before changing src so our observer ignores our own edit.
        record.currentSrc = src;
        const editor = window.GetCurrentEditor();
        editor.beginTransaction();
        try {
          editor.setAttribute(image, "src", src);
          if (data.original) {
            for (const [name, value] of Object.entries(record.attributes)) {
              if (value === null) editor.removeAttribute(image, name);
              else editor.setAttribute(image, name, value);
            }
          } else {
            const scale = Math.min(1, record.displayWidth ? record.displayWidth / data.width : 1, record.displayHeight ? record.displayHeight / data.height : 1);
            const width = Math.max(1, Math.round(data.width * scale));
            const height = Math.max(1, Math.round(data.height * scale));
            editor.setAttribute(image, "width", String(width));
            editor.setAttribute(image, "height", String(height));
            // Inline styles from Insert > Image must not override the new dimensions.
            const styled = image.cloneNode(false);
            for (const property of ["width", "height", "min-width", "min-height"]) styled.style.removeProperty(property);
            if (styled.style.cssText) editor.setAttribute(image, "style", styled.style.cssText);
            else editor.removeAttribute(image, "style");
            editor.setAttribute(image, "moz-do-not-send", "false");
          }
        } finally { editor.endTransaction(); }
      },
      async confirmLargeImages(tabId, bytes) {
        const window = context.extension.tabManager.get(tabId).nativeTab;
        const prompt = Services.prompt;
        const flags = prompt.BUTTON_POS_0 * prompt.BUTTON_TITLE_IS_STRING
          + prompt.BUTTON_POS_1 * prompt.BUTTON_TITLE_IS_STRING + prompt.BUTTON_POS_1_DEFAULT;
        const result = prompt.confirmEx(window, labels.largeTitle,
          labels.largeMessage.replace("$1", formatBytes(bytes)), flags,
          labels.continueSending, labels.goBack, null, null, {});
        return result === 0;
      },
    }};
  }

  onShutdown(isAppShutdown) {
    if (!isAppShutdown) Services.obs.notifyObservers(null, "startupcache-invalidate");
  }
};
