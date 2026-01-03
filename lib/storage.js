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
  if (!user) return { key, user: null };
  return { key: `${user}__${key}`, user };
}

export async function saveBlob(key, blob) {
  const { key: scopedKey } = withUserScope(key);
  await set(scopedKey, blob);
}

export async function loadBlob(key) {
  const { key: scopedKey, user } = withUserScope(key);
  const data = await get(scopedKey);
  if (data !== undefined && data !== null) return data;

  // 이전(전역) 데이터가 있다면 현재 사용자 명의로 1회만 이동
  if (user && scopedKey !== key) {
    const fallback = await get(key);
    if (fallback !== undefined && fallback !== null) {
      await set(scopedKey, fallback);
      await del(key);
      return fallback;
    }
  }

  return data;
}

export async function saveJson(key, data) {
  const { key: scopedKey } = withUserScope(key);
  await set(scopedKey, data);
}

export async function loadJson(key) {
  const { key: scopedKey, user } = withUserScope(key);
  const data = await get(scopedKey);
  if (data !== undefined && data !== null) return data;

  // 이전(전역) JSON이 있다면 현재 사용자 명의로 1회만 이동
  if (user && scopedKey !== key) {
    const fallback = await get(key);
    if (fallback !== undefined && fallback !== null) {
      await set(scopedKey, fallback);
      await del(key);
      return fallback;
    }
  }

  return data;
}

export async function removeKey(key) {
  const { key: scopedKey } = withUserScope(key);
  await del(scopedKey);
}

// ✅ 추가: 전체 초기화
export async function resetAll() {
  await clear(); // idb-keyval이 쓰는 IndexedDB 전체 삭제
}