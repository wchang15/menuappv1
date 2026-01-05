
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KEYS, loadBlob, saveBlob, loadJson, saveJson } from '@/lib/storage';
import { clearCurrentUser, getCurrentUser } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import CustomCanvas from './CustomCanvas';
import TemplateCanvas from './TemplateCanvas';

const DEFAULT_LAYOUT = { mode: null, templateId: null, items: [], templateData: null };

// ✅ 옵션들
const SECRET_TAPS = 5;
const TAP_WINDOW_MS = 2500;
const AUTO_HIDE_MS = 5000;
const LONG_PRESS_MS = 3000;

// ✅ 비밀번호(핀) 설정
const PIN_KEY = 'MENU_EDITOR_PIN_V1';
const DEFAULT_PIN = '0000';

// ✅ 언어
const LANG_KEY = 'APP_LANG_V1';

// ✅ “페이지” 단위(편집용)
const PAGE_HEIGHT = 2200;
const PAGE_GAP = 40;
const MIN_CONTENT_HEIGHT = PAGE_HEIGHT;

// ✅ TemplateCanvas와 페이지 계산 "완전 동일"하게 만들기 위한 상수
const DEFAULT_ROW_H = 92;
const DEFAULT_HEADER_H = 210;
const DEFAULT_PAGE_PADDING_TOP = 70;
const PAGE_WIDTH = 1080;

// ✅ T2 사진 슬롯과 동일
const MAX_PHOTOS = 8;

// ✅✅ 페이지별 배경 오버라이드 저장 키
const BG_OVERRIDES_KEY = 'MENU_BG_OVERRIDES_V1';
// 각 페이지 blob 키: `${KEYS.MENU_BG}__P${page}`
const bgPageKey = (page) => `${KEYS.MENU_BG}__P${page}`;

// ✅ 보기모드 페이지 전환 튜닝
const TURN_ANIM_MS = 320;
const WHEEL_THRESHOLD = 40;
const TOUCH_THRESHOLD = 55;

function clampNum(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function estimateRowH(style) {
  const ls = clampNum(style?.lineSpacing ?? 1.12, 0.9, 1.6);
  return Math.round(DEFAULT_ROW_H * (0.9 + (ls - 0.9) * 0.8));
}
function estimateHeaderH(style) {
  const ls = clampNum(style?.lineSpacing ?? 1.12, 0.9, 1.6);
  return Math.round(DEFAULT_HEADER_H * (0.95 + (ls - 0.9) * 0.35));
}

function normalizeTemplateDataForMeasure(templateId, data, lang) {
  if (!data) return { style: {}, rows: [], cells: [], columns: 2 };

  const baseStyle = {
    lineSpacing: 1.12,
    rowGap: 14,
  };
  const style = { ...baseStyle, ...(data.style || {}) };

  const group = (templateId || '').slice(0, 2);

  if (group === 'T1') {
    return { style, rows: Array.isArray(data.rows) ? data.rows : [] };
  }
  if (group === 'T2') {
    let photos = Array.isArray(data.photos)
      ? [...data.photos]
      : data.photoSrc
      ? [data.photoSrc]
      : [];
    while (photos.length < MAX_PHOTOS) photos.push(null);
    photos = photos.slice(0, MAX_PHOTOS);

    return { style, rows: Array.isArray(data.rows) ? data.rows : [], photos };
  }

  return {
    style,
    columns: clampNum(data.columns ?? 2, 2, 3),
    cells: Array.isArray(data.cells) ? data.cells : [],
  };
}

/**
 * ✅ template 페이지수 계산을 TemplateCanvas와 동일하게 맞춤.
 */
function computeTemplatePages(templateId, templateData, lang) {
  const id = templateId || '';
  const group = id.slice(0, 2); // T1/T2/T3
  const variant = id.slice(2, 3) || 'A';

  const td = normalizeTemplateDataForMeasure(id, templateData, lang);
  const style = td?.style || {};
  const headerH = estimateHeaderH(style);

  if (group === 'T1') {
    const rows = Array.isArray(td.rows) ? td.rows : [];
    const rowH = estimateRowH(style);

    const paddingTop = DEFAULT_PAGE_PADDING_TOP;
    const usableH = PAGE_HEIGHT - paddingTop - 80;

    const perPage = Math.max(
      1,
      Math.floor((usableH - headerH) / (rowH + (style.rowGap || 14)))
    );
    return Math.max(1, Math.ceil((rows.length || 0) / perPage) || 1);
  }

  if (group === 'T2') {
    const rows = Array.isArray(td.rows) ? td.rows : [];

    const paddingTop = 70;
    const usableH = PAGE_HEIGHT - paddingTop - 80;

    const ITEMS_PER_BLOCK = variant === 'B' ? 3 : 4;

    const targetBlocksPerPage = 3.5; // 3~4
    const available = Math.max(400, usableH - headerH - 24);
    const blockGap = variant === 'A' ? 18 : variant === 'B' ? 16 : 20;

    const blockH = Math.floor(
      (available - blockGap * (Math.ceil(targetBlocksPerPage) - 1)) / targetBlocksPerPage
    );
    const blocksPerPage = clampNum(
      Math.floor((available + blockGap) / (blockH + blockGap)),
      3,
      4
    );

    const blocks = Math.max(1, Math.ceil((rows.length || 0) / ITEMS_PER_BLOCK));
    return Math.max(1, Math.ceil(blocks / blocksPerPage));
  }

  // T3
  const cells = Array.isArray(td.cells) ? td.cells : [];
  const col = Math.max(2, Math.min(3, Number(td.columns) || 2));

  const paddingTop = 70;
  const usableH = PAGE_HEIGHT - paddingTop - 80;

  const cardH = variant === 'A' ? 172 : variant === 'B' ? 160 : 188;
  const gap = variant === 'A' ? 18 : variant === 'B' ? 14 : 22;

  const rowsPerPage = Math.max(1, Math.floor((usableH - headerH) / (cardH + gap)));
  const perPage = rowsPerPage * col;

  return Math.max(1, Math.ceil((cells.length || 0) / perPage) || 1);
}

function TemplatePicker({ onPick, lang }) {
  const title = lang === 'ko' ? '템플릿 선택' : 'Select template';

  const groups = [
    { id: 'T1', name: lang === 'ko' ? '리스트' : 'List', variants: ['A', 'B', 'C'] },
    { id: 'T2', name: lang === 'ko' ? '사진 + 리스트' : 'Photo + List', variants: ['A', 'B', 'C'] },
    { id: 'T3', name: lang === 'ko' ? '그리드' : 'Grid', variants: ['A', 'B', 'C'] },
  ];

  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>{title}</div>

      <div style={{ display: 'grid', gap: 12 }}>
        {groups.map((g) => (
          <div key={g.id} style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900, opacity: 0.85 }}>{g.name}</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {g.variants.map((v) => (
                <button key={v} style={tpBtn} onClick={() => onPick(`${g.id}${v}`)}>
                  {g.id}-{v}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        {lang === 'ko'
          ? '* 이후에도 템플릿 입력 패널에서 스타일/크기/색상 조절 가능'
          : '* You can still adjust style/size/colors in the template panel.'}
      </div>
    </div>
  );
}

const tpBtn = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #ddd',
  cursor: 'pointer',
  fontWeight: 800,
  background: '#fff',
};

export default function MenuEditor() {
  const router = useRouter();

  // ✅ 기본 배경(전체 페이지 default)
  const [bgBlob, setBgBlob] = useState(null);

  // ✅ 페이지별 오버라이드 배경 blobs: { [pageNumber]: Blob }
  const [bgOverrides, setBgOverrides] = useState({});

  const [layout, setLayout] = useState(DEFAULT_LAYOUT);

  const [userReady, setUserReady] = useState(false);
  const [userId, setUserId] = useState(null);

  // ✅ “편집 모드”
  const [edit, setEdit] = useState(false);

  // ✅ MenuEditor 미리보기(단 하나)
  const [preview, setPreview] = useState(false);

  const [showEditorMenu, setShowEditorMenu] = useState(false);

  const fileInputRef = useRef(null);
  const introVideoInputRef = useRef(null);
  const pageBgInputRef = useRef(null);

  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assetUploading, setAssetUploading] = useState(false);
  const [assetUploadMessage, setAssetUploadMessage] = useState('');

  // ✅ 보기모드에서만 잠깐 보이는 “수정 버튼” 상태
  const [showEditBtn, setShowEditBtn] = useState(false);

  // ---- 5탭 카운터용 refs
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef(null);

  // ---- 자동 숨김 타이머
  const autoHideRef = useRef(null);

  // ---- 길게 누르기 타이머
  const longPressRef = useRef(null);

  // ✅ stage 스크롤 ref
  const stageScrollRef = useRef(null);

  // ✅ 편집 방식 변경 모달
  const [editModeModalOpen, setEditModeModalOpen] = useState(false);

  // ✅ PIN 상태
  const [pin, setPin] = useState(DEFAULT_PIN);

  // ✅ PIN 입력 모달
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const pinStorageKey = useMemo(() => {
    return userId ? `${PIN_KEY}__${userId}` : PIN_KEY;
  }, [userId]);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.replace('/login');
      return;
    }
    setUserId(current);
    setUserReady(true);
  }, [router]);

  // ✅ 비밀번호 설정(변경) 모달
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [curPinInput, setCurPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');

  // ✅ 언어 상태
  const [lang, setLang] = useState('en');

  // ✅ 편집창 페이지 단위 보기
  const [pageView, setPageView] = useState(true);
  const [pageIndex, setPageIndex] = useState(1);

  // ✅ 템플릿 입력 패널 숨김/표시
  const [tplPanelOpen, setTplPanelOpen] = useState(true);

  // ✅ 페이지 배경 설정 모달
  const [pageBgModalOpen, setPageBgModalOpen] = useState(false);

  // ✅ viewport height (보기모드 scale용)
  const [vh, setVh] = useState(900);

  useEffect(() => {
    const update = () => {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;

      const heightCandidates = [
        vv?.height,
        window.innerHeight,
        window.screen?.height,
        window.screen?.availHeight,
      ]
        .map((v) => Number(v) || 0)
        .filter(Boolean);

      setVh(heightCandidates.length ? Math.max(...heightCandidates) : 900);
    };

    update();
    window.addEventListener('resize', update);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', update);

    return () => {
      window.removeEventListener('resize', update);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', update);
    };
  }, []);

  // ✅ (핵심) 스크롤을 확실히 0으로 리셋하는 함수
  const hardResetScrollTop = (behavior = 'auto') => {
    const sc = stageScrollRef.current;
    if (!sc) return;
    sc.scrollTo({ top: 0, behavior });
  };

  useEffect(() => {
    if (!userReady) return;
    (async () => {
      try {
        const bg = await loadBlob(KEYS.MENU_BG);
        const lay = (await loadJson(KEYS.MENU_LAYOUT)) || DEFAULT_LAYOUT;
        if (bg) setBgBlob(bg);

        const safeLay = {
          ...DEFAULT_LAYOUT,
          ...(lay || {}),
          templateData: lay?.templateData ?? null,
        };
        setLayout(safeLay);

        // ✅ 페이지별 배경 오버라이드 로드
        try {
          const overrides = (await loadJson(BG_OVERRIDES_KEY)) || {};
          const pages = Object.keys(overrides || {});
          const map = {};
          for (const p of pages) {
            const pn = Number(p);
            if (!Number.isFinite(pn) || pn < 1) continue;
            const blob = await loadBlob(bgPageKey(pn));
            if (blob) map[pn] = blob;
          }
          setBgOverrides(map);
        } catch {}

      // ✅ 로드 직후 스크롤 잔상 방지
      setTimeout(() => hardResetScrollTop('auto'), 0);
      } finally {
        setLoading(false);
      }
    })();

    // ✅ PIN 로드/초기화 (사용자별)
    try {
      const stored = localStorage.getItem(pinStorageKey);
      if (stored && typeof stored === 'string') {
        setPin(stored);
      } else {
        localStorage.setItem(pinStorageKey, DEFAULT_PIN);
        setPin(DEFAULT_PIN);
      }
    } catch {
      setPin(DEFAULT_PIN);
    }

    // ✅ 언어 로드
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === 'ko' || saved === 'en') setLang(saved);
    } catch {}
  }, [userReady, pinStorageKey]);

  // ✅ 보기 모드에서 텍스트 길게 눌러도 선택/터치 콜아웃이 뜨지 않도록 body 단위 차단
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const body = document.body;
    const html = document.documentElement;

    if (!body || !html) return;

    const prevBody = {
      userSelect: body.style.userSelect,
      webkitUserSelect: body.style.webkitUserSelect,
      webkitTouchCallout: body.style.webkitTouchCallout,
    };
    const prevHtml = {
      userSelect: html.style.userSelect,
      webkitUserSelect: html.style.webkitUserSelect,
      webkitTouchCallout: html.style.webkitTouchCallout,
    };

    if (!edit) {
      const applyNoSelect = (el) => {
        el.style.userSelect = 'none';
        el.style.webkitUserSelect = 'none';
        el.style.webkitTouchCallout = 'none';
      };

      applyNoSelect(body);
      applyNoSelect(html);
    } else {
      body.style.userSelect = prevBody.userSelect;
      body.style.webkitUserSelect = prevBody.webkitUserSelect;
      body.style.webkitTouchCallout = prevBody.webkitTouchCallout;

      html.style.userSelect = prevHtml.userSelect;
      html.style.webkitUserSelect = prevHtml.webkitUserSelect;
      html.style.webkitTouchCallout = prevHtml.webkitTouchCallout;
    }

    return () => {
      body.style.userSelect = prevBody.userSelect;
      body.style.webkitUserSelect = prevBody.webkitUserSelect;
      body.style.webkitTouchCallout = prevBody.webkitTouchCallout;

      html.style.userSelect = prevHtml.userSelect;
      html.style.webkitUserSelect = prevHtml.webkitUserSelect;
      html.style.webkitTouchCallout = prevHtml.webkitTouchCallout;
    };
  }, [edit]);

  // ✅ (백업) Shift+E 누르면 edit 버튼 강제 노출 (버튼만, 실제 편집은 PIN 필요)
  useEffect(() => {
    const onKey = (e) => {
      if (edit || preview) return;
      if (e.key?.toLowerCase() === 'e' && e.shiftKey) {
        revealEditButton();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, preview]);

  const setLanguage = (next) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {}
  };

  // ✅ 영상으로 돌아가기
  const goIntro = () => router.push('/intro');

  // ✅ 로그아웃 처리
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    clearCurrentUser();
    router.replace('/login');
  };

  // ✅ 기본 배경 URL
  const bgUrl = useMemo(() => {
    if (!bgBlob) return null;
    return URL.createObjectURL(bgBlob);
  }, [bgBlob]);

  // ✅ 페이지별 배경 URL map
  const bgOverrideUrls = useMemo(() => {
    const map = {};
    for (const [k, blob] of Object.entries(bgOverrides || {})) {
      if (blob) map[k] = URL.createObjectURL(blob);
    }
    return map;
  }, [bgOverrides]);

  // ✅ URL revoke cleanup
  useEffect(() => {
    return () => {
      if (bgUrl) URL.revokeObjectURL(bgUrl);
      for (const u of Object.values(bgOverrideUrls || {})) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      }
    };
  }, [bgUrl, bgOverrideUrls]);

  // ✅ 배경이 세팅되면 무조건 맨위로 (2페이지 잔상 방지)
  useEffect(() => {
    if (!bgUrl) return;
    setTimeout(() => hardResetScrollTop('auto'), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgUrl]);

  const uploadAssetToCloud = async (file) => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;

    if (!token) {
      throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    }

    setAssetUploading(true);
    setAssetUploadMessage('업로드 URL 생성 중...');

    try {
      const presignResponse = await fetch('/api/assets/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });

      if (!presignResponse.ok) {
        const errBody = await presignResponse.json().catch(() => null);
        throw new Error(errBody?.error || '업로드 URL 생성에 실패했습니다.');
      }

      const presign = await presignResponse.json();
      setAssetUploadMessage('스토리지에 업로드 중...');

      const uploadResponse = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('파일 업로드에 실패했습니다.');
      }

      setAssetUploadMessage('클라우드 업로드 완료!');
      return presign.path;
    } catch (error) {
      setAssetUploadMessage(error.message || '업로드 중 문제가 발생했습니다.');
      throw error;
    } finally {
      setAssetUploading(false);
    }
  };

  const uploadBg = async (file) => {
    if (!file) return;
    try {
      await uploadAssetToCloud(file);
    } catch (e) {
      console.error(e);
    }

    await saveBlob(KEYS.MENU_BG, file);
    setBgBlob(file);
    // ✅ 업로드 즉시 맨위로
    setTimeout(() => hardResetScrollTop('auto'), 0);
  };

  // ✅ 인트로 비디오 업로드
  const uploadIntroVideo = async (file) => {
    if (!file) return;

    try {
      await uploadAssetToCloud(file);
    } catch (e) {
      console.error(e);
    }

    await saveBlob(KEYS.INTRO_VIDEO, file);
    setAssetUploadMessage(
      lang === 'ko' ? '인트로 영상이 변경되었습니다.' : 'Intro video has been updated.'
    );

    if (introVideoInputRef.current) {
      introVideoInputRef.current.value = '';
    }
  };

  // ✅ 페이지 배경 업로드(현재 pageIndex)
  const uploadPageBg = async (file, pageNum) => {
    const p = Number(pageNum);
    if (!file || !Number.isFinite(p) || p < 1) return;

    try {
      await uploadAssetToCloud(file);
    } catch (e) {
      console.error(e);
    }

    await saveBlob(bgPageKey(p), file);
    setBgOverrides((prev) => ({ ...(prev || {}), [p]: file }));

    // overrides 인덱스 저장
    try {
      const nextIndex = { ...(await loadJson(BG_OVERRIDES_KEY)) };
      nextIndex[p] = true;
      await saveJson(BG_OVERRIDES_KEY, nextIndex);
    } catch {
      try {
        await saveJson(BG_OVERRIDES_KEY, { [p]: true });
      } catch {}
    }
  };

  // ✅ 페이지 배경 오버라이드 해제(기본 배경으로 돌아감)
  const clearPageBgOverride = async (pageNum) => {
    const p = Number(pageNum);
    if (!Number.isFinite(p) || p < 1) return;

    setBgOverrides((prev) => {
      const next = { ...(prev || {}) };
      delete next[p];
      return next;
    });

    try {
      const idx = (await loadJson(BG_OVERRIDES_KEY)) || {};
      const nextIdx = { ...(idx || {}) };
      delete nextIdx[p];
      await saveJson(BG_OVERRIDES_KEY, nextIdx);
    } catch {}
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadBg(file);
  };

  const openFilePicker = () => fileInputRef.current?.click();
  const openIntroVideoPicker = () => introVideoInputRef.current?.click();
  const openPageBgPicker = () => pageBgInputRef.current?.click();

  // ✅ 타이머 정리 + 보기모드에서 수정 버튼 숨김
  const hideEditButton = () => {
    if (autoHideRef.current) {
      clearTimeout(autoHideRef.current);
      autoHideRef.current = null;
    }
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    setShowEditBtn(false);
  };

  // ✅ 수정 버튼을 “보여주기”
  const revealEditButton = () => {
    if (edit) return;

    setShowEditBtn(true);

    if (autoHideRef.current) clearTimeout(autoHideRef.current);
    autoHideRef.current = setTimeout(() => {
      if (!edit) setShowEditBtn(false);
    }, AUTO_HIDE_MS);
  };

  // ✅ 5번 클릭 감지
  const onSecretCornerClick = () => {
    if (edit) return;

    if (!tapTimerRef.current) {
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
        tapTimerRef.current = null;
      }, TAP_WINDOW_MS);
    }

    tapCountRef.current += 1;

    if (tapCountRef.current >= SECRET_TAPS) {
      revealEditButton();
      tapCountRef.current = 0;
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  };

  // ✅ 길게 누르기 (3초)
  const startLongPress = (e) => {
    if (edit) return;
    e.preventDefault();

    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      revealEditButton();
      longPressRef.current = null;
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  // ✅ cleanup
  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (autoHideRef.current) clearTimeout(autoHideRef.current);
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };
  }, []);

  // ✅ “수정” 클릭 시: 비번 확인 후 edit 진입
  const requestEdit = () => {
    if (edit) return;
    setPinError('');
    setPinInput('');
    setPinModalOpen(true);
  };

  const submitPin = () => {
    if ((pinInput || '').trim() === pin) {
      setPinModalOpen(false);
      setEdit(true);
      setPreview(false);
      setPinInput('');
      setPinError('');
      // ✅ edit 진입 시 스크롤 맨위로
      setTimeout(() => hardResetScrollTop('auto'), 0);
      return;
    }
    setPinError(lang === 'ko' ? '비밀번호가 올바르지 않습니다.' : 'Incorrect PIN.');
  };

  // ✅ 비밀번호 변경
  const submitChangePin = () => {
    setSettingsError('');
    setSettingsMsg('');

    if ((curPinInput || '').trim() !== pin) {
      setSettingsError(lang === 'ko' ? '현재 비밀번호가 올바르지 않습니다.' : 'Current PIN is incorrect.');
      return;
    }
    const np = (newPinInput || '').trim();
    const cp = (newPinConfirm || '').trim();

    if (!/^\d{4}$/.test(np)) {
      setSettingsError(
        lang === 'ko'
          ? '새 비밀번호는 숫자 4자리(예: 1234)로 입력해 주세요.'
          : 'New PIN must be exactly 4 digits (e.g., 1234).'
      );
      return;
    }
    if (np !== cp) {
      setSettingsError(lang === 'ko' ? '새 비밀번호 확인이 일치하지 않습니다.' : 'New PIN confirmation does not match.');
      return;
    }

    try {
      localStorage.setItem(pinStorageKey, np);
    } catch {}
    setPin(np);
    setSettingsMsg(lang === 'ko' ? '비밀번호가 변경되었습니다.' : 'PIN has been updated.');
    setCurPinInput('');
    setNewPinInput('');
    setNewPinConfirm('');
  };

  const T = {
    ko: {
      pickBgTitle: '메뉴판 배경을 선택하세요',
      pickBgDesc1: '메뉴판에 깔릴 ',
      pickBgDesc2: '배경 이미지',
      pickBgDesc3: '를 업로드해 주세요.',
      pickBgDesc4: '업로드 후에는 배경이 자동 적용됩니다.',
      drop1: '여기로 이미지를 드래그해서 놓거나',
      drop2: '클릭해서 배경을 선택',
      drop3: '하세요',
      hint: '권장: JPG/PNG · 가로형(16:9)',
      keep: '* 배경은 브라우저에 저장되어 다음 실행에도 유지됩니다.',
      logout: '로그아웃',
      edit: '수정',
      changeBg: '배경(전체) 선택',
      introVideo: '인트로 비디오 변경',
      pageBg: '페이지 배경',
      pinSettings: '비밀번호 설정',
      editorMenu: '에디터 메뉴',
      pinEnterTitle: '비밀번호 입력',
      pinEnterDesc: '수정하려면 비밀번호(기본 0000)를 입력하세요.',
      confirm: '확인',
      cancel: '취소',
      close: '닫기',
      pinChange: '비밀번호 변경',
      curPin: '현재 비밀번호',
      newPin: '새 비밀번호(4자리 숫자)',
      newPin2: '새 비밀번호 확인',
      change: '변경',
      help: '우측 상단 모서리를 5번 클릭하거나 3초 길게 누르면 수정 버튼이 나타납니다. (5초 후 자동으로 숨김)\n*백업: Shift+E',
      backToVideo: '영상으로',
      editModePick: '수정 방식 선택',
      freeEdit: '자유 배치로 편집하기',
      templateBadge: '템플릿 모드: ',
      changeMode: '편집 방식 변경',

      pageView: '페이지 보기',
      continuous: '연속 보기',
      page: '페이지',
      prev: '이전',
      next: '다음',
      jump: '이동',

      preview: '미리보기',
      save: '저장',
      back: '뒤로가기',

      showTplPanel: '템플릿 입력 열기',

      // page bg modal
      pageBgTitle: '페이지별 배경 설정',
      currentPage: '현재 페이지',
      uploadThis: '이 페이지 배경 업로드',
      clearThis: '이 페이지 배경 해제(기본으로)',
      usingOverride: '이 페이지는 오버라이드 배경 사용 중',
      usingDefault: '이 페이지는 기본 배경 사용 중',
    },
    en: {
      pickBgTitle: 'Select a menu background',
      pickBgDesc1: 'Upload a ',
      pickBgDesc2: 'background image',
      pickBgDesc3: ' for the menu.',
      pickBgDesc4: 'It will apply automatically after upload.',
      drop1: 'Drag & drop an image here, or',
      drop2: 'click to choose a background',
      drop3: '',
      hint: 'Recommended: JPG/PNG · Landscape (16:9)',
      keep: '* Saved in your browser and will persist.',
      logout: 'Log out',
      edit: 'Edit',
      changeBg: 'Background (All Pages)',
      introVideo: 'Change intro video',
      pageBg: 'Page Background',
      pinSettings: 'PIN Settings',
      editorMenu: 'Editor Menu',
      pinEnterTitle: 'Enter PIN',
      pinEnterDesc: 'Enter your PIN (default 0000) to edit.',
      confirm: 'Confirm',
      cancel: 'Cancel',
      close: 'Close',
      pinChange: 'Change PIN',
      curPin: 'Current PIN',
      newPin: 'New PIN (4 digits)',
      newPin2: 'Confirm New PIN',
      change: 'Update',
      help: 'Tap the top-right corner 5 times or press & hold for 3 seconds to reveal the Edit button. (Auto hides in 5s)\n*Backup: Shift+E',
      backToVideo: 'Back to Video',
      editModePick: 'Choose edit mode',
      freeEdit: 'Edit with Free Layout',
      templateBadge: 'Template Mode: ',
      changeMode: 'Change Edit Mode',

      pageView: 'Page View',
      continuous: 'Continuous',
      page: 'Page',
      prev: 'Prev',
      next: 'Next',
      jump: 'Go',

      preview: 'Preview',
      save: 'Save',
      back: 'Back',

      showTplPanel: 'Show Template Input',

      pageBgTitle: 'Per-page Background',
      currentPage: 'Current page',
      uploadThis: 'Upload background for this page',
      clearThis: 'Clear this page override (use default)',
      usingOverride: 'This page is using an override background',
      usingDefault: 'This page is using the default background',
    },
  }[lang];

  const isOverlayOpen = pinModalOpen || settingsOpen || editModeModalOpen || pageBgModalOpen;

  useEffect(() => {
    if (!edit || preview || isOverlayOpen) {
      setShowEditorMenu(false);
    }
  }, [edit, preview, isOverlayOpen]);

  // ✅ 페이지 계산
  const computedPages = useMemo(() => {
    // ---------- TEMPLATE MODE ----------
    if (layout?.mode === 'template') {
      const tid = layout?.templateId || '';
      const td = normalizeTemplateDataForMeasure(tid, layout?.templateData, lang);

      const isEmpty = tid.startsWith('T1')
        ? (td?.rows?.length ?? 0) === 0
        : tid.startsWith('T2')
        ? (td?.rows?.length ?? 0) === 0
        : (td?.cells?.length ?? 0) === 0;

      if (isEmpty) return 1;

      const pages = computeTemplatePages(tid, layout?.templateData, lang);
      return Math.max(1, pages);
    }

    // ---------- CUSTOM MODE ----------
    const items = Array.isArray(layout?.items) ? layout.items : [];
    if (items.length === 0) return 1;

    let maxBottom = 0;
    for (const it of items) {
      const b = (it?.y || 0) + (it?.h || 0);
      if (b > maxBottom) maxBottom = b;
    }

    const needed = Math.max(MIN_CONTENT_HEIGHT, Math.ceil(maxBottom + 240));
    const unit = PAGE_HEIGHT + PAGE_GAP;
    const pages = Math.max(1, Math.ceil((needed + PAGE_GAP) / unit));
    return pages;
  }, [layout, lang]);

  const totalPages = useMemo(() => Math.max(1, Number(computedPages || 1)), [computedPages]);

  // ✅ 컨텐츠 높이
  const contentHeight = useMemo(() => {
    const pages = Math.max(1, Number(totalPages || 1));
    const base = pages * PAGE_HEIGHT + (pages - 1) * PAGE_GAP;

    // ✅ Custom 편집 중엔 1페이지 여유(드래그로 2페이지 생성 가능)
    const extra = edit && !preview && layout?.mode === 'custom' ? PAGE_HEIGHT : 0;

    return Math.max(MIN_CONTENT_HEIGHT, base + extra);
  }, [totalPages, edit, preview, layout?.mode]);

  const fullScrollHeight = useMemo(() => contentHeight, [contentHeight]);

  // ✅ 보기모드에서만: 한 화면=한 페이지 + 스와이프/휠 전환
  const pageTurnEnabled = useMemo(() => {
    return !!bgUrl && !edit && !preview && !isOverlayOpen;
  }, [bgUrl, edit, preview, isOverlayOpen]);

  // ✅ 보기모드 스케일(화면 높이에 맞추기) / 편집&미리보기는 1:1(크게)
  const viewScale = useMemo(() => {
    const s = (vh || 900) / PAGE_HEIGHT;
    return Math.max(0.25, Math.min(1, s));
  }, [vh]);

  const effectiveScale = useMemo(() => {
    return pageTurnEnabled ? viewScale : 1;
  }, [pageTurnEnabled, viewScale]);

  const viewTranslateY = useMemo(() => {
    return -((pageIndex - 1) * (PAGE_HEIGHT + PAGE_GAP) * effectiveScale);
  }, [pageIndex, effectiveScale]);

  const viewTranslateX = useMemo(() => {
    return -((pageIndex - 1) * (PAGE_WIDTH + PAGE_GAP) * effectiveScale);
  }, [pageIndex, effectiveScale]);

  // ✅ pageTurnEnabled 켜질 때: 스크롤 잔상 제거
  useEffect(() => {
    if (!pageTurnEnabled) return;
    hardResetScrollTop('auto');
  }, [pageTurnEnabled]);

  // ✅ totalPages가 줄었을 때 pageIndex 보정
  useEffect(() => {
    if (pageIndex > totalPages) setPageIndex(totalPages);
    if (pageIndex < 1) setPageIndex(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  // ✅ edit 상태 변화 시 초기화
  useEffect(() => {
    if (edit) {
      setPageView(true);
      setPageIndex(1);
      setPreview(false);
      setTplPanelOpen(true);
      setTimeout(() => hardResetScrollTop('auto'), 0);
    } else {
      setPreview(false);
      setTimeout(() => hardResetScrollTop('auto'), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit]);

  // ✅ edit에서 pageView 켰을 때 페이지 스크롤 이동(편집 전용)
  const scrollToPage = (pi) => {
    const sc = stageScrollRef.current;
    if (!sc) return;
    const idx = Math.min(Math.max(1, pi), totalPages);
    const top = (idx - 1) * (PAGE_HEIGHT + PAGE_GAP);
    sc.scrollTo({ top, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!edit) return;
    if (preview) return;
    if (!pageView) return;
    scrollToPage(pageIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, edit, pageView, preview]);

  const handleSaveAll = async () => {
    const next = { ...layout };
    setLayout(next);
    await saveJson(KEYS.MENU_LAYOUT, next);

    setPreview(false);
    setEdit(false);
    hideEditButton();
    setPageIndex(1);
    setTimeout(() => hardResetScrollTop('auto'), 0);
  };

  const handleExitPreview = () => setPreview(false);

  const getPageBgUrl = (pageNum) => {
    const overrideUrl = bgOverrideUrls?.[String(pageNum)] || bgOverrideUrls?.[pageNum];
    return overrideUrl || bgUrl;
  };

  // ✅✅ 배경 렌더: 페이지별 오버라이드가 있으면 그거, 없으면 default(bgUrl)
  const renderBgPages = () => {
    if (!bgUrl) return null;

    const pagesForBg = pageTurnEnabled ? totalPages : totalPages; // 동일, 구조만 명시
    return Array.from({ length: pagesForBg }).map((_, i) => {
      const pageNum = i + 1;
      const useUrl = getPageBgUrl(pageNum);

      const top = i * (PAGE_HEIGHT + PAGE_GAP);
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top,
            height: PAGE_HEIGHT,
            backgroundImage: `url(${useUrl})`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'top center',
            backgroundSize: '100% 100%',
            backgroundAttachment: 'scroll',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      );
    });
  };

  const hasOverrideThisPage = !!bgOverrides?.[pageIndex];

  // ✅ 보기모드 스와이프/휠 처리
  const wheelAccRef = useRef(0);
  const wheelLockRef = useRef(false);
  const touchRef = useRef({ x: 0, active: false });

  const goPrevPage = () => setPageIndex((p) => Math.max(1, p - 1));
  const goNextPage = () => setPageIndex((p) => Math.min(totalPages, p + 1));

  const onWheel = (e) => {
    if (!pageTurnEnabled) return;

    // 스크롤 막고, 페이지 전환만
    e.preventDefault();
    if (wheelLockRef.current) return;

    const primaryDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

    wheelAccRef.current += primaryDelta;

    if (Math.abs(wheelAccRef.current) >= WHEEL_THRESHOLD) {
      const dy = wheelAccRef.current;
      wheelAccRef.current = 0;

      if (dy > 0) goNextPage();
      else goPrevPage();

      wheelLockRef.current = true;
      setTimeout(() => {
        wheelLockRef.current = false;
      }, TURN_ANIM_MS + 30);
    }
  };

  const onTouchStart = (e) => {
    if (!pageTurnEnabled) return;
    const x = e.touches?.[0]?.clientX;
    if (typeof x !== 'number') return;
    touchRef.current = { x, active: true };
  };

  const onTouchMove = (e) => {
    if (!pageTurnEnabled) return;
    // 스크롤 막기
    e.preventDefault();
  };

  const onTouchEnd = (e) => {
    if (!pageTurnEnabled) return;
    if (!touchRef.current.active) return;

    const x2 = e.changedTouches?.[0]?.clientX;
    if (typeof x2 !== 'number') {
      touchRef.current = { x: 0, active: false };
      return;
    }

    const dx = x2 - touchRef.current.x;
    touchRef.current = { x: 0, active: false };

    if (Math.abs(dx) < TOUCH_THRESHOLD) return;

    // 오른쪽->왼쪽(dx<0) => 다음, 왼쪽->오른쪽(dx>0) => 이전
    if (dx < 0) goNextPage();
    else goPrevPage();
  };

  const renderCanvasLayer = (width = '100%') => {
    if (layout.mode === 'template') {
      return (
        <div style={{ width }}>
          <TemplateCanvas
            lang={lang}
            editing={edit}
            uiMode={preview ? 'preview' : 'edit'}
            panelOpen={tplPanelOpen}
            onTogglePanel={(open) => setTplPanelOpen(open)}
            pageHeight={PAGE_HEIGHT}
            pageGap={PAGE_GAP}
            fullScrollHeight={fullScrollHeight}
            templateId={layout.templateId}
            data={layout.templateData}
            onChange={(nextData) => {
              const next = { ...layout, mode: 'template', templateData: nextData };
              setLayout(next);
              saveJson(KEYS.MENU_LAYOUT, next);
            }}
            onCancel={() => {
              setPreview(false);
              setEdit(false);
              hideEditButton();
              setPageIndex(1);
              setTimeout(() => hardResetScrollTop('auto'), 0);
            }}
          />
        </div>
      );
    }

    if (layout.mode === 'custom') {
      return (
        <div style={{ width }}>
          <CustomCanvas
            lang={lang}
            inspectorTop={118}
            items={layout.items}
            editing={edit}
            uiMode={preview ? 'preview' : 'edit'}
            scrollRef={stageScrollRef}
            onChangeItems={(items) => {
              const next = { ...layout, mode: 'custom', items };
              setLayout(next);
            }}
            onSave={(items) => {
              const next = { ...layout, mode: 'custom', items };
              setLayout(next);
              saveJson(KEYS.MENU_LAYOUT, next);

              setPreview(false);
              setEdit(false);
              hideEditButton();
              setPageIndex(1);
              setTimeout(() => hardResetScrollTop('auto'), 0);
            }}
            onCancel={() => {
              setPreview(false);
              setEdit(false);
              hideEditButton();
              setPageIndex(1);
              setTimeout(() => hardResetScrollTop('auto'), 0);
            }}
          />
        </div>
      );
    }

    return null;
  };

  const renderModals = () => (
    <>
      {pinModalOpen && (
        <div style={styles.modalBg} onClick={() => setPinModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>{T.pinEnterTitle}</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>{T.pinEnterDesc}</div>

            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              inputMode="numeric"
              placeholder={lang === 'ko' ? '4자리 숫자' : '4 digits'}
              style={styles.pinInput}
              maxLength={4}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitPin();
                if (e.key === 'Escape') setPinModalOpen(false);
              }}
            />

            {pinError && <div style={styles.errText}>{pinError}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button style={styles.primaryBtn} onClick={submitPin}>
                {T.confirm}
              </button>
              <button style={styles.secondaryBtn} onClick={() => setPinModalOpen(false)}>
                {T.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div style={styles.modalBg} onClick={() => setSettingsOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>{T.pinSettings}</div>

            <div style={{ fontWeight: 900, marginBottom: 6 }}>{T.pinChange}</div>

            <input
              type="password"
              value={curPinInput}
              onChange={(e) => setCurPinInput(e.target.value)}
              inputMode="numeric"
              placeholder={T.curPin}
              style={styles.pinInput}
              maxLength={4}
            />
            <input
              type="password"
              value={newPinInput}
              onChange={(e) => setNewPinInput(e.target.value)}
              inputMode="numeric"
              placeholder={T.newPin}
              style={styles.pinInput}
              maxLength={4}
            />
            <input
              type="password"
              value={newPinConfirm}
              onChange={(e) => setNewPinConfirm(e.target.value)}
              inputMode="numeric"
              placeholder={T.newPin2}
              style={styles.pinInput}
              maxLength={4}
            />

            {settingsError && <div style={styles.errText}>{settingsError}</div>}
            {settingsMsg && <div style={styles.okText}>{settingsMsg}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button style={styles.primaryBtn} onClick={submitChangePin}>
                {T.change}
              </button>
              <button
                style={styles.secondaryBtn}
                onClick={() => {
                  setSettingsOpen(false);
                  setSettingsError('');
                  setSettingsMsg('');
                }}
              >
                {T.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {pageBgModalOpen && (
        <div style={styles.modalBg} onClick={() => setPageBgModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>{T.pageBgTitle}</div>

            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              {T.currentPage}: {pageIndex} / {totalPages}
            </div>

            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
              {hasOverrideThisPage ? T.usingOverride : T.usingDefault}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button style={styles.primaryBtn} onClick={openPageBgPicker}>
                {T.uploadThis}
              </button>

              <button
                style={styles.secondaryBtn}
                onClick={() => clearPageBgOverride(pageIndex)}
                disabled={!hasOverrideThisPage}
              >
                {T.clearThis}
              </button>

              <button style={styles.secondaryBtn} onClick={() => setPageBgModalOpen(false)}>
                {T.close}
              </button>
            </div>

            <input
              ref={pageBgInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => uploadPageBg(e.target.files?.[0], pageIndex)}
            />

            {assetUploadMessage && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  color: assetUploading ? '#7dd3fc' : '#e5e7eb',
                }}
              >
                {assetUploadMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {editModeModalOpen && (
        <div style={styles.modalBg} onClick={() => setEditModeModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>{T.changeMode}</div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>{T.pickTemplate}</div>
              <TemplatePicker
                lang={lang}
                onPick={(fullId) => {
                  setEditModeModalOpen(false);

                  const data = makeInitialTemplateData(fullId, lang);
                  const next = { mode: 'template', templateId: fullId, templateData: data, items: [] };

                  setLayout(next);
                  saveJson(KEYS.MENU_LAYOUT, next);
                  setEdit(true);
                  setPreview(false);
                  setPageIndex(1);
                  setTimeout(() => hardResetScrollTop('auto'), 0);
                }}
              />

              <div style={{ height: 12 }} />

              <button
                style={styles.primaryBtn}
                onClick={() => {
                  const next = { ...layout, mode: 'custom', templateId: null, templateData: null };
                  setLayout(next);
                  saveJson(KEYS.MENU_LAYOUT, next);
                  setEditModeModalOpen(false);
                  setEdit(true);
                  setPreview(false);
                  setPageIndex(1);
                  setTimeout(() => hardResetScrollTop('auto'), 0);
                }}
              >
                {T.freeEdit}
              </button>

              <button style={styles.secondaryBtn} onClick={() => setEditModeModalOpen(false)}>
                {T.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const langWrapStyle = edit ? styles.langWrapEdit : styles.langWrapView;
  const langRowStyle = edit ? styles.langRowEdit : styles.langRowView;
  const langBtnStyle = edit ? styles.langBtn : styles.langBtnView;
  const langBtnActiveStyle = edit ? styles.langBtnActive : styles.langBtnActiveView;

  const renderViewPages = () => {
    const pageWidthScaled = PAGE_WIDTH * effectiveScale;
    const pageHeightScaled = PAGE_HEIGHT * effectiveScale;
    const pageGapPx = PAGE_GAP * effectiveScale;
    const viewWindowWidth = pageWidthScaled;

    return (
      <div
        ref={stageScrollRef}
        style={{
          ...styles.stage,
          ...styles.viewNoSelect,
          overflowY: 'hidden',
          touchAction: 'none',
        }}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
            <div
              style={{
                ...styles.viewTrackWrap,
                width: viewWindowWidth,
                maxWidth: '100%',
                margin: '0 auto',
              }}
            >
              <div
                style={{
                  ...styles.viewTrack,
                  gap: pageGapPx,
                  transform: `translate3d(${viewTranslateX}px, 0, 0)`,
                  transition: `transform ${TURN_ANIM_MS}ms cubic-bezier(0.25, 0.8, 0.4, 1)`,
                }}
              >
            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              const pageOffset = (pageNum - 1) * (PAGE_HEIGHT + PAGE_GAP);
              const tilt = pageNum === pageIndex ? 0 : pageNum < pageIndex ? -4 : 4;

              return (
                <div
                  key={pageNum}
                  style={{
                    ...styles.viewPageFrame,
                    width: pageWidthScaled,
                    height: pageHeightScaled,
                  }}
                >
                  <div
                    style={{
                      ...styles.viewPageSurface,
                      transform: `rotateY(${tilt}deg)`,
                      transition: `transform ${TURN_ANIM_MS}ms ease, box-shadow ${TURN_ANIM_MS}ms ease`,
                      boxShadow:
                        pageNum === pageIndex
                          ? '0 20px 60px rgba(0,0,0,0.35)'
                          : '0 10px 36px rgba(0,0,0,0.28)',
                    }}
                  >
                    <div
                      style={{
                        ...styles.viewPageBg,
                        backgroundImage: `url(${getPageBgUrl(pageNum)})`,
                        height: pageHeightScaled,
                      }}
                    />

                    <div style={{ ...styles.viewPageMask, height: pageHeightScaled }}>
                      <div
                        style={{
                          transform: `scale(${effectiveScale}) translateY(-${pageOffset}px)`,
                          transformOrigin: 'top left',
                          width: PAGE_WIDTH,
                        }}
                      >
                        {renderCanvasLayer(`${PAGE_WIDTH}px`)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderFloatingUi = () => {
    if (preview) return null;

    return (
      <>
        {!isOverlayOpen && (
          <div style={langWrapStyle}>
            <div style={langRowStyle}>
              <button
                style={{ ...langBtnStyle, ...(lang === 'en' ? langBtnActiveStyle : {}) }}
                onClick={() => setLanguage('en')}
                aria-label="English"
                title="English"
              >
                🇺🇸
              </button>
              <button
                style={{ ...langBtnStyle, ...(lang === 'ko' ? langBtnActiveStyle : {}) }}
                onClick={() => setLanguage('ko')}
                aria-label="Korean"
                title="한국어"
              >
                🇰🇷
              </button>
            </div>

            {!edit && showEditBtn && (
              <div style={styles.editActionsRow}>
                <button
                  style={styles.logoutBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLogout();
                  }}
                >
                  {T.logout}
                </button>
                <button
                  style={styles.editBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestEdit();
                  }}
                >
                  {T.edit}
                </button>
              </div>
            )}
          </div>
        )}

        {!edit && !isOverlayOpen && totalPages > 1 && (
          <div style={styles.viewPageHint}>
            {pageIndex} / {totalPages}
          </div>
        )}

        {!showEditBtn && !edit && (
          <div
            style={styles.secretHotspot}
            onClick={onSecretCornerClick}
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            onTouchCancel={cancelLongPress}
            aria-label="secret-edit-hotspot"
          />
        )}

        {!isOverlayOpen && !edit && (
          <button style={styles.backBtn} onClick={goIntro}>
            {T.backToVideo}
          </button>
        )}
      </>
    );
  };

  return (
    <div style={styles.container}>
      {loading ? null : !bgUrl ? (
        <div style={styles.setupWrap}>
          <div style={styles.setupCard}>
            <div style={styles.title}>{T.pickBgTitle}</div>
            <div style={styles.desc}>
              {T.pickBgDesc1}
              <b>{T.pickBgDesc2}</b>
              {T.pickBgDesc3}
              <br />
              {T.pickBgDesc4}
            </div>

            <div
              style={{ ...styles.dropZone, ...(dragOver ? styles.dropZoneActive : {}) }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={openFilePicker}
              role="button"
              tabIndex={0}
            >
              <div style={styles.dropIcon}>🖼️</div>
              <div style={styles.dropText}>
                {T.drop1}
                <br />
                <span style={styles.linkLike}>{T.drop2}</span> {T.drop3}
              </div>
              <div style={styles.hint}>{T.hint}</div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => uploadBg(e.target.files?.[0])}
            />

            {assetUploadMessage && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  color: assetUploading ? '#7dd3fc' : '#e5e7eb',
                }}
              >
                {assetUploadMessage}
              </div>
            )}

            <div style={styles.smallNote}>{T.keep}</div>
          </div>
        </div>
      ) : pageTurnEnabled ? (
        renderViewPages()
      ) : (
        <div
          ref={stageScrollRef}
          style={{
            ...styles.stage,
            ...styles.viewNoSelect,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
          }}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* ✅ mover: 보기모드에서만 translate, 편집/미리보기는 none */}
          <div style={styles.viewportMover}>
            {/* ✅ content wrapper: 보기모드에서만 scale, 편집/미리보기는 1:1 크게 */}
            <div
              style={{
                ...styles.page,
                height: fullScrollHeight,
                width: '100%',
              }}
            >
              {renderBgPages()}

              {/* ✅ 편집 중 페이지 구분선 */}
              {edit && !preview && (
                <>
                  {Array.from({ length: totalPages - 1 }).map((_, i) => {
                    const y = (i + 1) * PAGE_HEIGHT + i * PAGE_GAP;
                    return (
                      <div
                        key={i}
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: y,
                          height: PAGE_GAP,
                          background: 'rgba(0,0,0,0.65)',
                          borderTop: '1px dashed rgba(255,255,255,0.55)',
                          borderBottom: '1px dashed rgba(255,255,255,0.55)',
                          zIndex: 30,
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  })}
                </>
              )}

              {/* ✅ 편집 메뉴 */}
              {edit && !preview && !isOverlayOpen && (
                <div style={styles.editorMenuBar} onMouseDown={(e) => e.stopPropagation()}>
                  <button
                    style={styles.menuBtnDark}
                    onClick={() => setShowEditorMenu((prev) => !prev)}
                  >
                    {T.editorMenu}
                  </button>
                </div>
              )}

              {/* ✅ 편집 메뉴 (토글) */}
              {edit && showEditorMenu && !preview && !isOverlayOpen && (
                <div style={styles.editMenu} onMouseDown={(e) => e.stopPropagation()}>
                  <button
                    style={styles.menuBtn}
                    onClick={() => {
                      setTplPanelOpen(false);
                      setEditModeModalOpen(true);
                    }}
                  >
                    {T.changeMode}
                  </button>

                  <button style={styles.menuBtn} onClick={() => setPageBgModalOpen(true)}>
                    {T.pageBg}
                  </button>

                  <button style={styles.menuBtn} onClick={openIntroVideoPicker}>
                    {T.introVideo}
                  </button>

                  <button
                    style={styles.menuBtn}
                    onClick={() => {
                      setSettingsError('');
                      setSettingsMsg('');
                      setSettingsOpen(true);
                    }}
                  >
                    {T.pinSettings}
                  </button>

                  <button style={styles.menuBtn} onClick={openFilePicker}>
                    {T.changeBg}
                  </button>

                  <button style={styles.menuBtnDark} onClick={() => setPreview(true)}>
                    {T.preview}
                  </button>

                  {/* 전체 배경 */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => uploadBg(e.target.files?.[0])}
                  />

                  <input
                    ref={introVideoInputRef}
                    type="file"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => uploadIntroVideo(e.target.files?.[0])}
                  />
                </div>
              )}

              {/* ✅ 미리보기 상단 바 */}
              {edit && preview && !isOverlayOpen && (
                <div style={styles.previewBar} onMouseDown={(e) => e.stopPropagation()}>
                  <button style={styles.menuBtnDark} onClick={handleSaveAll}>
                    {T.save}
                  </button>
                  <button style={styles.menuBtn} onClick={handleExitPreview}>
                    {T.back}
                  </button>
                </div>
              )}

              {/* ✅ 편집 페이지 컨트롤(편집에서만) */}
              {edit && !preview && (
                <div style={styles.pageCtrl} onMouseDown={(e) => e.stopPropagation()}>
                  <button style={styles.pageCtrlBtn} onClick={() => setPageView((v) => !v)}>
                    {pageView ? T.continuous : T.pageView}
                  </button>

                  <div style={{ width: 10 }} />

                  <button
                    style={styles.pageCtrlBtn}
                    onClick={() => {
                      const next = Math.max(1, pageIndex - 1);
                      setPageIndex(next);
                      if (!pageView) scrollToPage(next);
                    }}
                    disabled={pageIndex <= 1}
                  >
                    {T.prev}
                  </button>

                  <div style={styles.pageCtrlText}>
                    {T.page} {pageIndex} / {totalPages}
                  </div>

                  <button
                    style={styles.pageCtrlBtn}
                    onClick={() => {
                      const next = Math.min(totalPages, pageIndex + 1);
                      setPageIndex(next);
                      if (!pageView) scrollToPage(next);
                    }}
                    disabled={pageIndex >= totalPages}
                  >
                    {T.next}
                  </button>

                  <button style={styles.pageCtrlBtn} onClick={() => scrollToPage(pageIndex)}>
                    {T.jump}
                  </button>
                </div>
              )}

              {/* ✅ 보기모드 페이지 인디케이터(옵션: 조용하게) */}
              {!layout.mode && !preview && <div style={styles.helpHint}>{T.help}</div>}

              {layout.mode === 'template' && !preview && (
                <div style={styles.badge}>
                  {T.templateBadge}
                  {layout.templateId}
                </div>
              )}

              {layout.mode === 'template' && edit && !preview && !isOverlayOpen && !tplPanelOpen && (
                <button style={styles.tplShowBtn} onClick={() => setTplPanelOpen(true)}>
                  {T.showTplPanel}
                </button>
              )}

              {/* ✅ Template */}
              {layout.mode === 'template' && (
                <TemplateCanvas
                  lang={lang}
                  editing={edit}
                  uiMode={preview ? 'preview' : 'edit'}
                  panelOpen={tplPanelOpen}
                  onTogglePanel={(open) => setTplPanelOpen(open)}
                  pageHeight={PAGE_HEIGHT}
                  pageGap={PAGE_GAP}
                  fullScrollHeight={fullScrollHeight}
                  templateId={layout.templateId}
                  data={layout.templateData}
                  onChange={(nextData) => {
                    const next = { ...layout, mode: 'template', templateData: nextData };
                    setLayout(next);
                    saveJson(KEYS.MENU_LAYOUT, next);
                  }}
                  onCancel={() => {
                    setPreview(false);
                    setEdit(false);
                    hideEditButton();
                    setPageIndex(1);
                    setTimeout(() => hardResetScrollTop('auto'), 0);
                  }}
                />
              )}

              {/* ✅ Custom */}
              {layout.mode === 'custom' && (
                <CustomCanvas
                  lang={lang}
                  inspectorTop={118}
                  items={layout.items}
                  editing={edit}
                  uiMode={preview ? 'preview' : 'edit'}
                  scrollRef={stageScrollRef}
                  onChangeItems={(items) => {
                    const next = { ...layout, mode: 'custom', items };
                    setLayout(next);
                  }}
                  onSave={(items) => {
                    const next = { ...layout, mode: 'custom', items };
                    setLayout(next);
                    saveJson(KEYS.MENU_LAYOUT, next);

                    setPreview(false);
                    setEdit(false);
                    hideEditButton();
                    setPageIndex(1);
                    setTimeout(() => hardResetScrollTop('auto'), 0);
                  }}
                  onCancel={() => {
                    setPreview(false);
                    setEdit(false);
                    hideEditButton();
                    setPageIndex(1);
                    setTimeout(() => hardResetScrollTop('auto'), 0);
                  }}
                />
              )}

              {/* ✅ 최초 편집 모드 선택 모달 */}
              {edit && !preview && layout.mode !== 'custom' && layout.mode !== 'template' && (
                <div
                  style={styles.modalBg}
                  onClick={() => {
                    setEdit(false);
                    setPreview(false);
                    hideEditButton();
                    setPageIndex(1);
                    setTimeout(() => hardResetScrollTop('auto'), 0);
                  }}
                >
                  <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>{T.editModePick}</div>

                    <TemplatePicker
                      lang={lang}
                      onPick={(fullId) => {
                        const initTemplateData = makeInitialTemplateData(fullId, lang);

                        const next = {
                          ...layout,
                          mode: 'template',
                          templateId: fullId,
                          templateData: initTemplateData,
                          items: [],
                        };
                        setLayout(next);
                        saveJson(KEYS.MENU_LAYOUT, next);

                        setEdit(true);
                        setPreview(false);
                        setTplPanelOpen(true);
                        setPageIndex(1);
                        setTimeout(() => hardResetScrollTop('auto'), 0);
                      }}
                    />

                    <div style={{ height: 12 }} />

                    <button
                      style={styles.primaryBtn}
                      onClick={() => {
                        const next = { ...layout, mode: 'custom', templateId: null, templateData: null };
                        setLayout(next);
                        saveJson(KEYS.MENU_LAYOUT, next);
                        setEdit(true);
                        setPreview(false);
                        setPageIndex(1);
                        setTimeout(() => hardResetScrollTop('auto'), 0);
                      }}
                    >
                      {T.freeEdit}
                    </button>

                    <button
                      style={styles.secondaryBtn}
                      onClick={() => {
                        setEdit(false);
                        setPreview(false);
                        hideEditButton();
                        setPageIndex(1);
                        setTimeout(() => hardResetScrollTop('auto'), 0);
                      }}
                    >
                      {T.close}
                    </button>
                  </div>
                </div>
              )}

              {/* ✅ 편집 중에도 전환 가능한 "편집 방식 변경" 모달 */}
              {edit && !preview && editModeModalOpen && (
                <div style={styles.modalBg} onClick={() => setEditModeModalOpen(false)}>
                  <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>{T.changeMode}</div>

                    <TemplatePicker
                      lang={lang}
                      onPick={(fullId) => {
                        const initTemplateData = makeInitialTemplateData(fullId, lang);

                        const next = {
                          ...layout,
                          mode: 'template',
                          templateId: fullId,
                          templateData: initTemplateData,
                          items: [],
                        };
                        setLayout(next);
                        saveJson(KEYS.MENU_LAYOUT, next);
                        setEditModeModalOpen(false);
                        setEdit(true);
                        setPreview(false);
                        setTplPanelOpen(true);
                        setPageIndex(1);
                        setTimeout(() => hardResetScrollTop('auto'), 0);
                      }}
                    />

                    <div style={{ height: 12 }} />

                    <button
                      style={styles.primaryBtn}
                      onClick={() => {
                        const next = { ...layout, mode: 'custom', templateId: null, templateData: null };
                        setLayout(next);
                        saveJson(KEYS.MENU_LAYOUT, next);
                        setEditModeModalOpen(false);
                        setEdit(true);
                        setPreview(false);
                        setPageIndex(1);
                        setTimeout(() => hardResetScrollTop('auto'), 0);
                      }}
                    >
                      {T.freeEdit}
                    </button>

                    <button style={styles.secondaryBtn} onClick={() => setEditModeModalOpen(false)}>
                      {T.close}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {renderFloatingUi()}
      {renderModals()}
    </div>
  );
}

// ✅ 초기 템플릿 데이터
function makeInitialTemplateData(fullId, lang) {
  const group = (fullId || '').slice(0, 2);
  const variant = (fullId || '').slice(2, 3) || 'A';
  const isKo = lang === 'ko';

  const defaultTitle =
    group === 'T1'
      ? isKo
        ? '오늘의 메뉴'
        : 'Today’s Menu'
      : group === 'T2'
      ? isKo
        ? '추천 메뉴'
        : 'Featured'
      : isKo
      ? '메뉴'
      : 'Menu';

  const baseStyle = {
    fontFamily: 'system-ui',
    textColor: '#ffffff',
    accentColor: 'rgba(255,255,255,0.65)',
    lineSpacing: 1.12,
    rowGap: 14,
    forceTwoDecimals: true,
    uiScale: 0.85,
    variant,
  };

  const common = {
    restaurantName: isKo ? '한소반' : 'Hansoban',
    logoSrc: null,
  };

  if (group === 'T1') {
    return {
      ...common,
      title: defaultTitle,
      currency: '$',
      style: baseStyle,
      rows: [
        { name: isKo ? '김치찌개' : 'Kimchi Stew', price: '9.99' },
        { name: isKo ? '불고기' : 'Bulgogi', price: '12.99' },
        { name: isKo ? '비빔밥' : 'Bibimbap', price: '10.99' },
      ],
    };
  }

  if (group === 'T2') {
    return {
      ...common,
      title: defaultTitle,
      currency: '$',
      style: baseStyle,
      photos: [],
      rows: [
        { name: isKo ? '한우 국밥' : 'Beef Soup', price: '13.99' },
        { name: isKo ? '제육볶음' : 'Spicy Pork', price: '11.99' },
        { name: isKo ? '된장찌개' : 'Soybean Stew', price: '9.99' },
        { name: isKo ? '비빔밥' : 'Bibimbap', price: '10.99' },
        { name: isKo ? '불고기' : 'Bulgogi', price: '12.99' },
        { name: isKo ? '김치전' : 'Kimchi Pancake', price: '8.99' },
      ],
      caption: isKo ? '사진을 업로드하세요' : 'Upload photo',
    };
  }

  return {
    ...common,
    title: defaultTitle,
    currency: '$',
    style: baseStyle,
    columns: 2,
    cells: [
      { name: isKo ? '라면' : 'Ramen', price: '7.99' },
      { name: isKo ? '만두' : 'Dumplings', price: '6.99' },
      { name: isKo ? '튀김' : 'Fried', price: '8.99' },
      { name: isKo ? '우동' : 'Udon', price: '9.99' },
    ],
  };
}

const styles = {
  container: { width: '100%', height: '100vh', background: '#111' },

  setupWrap: {
    width: '100%',
    height: '100%',
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    boxSizing: 'border-box',
  },
  setupCard: {
    width: 'min(720px, 92vw)',
    background: '#fff',
    borderRadius: 18,
    padding: 22,
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  },
  title: { fontSize: 22, fontWeight: 900, marginBottom: 8 },
  desc: { fontSize: 14, lineHeight: 1.45, opacity: 0.85, marginBottom: 16 },

  dropZone: {
    border: '2px dashed #bbb',
    borderRadius: 16,
    padding: 20,
    textAlign: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'all 0.15s ease',
  },
  dropZoneActive: {
    borderColor: '#222',
    background: 'rgba(0,0,0,0.04)',
  },
  dropIcon: { fontSize: 42, marginBottom: 6 },
  dropText: { fontSize: 15, lineHeight: 1.45 },
  linkLike: { textDecoration: 'underline', fontWeight: 900 },
  hint: { marginTop: 10, fontSize: 12, opacity: 0.65 },
  smallNote: { marginTop: 12, fontSize: 12, opacity: 0.7 },

  stage: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflowX: 'hidden',
    background: '#000',
  },

  viewNoSelect: {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    WebkitTapHighlightColor: 'transparent',
  },

  viewportMover: {
    position: 'relative',
    width: '100%',
  },

  viewTrackWrap: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },

  viewTrack: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: '100%',
  },

  viewPageFrame: {
    position: 'relative',
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    perspective: 1600,
  },

  viewPageSurface: {
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    background: '#000',
    transformStyle: 'preserve-3d',
    backfaceVisibility: 'hidden',
  },

  viewPageBg: {
    position: 'absolute',
    inset: 0,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'top center',
    backgroundSize: '100% 100%',
    zIndex: 1,
    filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.25))',
  },

  viewPageMask: {
    position: 'relative',
    zIndex: 2,
    overflow: 'hidden',
    width: '100%',
    borderRadius: 24,
  },

  page: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },

  secretHotspot: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 140,
    height: 140,
    zIndex: 9990,
    background: 'transparent',
    touchAction: 'none',
  },

  langWrapEdit: {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 25px)',
    right: 16,
    zIndex: 99999,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
  },

  langWrapView: {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 32px)',
    right: 'calc(env(safe-area-inset-right, 0px) + 20px)',
    zIndex: 99999,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    alignItems: 'flex-end',
  },

  langRowEdit: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },

  langRowView: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },

  langBtn: {
    width: 40,
    height: 32,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.6)',
    background: 'rgba(0,0,0,0.45)',
    cursor: 'pointer',
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnActive: {
    border: '1px solid rgba(255,255,255,0.95)',
    background: 'rgba(0,0,0,0.65)',
  },

  langBtnView: {
    width: 56,
    height: 44,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.6)',
    background: 'rgba(0,0,0,0.48)',
    cursor: 'pointer',
    fontSize: 24,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
    padding: 0,
  },
  langBtnActiveView: {
    border: '1px solid rgba(255,255,255,0.95)',
    background: 'rgba(0,0,0,0.65)',
  },

  editorMenuBar: {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 66px)',
    right: 16,
    zIndex: 99998,
  },

  editMenu: {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 110px)',
    right: 16,
    zIndex: 99999,
    display: 'flex',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
    flexWrap: 'nowrap',
    overflowX: 'auto',
  },

  previewBar: {
    position: 'fixed',
    right: 16,
    bottom: 16,
    zIndex: 9999,
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'nowrap',
  },

  menuBtn: {
    padding: '10px 14px',
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 900,
    background: 'rgba(255,255,255,0.9)',
    whiteSpace: 'nowrap',
  },

  menuBtnDark: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.35)',
    cursor: 'pointer',
    fontWeight: 900,
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    whiteSpace: 'nowrap',
  },

  editBtn: {
    alignSelf: 'flex-end',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.35)',
    cursor: 'pointer',
    fontWeight: 900,
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
    minWidth: 88,
  },

  editActionsRow: {
    display: 'flex',
    gap: 8,
  },

  logoutBtn: {
    alignSelf: 'flex-end',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(255, 99, 99, 0.65)',
    cursor: 'pointer',
    fontWeight: 900,
    background: 'linear-gradient(135deg, #ff4d4f, #b22222)',
    color: '#fff',
    boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
    minWidth: 88,
  },

  pageCtrl: {
    position: 'fixed',
    left: 16,
    bottom: 16,
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 14,
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    backdropFilter: 'blur(6px)',
  },
  pageCtrlBtn: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.25)',
    cursor: 'pointer',
    fontWeight: 900,
    background: 'rgba(255,255,255,0.10)',
    color: '#fff',
    opacity: 1,
  },
  pageCtrlText: {
    fontWeight: 900,
    fontSize: 13,
    opacity: 0.95,
    padding: '0 6px',
    userSelect: 'none',
  },

  viewPageHint: {
    position: 'fixed',
    left: 16,
    top: 'calc(env(safe-area-inset-top, 0px) + 32px)',
    zIndex: 99999,
    minHeight: 44,
    padding: '10px 12px',
    borderRadius: 12,
    background: 'rgba(0,0,0,0.48)',
    color: '#fff',
    fontWeight: 900,
    fontSize: 15,
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
  },

  backBtn: {
    position: 'fixed',
    left: 16,
    bottom: 16,
    width: 100,
    height: 32,
    padding: 0,
    borderRadius: 20,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 900,
    zIndex: 2200,
    background: 'rgba(255,255,255,0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  badge: {
    position: 'fixed',
    left: 16,
    top: 64,
    zIndex: 150,
    color: '#fff',
    background: 'rgba(0,0,0,0.55)',
    padding: '8px 10px',
    borderRadius: 10,
  },

  tplShowBtn: {
    position: 'fixed',
    left: 16,
    top: 108,
    zIndex: 99999,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.35)',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontWeight: 900,
    cursor: 'pointer',
  },

  helpHint: {
    position: 'fixed',
    left: 16,
    bottom: 60,
    zIndex: 150,
    color: '#fff',
    background: 'rgba(0,0,0,0.55)',
    padding: 12,
    borderRadius: 12,
    maxWidth: 520,
    whiteSpace: 'pre-line',
  },

  modalBg: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,.6)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 3000,
  },
  modal: {
    width: 'min(520px, 92vw)',
    background: '#fff',
    padding: 18,
    borderRadius: 16,
  },

  pinInput: {
    width: '100%',
    padding: '12px 12px',
    borderRadius: 12,
    border: '1px solid #ddd',
    fontWeight: 900,
    fontSize: 16,
    letterSpacing: 4,
    boxSizing: 'border-box',
    marginBottom: 8,
  },

  errText: { marginTop: 8, color: '#c00000', fontWeight: 900, fontSize: 13 },
  okText: { marginTop: 8, color: '#0a7a2f', fontWeight: 900, fontSize: 13 },

  primaryBtn: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 900,
    background: '#111',
    color: '#fff',
  },
  secondaryBtn: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #ddd',
    cursor: 'pointer',
    fontWeight: 900,
    background: '#fff',
  },
};