import test from "node:test";
import assert from "node:assert/strict";
import { ResizeController } from "../src/controller.js";

function setup({ resize } = {}) {
  const files = new Map([
    [1, new File([new Uint8Array(1200)], "one.jpg", { type: "image/jpeg" })],
    [2, new File([new Uint8Array(1200)], "two.jpg", { type: "image/jpeg" })],
    [99, new File(["document"], "note.txt", { type: "text/plain" })],
  ]);
  const original = new Map(files);
  const updates = [];
  const views = [];
  const api = {
    compose: {
      listAttachments: async () => [...files].map(([id, file]) => ({ id, name: file.name, size: file.size })),
      getAttachmentFile: async id => files.get(id),
      updateAttachment: async (_, id, { file }) => { updates.push(id); files.set(id, file); },
    },
    imageResizeUI: {
      setState: async (id, state) => { views.push({ id, ...state }); },
      listInlineImages: async () => [],
    },
  };
  let resizeCalls = 0;
  const controller = new ResizeController(api, resize || (async file => {
    resizeCalls++;
    return { files: { original: file, small: new File([new Uint8Array(100)], file.name), medium: new File([new Uint8Array(300)], file.name), large: new File([new Uint8Array(700)], file.name) } };
  }));
  return { controller, api, files, original, updates, views, resizeCalls: () => resizeCalls };
}

test("starts at Original size and shows total image bytes only", async () => {
  const { controller, views, updates } = setup();
  await controller.refresh(4);
  assert.equal(views.at(-1).selected, "original");
  assert.equal(views.at(-1).total, 2400);
  assert.equal(views.at(-1).count, 2);
  assert.equal(views.at(-1).ready, true);
  assert.equal(updates.length, 0);
});

test("selection immediately changes all images and their total, preserving documents", async () => {
  const { controller, files, original, views } = setup();
  await controller.select(4, "medium");
  assert.equal(files.get(1).size, 300);
  assert.equal(files.get(2).size, 300);
  assert.equal(files.get(99), original.get(99));
  assert.equal(views.at(-1).total, 600);
});

test("switching sizes always uses cached originals and restores them byte for byte", async () => {
  const { controller, files, original, resizeCalls } = setup();
  await controller.select(4, "small");
  await controller.select(4, "large");
  assert.equal(files.get(1).size, 700);
  await controller.select(4, "original");
  assert.deepEqual(files, original);
  assert.equal(resizeCalls(), 2);
});

test("new image attachments inherit the selected size", async () => {
  const { controller, files, views } = setup();
  await controller.select(4, "medium");
  files.set(3, new File([new Uint8Array(2000)], "three.png", { type: "image/png" }));
  await controller.refresh(4);
  assert.equal(files.get(3).size, 300);
  assert.equal(views.at(-1).total, 900);
});

test("removing images updates the total and hides the bar after the last image", async () => {
  const { controller, files, views } = setup();
  await controller.select(4, "small");
  files.delete(1);
  await controller.refresh(4);
  assert.equal(views.at(-1).total, 100);
  files.delete(2);
  await controller.refresh(4);
  assert.equal(views.at(-1).visible, false);
  assert.equal(controller.getState(4).entries.size, 0);
});

test("sending waits for the chosen size and opens no dialog", async () => {
  const { controller, files } = setup();
  const selection = controller.select(4, "large");
  const sending = controller.beforeSend({ id: 4 });
  await selection;
  assert.deepEqual(await sending, {});
  assert.equal(files.get(1).size, 700);
});

test("rapid selection changes settle on the last selection", async () => {
  const { controller, files, views } = setup();
  await Promise.all([controller.select(4, "small"), controller.select(4, "large"), controller.select(4, "medium")]);
  assert.equal(files.get(1).size, 300);
  assert.equal(views.at(-1).selected, "medium");
  assert.equal(views.at(-1).total, 600);
});

test("a partially failed update restores originals and displays an inline error", async () => {
  const { controller, api, files, original, views } = setup();
  const update = api.compose.updateAttachment;
  api.compose.updateAttachment = async (...args) => {
    await update(...args);
    if (args[1] === 2 && args[2].file.size === 100) throw new Error("provider failure");
  };
  await controller.select(4, "small");
  assert.deepEqual(files, original);
  assert.equal(views.at(-1).selected, "original");
  assert.equal(views.at(-1).error, "updateFailed");
});

test("a read failure cancels sending, with no popup", async () => {
  const { controller, api, views } = setup();
  api.compose.getAttachmentFile = async () => { throw new Error("missing file"); };
  assert.deepEqual(await controller.beforeSend({ id: 4 }), { cancel: true });
  assert.equal(views.at(-1).visible, true);
  assert.equal(views.at(-1).error, "updateFailed");
});

test("externally replaced attachments become new originals", async () => {
  const { controller, files } = setup();
  await controller.select(4, "small");
  const replacement = new File([new Uint8Array(2500)], "replacement.jpg", { type: "image/jpeg" });
  files.set(1, replacement);
  await controller.refresh(4);
  await controller.select(4, "original");
  assert.equal(files.get(1), replacement);
});

test("closing a compose tab releases original image data", async () => {
  const { controller } = setup();
  await controller.refresh(4);
  const state = controller.getState(4);
  controller.tabRemoved(4);
  assert.equal(state.closed, true);
  assert.equal(controller.states.size, 0);
});

test("unsupported images remain intact and are included in the displayed total", async () => {
  const { controller, files, views } = setup({ resize: async file => ({ files: { original: file, small: file, medium: file, large: file } }) });
  await controller.select(4, "small");
  assert.equal(files.get(1).size, 1200);
  assert.equal(views.at(-1).total, 2400);
  assert.equal(views.at(-1).unchanged, 2);
});

test("failed rollback keeps originals available for recovery", async () => {
  const { controller, api, files, original, views } = setup();
  const update = api.compose.updateAttachment;
  api.compose.updateAttachment = async (...args) => {
    if (args[2].file.size === 1200) throw new Error("rollback blocked");
    await update(...args);
    if (args[1] === 2) throw new Error("partial mutation");
  };
  await controller.select(4, "small");
  assert.equal(views.at(-1).error, "restoreFailed");
  assert.equal(controller.getState(4).entries.get(2).original, original.get(2));
  api.compose.updateAttachment = update;
  await controller.select(4, "original");
  assert.deepEqual(files, original);
  assert.equal(views.at(-1).error, "");
});

test("closing during image preparation stops before writing attachments", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { controller, updates } = setup({ resize: async file => {
    await gate;
    return { files: { original: file, small: file, medium: file, large: file } };
  }});
  const selecting = controller.select(4, "small");
  await new Promise(resolve => setTimeout(resolve, 0));
  controller.tabRemoved(4);
  release();
  await selecting;
  assert.equal(updates.length, 0);
});

test("inline-only images show the bar, update their bytes and restore their original", async () => {
  const { controller, api, files, views } = setup({ resize: async file => ({
    files: { original: file, small: new File([new Uint8Array(10)], file.name, { type: "image/jpeg" }), medium: file, large: file },
    dimensions: { small: { width: 320, height: 200 } },
  }) });
  files.clear();
  const changes = [];
  api.imageResizeUI.listInlineImages = async () => [{ id: "inline-1", name: "image.jpg" }];
  api.imageResizeUI.getInlineImage = async () => ({ dataUrl: `data:image/jpeg;base64,${btoa("original image bytes")}` });
  api.imageResizeUI.updateInlineImage = async (_, id, data) => { changes.push({ id, ...data }); };
  await controller.select(4, "small");
  assert.equal(views.at(-1).visible, true);
  assert.equal(views.at(-1).total, 10);
  assert.equal(changes[0].width, 320);
  assert.equal(changes[0].height, 200);
  assert.equal(atob(changes[0].dataUrl.split(",")[1]).length, 10);
  await controller.select(4, "original");
  assert.equal(changes.at(-1).original, true);
  assert.equal(views.at(-1).total, 20);
  api.imageResizeUI.listInlineImages = async () => [];
  await controller.refresh(4);
  assert.equal(views.at(-1).visible, false);
});

test("the displayed total combines inline images and image attachments", async () => {
  const { controller, api, views } = setup();
  api.imageResizeUI.listInlineImages = async () => [{ id: "inline-1", name: "image.jpg" }];
  api.imageResizeUI.getInlineImage = async () => ({ dataUrl: `data:image/jpeg;base64,${btoa("original image bytes")}` });
  await controller.refresh(4);
  assert.equal(views.at(-1).count, 3);
  assert.equal(views.at(-1).total, 2420);
});

test("over 10 MB asks before sending; Go back cancels and Continue sending proceeds", async () => {
  const { controller, api, files } = setup({ resize: async file => ({ files: { original: file, small: file, medium: file, large: file } }) });
  files.clear();
  files.set(1, new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
  let confirmations = 0;
  api.imageResizeUI.confirmLargeImages = async (_, size) => { confirmations++; assert.equal(size, 10 * 1024 * 1024 + 1); return false; };
  assert.deepEqual(await controller.beforeSend({ id: 4 }), { cancel: true });
  assert.equal(confirmations, 1);
  api.imageResizeUI.confirmLargeImages = async () => true;
  assert.deepEqual(await controller.beforeSend({ id: 4 }), {});
});

test("exactly 10 MB does not prompt", async () => {
  const { controller, api, files } = setup({ resize: async file => ({ files: { original: file, small: file, medium: file, large: file } }) });
  files.clear();
  files.set(1, new File([new Uint8Array(10 * 1024 * 1024)], "image.png", { type: "image/png" }));
  api.imageResizeUI.confirmLargeImages = async () => { assert.fail("Unexpected confirmation"); };
  assert.deepEqual(await controller.beforeSend({ id: 4 }), {});
});

test("a failed size confirmation cancels sending", async () => {
  const { controller, api, files } = setup({ resize: async file => ({ files: { original: file, small: file, medium: file, large: file } }) });
  files.set(1, new File([new Uint8Array(11 * 1024 * 1024)], "image.png", { type: "image/png" }));
  api.imageResizeUI.confirmLargeImages = async () => { throw new Error("Window closed"); };
  assert.deepEqual(await controller.beforeSend({ id: 4 }), { cancel: true });
});
