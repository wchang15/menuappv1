// lib/storage.js
import { get, set, del, clear } from "idb-keyval";

export const KEYS = {
  INTRO_VIDEO: "introVideoBlob",
  MENU_BG: "menuBackgroundBlob",
  MENU_LAYOUT: "menuLayoutJson",
};

export async function saveBlob(key, blob) {
  await set(key, blob);
}

export async function loadBlob(key) {
  return await get(key);
}

export async function saveJson(key, data) {
  await set(key, data);
}

export async function loadJson(key) {
  return await get(key);
}

export async function removeKey(key) {
  await del(key);
}

// ✅ 추가: 전체 초기화
export async function resetAll() {
  await clear(); // idb-keyval이 쓰는 IndexedDB 전체 삭제
}