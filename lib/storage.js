// lib/storage.js
import { get, set, del, clear } from "idb-keyval";
import { getCurrentUser } from "./session";

export const KEYS = {
  INTRO_VIDEO: "introVideoBlob",
  MENU_BG: "menuBackgroundBlob",
  MENU_LAYOUT: "menuLayoutJson",
};

function withUserScope(key) {
  const user = getCurrentUser();
  if (!user) return key;
  return `${user}__${key}`;
}

export async function saveBlob(key, blob) {
  await set(withUserScope(key), blob);
}

export async function loadBlob(key) {
  const scoped = withUserScope(key);
  const data = await get(scoped);
  if (data !== undefined && data !== null) return data;
  if (scoped !== key) {
    const fallback = await get(key);
    if (fallback !== undefined && fallback !== null) return fallback;
  }
  return data;
}

export async function saveJson(key, data) {
  await set(withUserScope(key), data);
}

export async function loadJson(key) {
  const scoped = withUserScope(key);
  const data = await get(scoped);
  if (data !== undefined && data !== null) return data;
  if (scoped !== key) {
    const fallback = await get(key);
    if (fallback !== undefined && fallback !== null) return fallback;
  }
  return data;
}

export async function removeKey(key) {
  await del(withUserScope(key));
}

// ✅ 추가: 전체 초기화
export async function resetAll() {
  await clear(); // idb-keyval이 쓰는 IndexedDB 전체 삭제
}