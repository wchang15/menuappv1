'use client';

import { supabase } from '@/lib/supabaseClient';

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

async function requestSignedUpload({ token, assetKey, filename, contentType, sizeBytes }) {
  const response = await fetch('/api/assets/presign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      assetKey,
      filename,
      contentType,
      sizeBytes,
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    throw new Error(errBody?.error || '업로드 URL 생성에 실패했습니다.');
  }

  return response.json();
}

async function requestSignedDownload({ token, assetKey }) {
  const response = await fetch('/api/assets/sign-download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assetKey }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    throw new Error(errBody?.error || '다운로드 URL 생성에 실패했습니다.');
  }

  return response.json();
}

export async function uploadAsset({ assetKey, file, contentType }) {
  if (!assetKey || !file) return null;

  const token = await getAccessToken();
  if (!token) {
    throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
  }

  try {
    const presign = await requestSignedUpload({
      token,
      assetKey,
      filename: file.name || assetKey,
      contentType: contentType || file.type || 'application/octet-stream',
      sizeBytes: file.size,
    });

    const uploadResponse = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType || file.type || 'application/octet-stream',
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error('파일 업로드에 실패했습니다.');
    }

    return presign.path;
  } catch (error) {
    const userId = await getUserId();
    if (!userId) throw error;

    const objectPath = `${userId}/${assetKey}`;
    const { error: uploadError } = await supabase.storage.from('assets').upload(objectPath, file, {
      contentType: contentType || file.type || 'application/octet-stream',
      upsert: true,
    });

    if (uploadError) {
      throw uploadError;
    }

    return objectPath;
  }
}

export async function uploadJsonAsset({ assetKey, data }) {
  if (!assetKey) return null;
  const file = new File([JSON.stringify(data ?? {})], `${assetKey}.json`, {
    type: 'application/json',
  });
  return uploadAsset({ assetKey, file, contentType: 'application/json' });
}

export async function downloadAssetBlob(assetKey) {
  if (!assetKey) return null;
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const signed = await requestSignedDownload({ token, assetKey });
    if (!signed?.signedUrl) return null;

    const response = await fetch(signed.signedUrl);
    if (!response.ok) return null;

    return response.blob();
  } catch (error) {
    console.error('Failed to sign download URL', error);
  }

  const userId = await getUserId();
  if (!userId) return null;

  const objectPath = `${userId}/${assetKey}`;
  const { data, error } = await supabase.storage.from('assets').download(objectPath);
  if (error) {
    console.error('Failed to download asset via storage client', error);
    return null;
  }
  return data || null;
}

export async function downloadJsonAsset(assetKey) {
  const blob = await downloadAssetBlob(assetKey);
  if (!blob) return null;

  try {
    const text = await blob.text();
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse JSON asset', error);
    return null;
  }
}
