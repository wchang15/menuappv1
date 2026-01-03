'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KEYS, loadBlob, saveBlob } from '@/lib/storage';

export default function IntroPlayer() {
  const router = useRouter();
  const videoRef = useRef(null);

  const [videoBlob, setVideoBlob] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [muted, setMuted] = useState(true); // 처음엔 음소거
  const [loading, setLoading] = useState(true);


  // 저장된 비디오 로드
  useEffect(() => {
    (async () => {
      try {
        const blob = await loadBlob(KEYS.INTRO_VIDEO);
        if (blob) setVideoBlob(blob);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // blob -> objectURL
  useEffect(() => {
    if (!videoBlob) {
      setVideoUrl(null);
      return;
    }

    const url = URL.createObjectURL(videoBlob);
    setVideoUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [videoBlob]);

  // 자동재생 시도
  useEffect(() => {
    if (!videoUrl) return;
    const v = videoRef.current;
    if (!v) return;

    (async () => {
      try {
        await v.play();
      } catch (e) {
        console.log('Autoplay blocked:', e);
      }
    })();
  }, [videoUrl]);

  const upload = async (file) => {
    if (!file) return;
    await saveBlob(KEYS.INTRO_VIDEO, file);
    setVideoBlob(file);
  };

  const goMenu = () => router.push('/menu');

  // 🔁 Sound On / Off 토글
  const toggleSound = async () => {
    const v = videoRef.current;
    if (!v) return;

    const nextMuted = !muted;
    setMuted(nextMuted);
    v.muted = nextMuted;

    try {
      await v.play();
    } catch (e) {
      console.log('Toggle sound failed:', e);
    }
  };

  // ✅ 끝나면 메뉴로 가지 말고 다시 재생(루프 보강)
  const handleEnded = async () => {
    const v = videoRef.current;
    if (!v) return;

    try {
      v.currentTime = 0;
      await v.play();
    } catch (e) {
      // 일부 브라우저에서 autoplay 정책 때문에 실패할 수 있음
      console.log('Loop replay blocked:', e);
    }
  };

  return (
    <div style={styles.container}>
      {loading ? null : !videoUrl ? (
        <div style={styles.uploadBox}>
          <input type="file" accept="video/*" onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            autoPlay
            muted={muted}
            playsInline
            loop // ✅ 기본 루프
            onEnded={handleEnded} // ✅ 루프가 안 먹는 환경 대비 보강
            style={styles.video}
          />

          {/* 오른쪽 하단 버튼 */}
          <div style={styles.actionRow}>
            <button onClick={toggleSound} style={styles.soundBtn}>
              {muted ? 'Sound On' : 'Sound Off'}
            </button>

            {/* ✅ SKIP 대신 Go to Menu */}
            <button onClick={goMenu} style={styles.menuBtn}>
              Go to Menu
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    background: '#000',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  uploadBox: {
    color: '#fff',
  },
  actionRow: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
  },
  soundBtn: {
    padding: '10px 14px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    background: 'rgba(255,255,255,0.9)',
  },
  menuBtn: {
    padding: '10px 14px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    background: 'rgba(255,255,255,0.9)',
  },
};