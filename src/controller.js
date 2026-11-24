import { PRESETS, isImage, createVariants } from "./images.js";

export class ResizeController {
  constructor(api, resize = createVariants) {
    this.api = api;
    this.resize = resize;
    this.states = new Map();
  }

  getState(tabId) {
    if (!this.states.has(tabId)) {
      this.states.set(tabId, {
        tabId, selected: "original", entries: new Map(), queue: Promise.resolve(),
        revision: 0, closed: false, busy: false, ready: false, error: null,
        count: 0, total: 0, originalTotal: 0, unchanged: 0,
      });
    }
    return this.states.get(tabId);
  }

  async publish(state) {
    if (state.closed) return;
    await this.api.imageResizeUI.setState(state.tabId, {
      selected: state.selected, visible: !!state.count || !!state.error,
      busy: state.busy, ready: state.ready, error: state.error || "",
      count: state.count, total: state.total, originalTotal: state.originalTotal,
      unchanged: state.unchanged,
    }).catch(() => {}); // The compose window may have just closed.
  }

  refresh(tabId) {
    const state = this.getState(tabId);
    const revision = ++state.revision;
    state.queue = state.queue.catch(() => {}).then(async () => {
      if (state.closed || revision !== state.revision) return;
      await this.reconcile(state, revision);
    });
    return state.queue;
  }

  select(tabId, preset) {
    if (!Object.hasOwn(PRESETS, preset)) return Promise.resolve();
    this.getState(tabId).selected = preset;
    return this.refresh(tabId);
  }

  async write(state, entry, file) {
    if (!entry.inline) {
      return this.api.compose.updateAttachment(state.tabId, entry.id, { file, name: entry.name });
    }
    if (file === entry.original) {
      return this.api.imageResizeUI.updateInlineImage(state.tabId, entry.id, { original: true, dataUrl: "", width: 0, height: 0 });
    }
    const key = Object.keys(entry.variants).find(key => entry.variants[key] === file);
    const dimensions = entry.dimensions[key];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunks = [];
    for (let start = 0; start < bytes.length; start += 32768) chunks.push(String.fromCharCode(...bytes.subarray(start, start + 32768)));
    const dataUrl = `data:${file.type};base64,${btoa(chunks.join(""))}`;
    return this.api.imageResizeUI.updateInlineImage(state.tabId, entry.id, { original: false, dataUrl, ...dimensions });
  }

  async reconcile(state, revision) {
    state.busy = true;
    state.error = null;
    const changed = [];
    let originalsRestored = false;
    try {
      const attachments = await this.api.compose.listAttachments(state.tabId);
      const inlineImages = await this.api.imageResizeUI.listInlineImages(state.tabId);
      attachments.push(...inlineImages.map(image => ({ ...image, inline: true, size: -1 })));
      const ids = new Set(attachments.map(attachment => attachment.id));
      for (const id of state.entries.keys()) if (!ids.has(id)) state.entries.delete(id);
      const images = [];
      for (const attachment of attachments) {
        let entry = state.entries.get(attachment.id);
        // Reuse our original while the live attachment still matches our last update.
        // A replacement by another add-on becomes a new original.
        if (entry && !entry.uncertain && attachment.size >= 0 && attachment.size !== entry.current.size) {
          state.entries.delete(attachment.id);
          entry = null;
        }
        if (!entry) {
          let file;
          if (attachment.inline) {
            const data = await this.api.imageResizeUI.getInlineImage(state.tabId, attachment.id);
            const blob = await (await fetch(data.dataUrl)).blob();
            file = new File([blob], attachment.name, { type: blob.type });
          } else file = await this.api.compose.getAttachmentFile(attachment.id);
          if (!isImage(file, attachment.name)) continue;
          entry = { id: attachment.id, inline: !!attachment.inline, name: attachment.name, original: file, current: file, variants: null };
          state.entries.set(attachment.id, entry);
        }
        entry.name = attachment.name;
        images.push(entry);
      }
      state.count = images.length;
      state.originalTotal = images.reduce((sum, entry) => sum + entry.original.size, 0);
      state.total = images.reduce((sum, entry) => sum + entry.current.size, 0);
      state.ready = images.every(entry => entry.variants);
      await this.publish(state);
      for (const entry of images) {
        if (state.closed || revision !== state.revision) return;
        if (!entry.variants) {
          const result = await this.resize(entry.original, entry.name, () => state.closed || revision !== state.revision);
          if (state.closed || revision !== state.revision) return;
          entry.variants = result.files;
          entry.dimensions = result.dimensions;
          entry.failed = !!result.failed;
        }
      }
      if (state.closed || revision !== state.revision) return;
      state.ready = true;
      const selected = state.selected;
      for (const entry of images) {
        const next = entry.variants[selected];
        if (next === entry.current && !entry.uncertain) continue;
        // Keep the previous bytes for transactional rollback, and the full original
        // for switching back even after multiple Small/Medium/Large selections.
        changed.push({ entry, previous: entry.current });
        entry.uncertain = true;
        await this.write(state, entry, next);
        entry.current = next;
        entry.uncertain = false;
      }
      state.total = images.reduce((sum, entry) => sum + entry.current.size, 0);
      state.unchanged = selected === "original" ? 0 : images.filter(entry => entry.current === entry.original).length;
    } catch (error) {
      console.error("Image Resizer: updating attachments failed", error);
      state.error = "updateFailed";
      let rollbackFailed = false;
      for (const { entry, previous } of changed.reverse()) {
        try {
          await this.write(state, entry, previous);
          entry.current = previous;
          entry.uncertain = false;
        } catch { rollbackFailed = true; }
      }
      // Restore full-quality originals after a failed change so the selector and
      // the attachment contents cannot silently disagree.
      if (!rollbackFailed) {
        originalsRestored = true;
        for (const entry of state.entries.values()) {
          if (entry.current === entry.original && !entry.uncertain) continue;
          try {
            await this.write(state, entry, entry.original);
            entry.current = entry.original;
            entry.uncertain = false;
          } catch { originalsRestored = false; }
        }
      }
      if (originalsRestored) state.selected = "original";
      else state.error = "restoreFailed";
      state.total = [...state.entries.values()].reduce((sum, entry) => sum + entry.current.size, 0);
    } finally {
      state.busy = false;
      await this.publish(state);
    }
  }

  async beforeSend(tab) {
    const state = this.getState(tab.id);
    if (state.sending) return { cancel: true };
    state.sending = true;
    try {
      // The UI has already applied the choice. Wait for in-flight work and check
      // newly inserted images before allowing Thunderbird to continue sending.
      await this.refresh(tab.id);
      let pending;
      do {
        pending = state.queue;
        await pending;
      } while (pending !== state.queue);
      if (state.closed || state.error) return { cancel: true };
      if (state.total > 10 * 1024 * 1024) {
        const proceed = await this.api.imageResizeUI.confirmLargeImages(tab.id, state.total);
        if (!proceed) return { cancel: true };
      }
      return {};
    } catch (error) {
      console.error("Image Resizer: send check failed", error);
      state.error = "updateFailed";
      await this.publish(state);
      return { cancel: true };
    } finally {
      state.sending = false;
    }
  }

  tabRemoved(tabId) {
    const state = this.states.get(tabId);
    if (state) state.closed = true;
    this.states.delete(tabId);
  }
}
