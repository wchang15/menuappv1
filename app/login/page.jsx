'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setCurrentUser } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ id: '', password: '' });
  const [activeRecovery, setActiveRecovery] = useState(null);
  const [idRecovery, setIdRecovery] = useState({
    email: '',
    code: '',
    sentCode: '',
    verified: false,
    message: '',
  });
  const [passwordRecovery, setPasswordRecovery] = useState({
    id: '',
    email: '',
    code: '',
    sentCode: '',
    verified: false,
    newPassword: '',
    message: '',
  });

  const fillDemoAccount = () => {
    setForm({ id: 'test', password: 'test1' });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setCurrentUser(form.id);
    router.push('/intro');
  };

  const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

  const handleSendIdCode = () => {
    const newCode = generateCode();
    setIdRecovery((prev) => ({
      ...prev,
      sentCode: newCode,
      verified: false,
      message: `테스트용 인증번호 ${newCode}를(을) 전송했습니다.`,
    }));
  };

  const handleVerifyIdCode = () => {
    setIdRecovery((prev) => ({
      ...prev,
      verified: prev.code === prev.sentCode && prev.code !== '',
      message:
        prev.code === prev.sentCode && prev.code !== ''
          ? '인증 완료! 당신의 ID는 000 입니다.'
          : '인증번호를 다시 확인해 주세요.',
    }));
  };

  const handleSendPasswordCode = () => {
    const newCode = generateCode();
    setPasswordRecovery((prev) => ({
      ...prev,
      sentCode: newCode,
      verified: false,
      message: `테스트용 인증번호 ${newCode}를(을) 전송했습니다.`,
    }));
  };

  const handleVerifyPasswordCode = () => {
    setPasswordRecovery((prev) => ({
      ...prev,
      verified: prev.code === prev.sentCode && prev.code !== '',
      message:
        prev.code === prev.sentCode && prev.code !== ''
          ? '인증 완료! 새 비밀번호를 입력해 주세요.'
          : '인증번호를 다시 확인해 주세요.',
    }));
  };

  const handlePasswordReset = (event) => {
    event.preventDefault();
    if (!passwordRecovery.verified) {
      setPasswordRecovery((prev) => ({
        ...prev,
        message: '먼저 이메일 인증을 완료해 주세요.',
      }));
      return;
    }

    setPasswordRecovery((prev) => ({
      ...prev,
      message: '새 비밀번호가 설정되었습니다.',
    }));
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
          maxWidth: '480px',
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
              width: '200px',
              height: '80px',
              position: 'relative',
            }}
          >
            <Image
              src="/circle-pay-logo.svg"
              alt="Circle Pay 로고"
              fill
              sizes="200px"
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#ffffff' }}>로그인</h1>
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
          <button
            type="button"
            onClick={() => setActiveRecovery((prev) => (prev === 'id' ? null : 'id'))}
            style={{
              color: 'inherit',
              textDecoration: 'none',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            아이디 찾기
          </button>
          <span aria-hidden="true">|</span>
          <button
            type="button"
            onClick={() => setActiveRecovery((prev) => (prev === 'password' ? null : 'password'))}
            style={{
              color: 'inherit',
              textDecoration: 'none',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            비밀번호 찾기
          </button>
        </div>

        {activeRecovery === 'id' && (
          <div
            style={{
              marginTop: '18px',
              padding: '16px',
              borderRadius: '12px',
              background: 'rgba(13, 15, 24, 0.6)',
              border: '1px solid rgba(92, 225, 230, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ color: '#d8dce5', fontWeight: 700 }}>아이디 찾기</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
              이메일 주소
              <input
                type="email"
                value={idRecovery.email}
                onChange={(event) => setIdRecovery((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="가입 시 사용한 이메일을 입력하세요"
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={idRecovery.code}
                onChange={(event) => setIdRecovery((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="인증번호 입력"
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #242938',
                  background: 'rgba(13, 15, 24, 0.85)',
                  color: '#f4f4f4',
                  outline: 'none',
                  fontSize: '15px',
                }}
              />
              <button
                type="button"
                onClick={handleSendIdCode}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'rgba(92, 225, 230, 0.15)',
                  color: '#5ce1e6',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minWidth: '120px',
                }}
              >
                인증번호 보내기
              </button>
              <button
                type="button"
                onClick={handleVerifyIdCode}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #1f6feb, #5ce1e6)',
                  color: '#0a0c12',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minWidth: '96px',
                }}
              >
                인증
              </button>
            </div>
            {idRecovery.message && (
              <div style={{ color: idRecovery.verified ? '#5ce1e6' : '#f1b3b3', fontSize: '14px' }}>
                {idRecovery.message}
              </div>
            )}
          </div>
        )}

        {activeRecovery === 'password' && (
          <div
            style={{
              marginTop: '18px',
              padding: '16px',
              borderRadius: '12px',
              background: 'rgba(13, 15, 24, 0.6)',
              border: '1px solid rgba(92, 225, 230, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ color: '#d8dce5', fontWeight: 700 }}>비밀번호 찾기</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
              아이디
              <input
                type="text"
                value={passwordRecovery.id}
                onChange={(event) => setPasswordRecovery((prev) => ({ ...prev, id: event.target.value }))}
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
              이메일 주소
              <input
                type="email"
                value={passwordRecovery.email}
                onChange={(event) => setPasswordRecovery((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="가입 시 사용한 이메일을 입력하세요"
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={passwordRecovery.code}
                onChange={(event) => setPasswordRecovery((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="인증번호 입력"
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #242938',
                  background: 'rgba(13, 15, 24, 0.85)',
                  color: '#f4f4f4',
                  outline: 'none',
                  fontSize: '15px',
                }}
              />
              <button
                type="button"
                onClick={handleSendPasswordCode}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'rgba(92, 225, 230, 0.15)',
                  color: '#5ce1e6',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minWidth: '120px',
                }}
              >
                인증번호 보내기
              </button>
              <button
                type="button"
                onClick={handleVerifyPasswordCode}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #1f6feb, #5ce1e6)',
                  color: '#0a0c12',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minWidth: '96px',
                }}
              >
                인증
              </button>
            </div>
            {passwordRecovery.verified && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
                새 비밀번호
                <input
                  type="password"
                  value={passwordRecovery.newPassword}
                  onChange={(event) =>
                    setPasswordRecovery((prev) => ({ ...prev, newPassword: event.target.value }))
                  }
                  placeholder="새 비밀번호를 입력하세요"
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
            )}
            <button
              type="button"
              onClick={handlePasswordReset}
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: 'none',
                background: passwordRecovery.verified
                  ? 'linear-gradient(135deg, #1f6feb, #5ce1e6)'
                  : 'rgba(92, 225, 230, 0.12)',
                color: passwordRecovery.verified ? '#0a0c12' : '#8f96a3',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              새 비밀번호 설정
            </button>
            {passwordRecovery.message && (
              <div
                style={{ color: passwordRecovery.verified ? '#5ce1e6' : '#f1b3b3', fontSize: '14px' }}
              >
                {passwordRecovery.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
