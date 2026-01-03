'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ id: '', password: '' });

  const fillDemoAccount = () => {
    setForm({ id: 'test', password: 'test1' });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    router.push('/intro');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0d0d0f, #121623)',
        color: '#f4f4f4',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(18, 22, 35, 0.8)',
          borderRadius: '16px',
          boxShadow: '0 15px 35px rgba(0, 0, 0, 0.35)',
          padding: '32px',
          boxSizing: 'border-box',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '32px',
          }}
        >
          <div
            aria-label="회사 로고"
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '24px',
              background: 'linear-gradient(145deg, #1f6feb, #5ce1e6)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
              fontSize: '20px',
              letterSpacing: '0.5px',
              boxShadow: '0 10px 30px rgba(92, 225, 230, 0.25)',
            }}
          >
            LOGO
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: '24px', color: '#ffffff' }}>
              로그인
            </h1>
            <p style={{ margin: 0, color: '#b3b8c2', fontSize: '14px' }}>
              메뉴얼에 안내된 계정으로 로그인해 주세요.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
            아이디
            <input
              type="text"
              name="id"
              value={form.id}
              onChange={handleChange}
              required
              placeholder="아이디를 입력하세요"
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #242938',
                background: 'rgba(13, 15, 24, 0.85)',
                color: '#f4f4f4',
                outline: 'none',
                fontSize: '15px',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
            비밀번호
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              placeholder="비밀번호를 입력하세요"
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #242938',
                background: 'rgba(13, 15, 24, 0.85)',
                color: '#f4f4f4',
                outline: 'none',
                fontSize: '15px',
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              marginTop: '8px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #1f6feb, #5ce1e6)',
              color: '#0a0c12',
              fontWeight: 700,
              fontSize: '16px',
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(31, 111, 235, 0.35)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseDown={(event) => {
              event.currentTarget.style.transform = 'translateY(1px)';
              event.currentTarget.style.boxShadow = '0 4px 12px rgba(31, 111, 235, 0.35)';
            }}
            onMouseUp={(event) => {
              event.currentTarget.style.transform = 'translateY(0)';
              event.currentTarget.style.boxShadow = '0 8px 20px rgba(31, 111, 235, 0.35)';
            }}
          >
            로그인
          </button>
        </form>

        <div
          style={{
            marginTop: '12px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(92, 225, 230, 0.08)',
            border: '1px solid rgba(92, 225, 230, 0.25)',
            color: '#d8f7ff',
            fontSize: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              <strong style={{ display: 'block', marginBottom: '4px' }}>데모 계정</strong>
              <span style={{ color: '#b3e7f3' }}>아이디: test / 비밀번호: test1</span>
            </div>
            <button
              type="button"
              onClick={fillDemoAccount}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(92, 225, 230, 0.4)',
                background: 'rgba(92, 225, 230, 0.15)',
                color: '#0a0c12',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              자동 입력
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '16px',
            marginTop: '18px',
            color: '#8f96a3',
            fontSize: '14px',
          }}
        >
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>
            아이디 찾기
          </a>
          <span aria-hidden="true">|</span>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>
            비밀번호 찾기
          </a>
        </div>
      </div>
    </div>
  );
}