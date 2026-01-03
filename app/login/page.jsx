'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setCurrentUser } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ id: '', password: '' });
  const [activeRecovery, setActiveRecovery] = useState(null);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  // ✅ 로그인 메시지/로딩 추가
  const [loginMessage, setLoginMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);

  const [idRecovery, setIdRecovery] = useState({
    email: '',
    code: '',
    sentCode: '',
    verified: false,
    message: '',
  });

  const [passwordRecovery, setPasswordRecovery] = useState({
    email: '',
    newPassword: '',
    message: '',
    sending: false,
    updating: false,
  });

  // Supabase password recovery 링크로 돌아온 경우 해시 파싱
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (hash.includes('type=recovery')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        supabase.auth
          .setSession({ access_token, refresh_token })
          .then(({ data, error }) => {
            if (!error && data?.session?.user) {
              setCurrentUser(data.session.user.id);
              setHasRecoverySession(true);
              setActiveRecovery('password');
              setPasswordRecovery((prev) => ({
                ...prev,
                email: data.session.user.email || prev.email,
                message: '새 비밀번호를 설정해 주세요.',
              }));
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id) setCurrentUser(session.user.id);
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        setHasRecoverySession(true);
        setActiveRecovery('password');
        setPasswordRecovery((prev) => ({
          ...prev,
          email: session.user.email || prev.email,
          message: '새 비밀번호를 설정해 주세요.',
        }));
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // ✅ 데모 계정: Supabase는 email/password가 기본이므로
  // "test" 같은 id는 로그인이 안 될 수 있어요.
  // 일단 너가 Supabase에 만든 테스트 계정 이메일로 바꿔 사용하세요.
  const fillDemoAccount = () => {
    // 예: setForm({ id: 'test@example.com', password: 'test1' });
    setForm({ id: 'test@example.com', password: 'test1' });
    setLoginMessage('데모 계정은 Supabase에 동일한 이메일/비밀번호로 만들어져 있어야 로그인됩니다.');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ✅✅✅ 여기 핵심: Supabase 로그인으로 교체
  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoginMessage('');
    setIsLoggingIn(true);

    try {
      // Supabase 기본은 email/password
      const email = (form.id || '').trim();
      const password = form.password;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoginMessage(error.message);
        return;
      }

      // ✅ 로그인 성공: Supabase user 객체
      const user = data?.user;

      // ✅ 기존 앱이 local session을 기대하는 구조라면 user.id를 넣어 호환 유지
      if (user?.id) setCurrentUser(user.id);

      // (선택) 필요하면 이메일도 저장할 수 있음
      // localStorage.setItem('CURRENT_USER_EMAIL', user?.email || '');

      router.push('/intro');
    } catch (e) {
      setLoginMessage('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignUp = async (event) => {
    event.preventDefault();
    setLoginMessage('');
    setIsSigningUp(true);

    try {
      const email = (form.id || '').trim();
      const password = form.password;

      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setLoginMessage(error.message);
        return;
      }

      if (data?.user?.id) setCurrentUser(data.user.id);

      setLoginMessage(
        data?.session
          ? '회원가입 및 로그인 완료!'
          : '회원가입이 완료되었습니다. 이메일을 확인해 주세요.'
      );

      if (data?.session) {
        router.push('/intro');
      }
    } catch (e) {
      setLoginMessage('회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsSigningUp(false);
    }
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
          ? '인증 완료! (실제 서비스에서는 이메일로 사용자 계정 조회 로직이 필요합니다)'
          : '인증번호를 다시 확인해 주세요.',
    }));
  };

  const handleSendPasswordReset = async () => {
    if (!passwordRecovery.email) {
      setPasswordRecovery((prev) => ({
        ...prev,
        message: '이메일을 입력해 주세요.',
      }));
      return;
    }

    setPasswordRecovery((prev) => ({ ...prev, sending: true, message: '' }));
    try {
      const redirectTo = `${window.location.origin}/login`; // reset 완료 후 돌아올 곳
      const { error } = await supabase.auth.resetPasswordForEmail(passwordRecovery.email, {
        redirectTo,
      });

      setPasswordRecovery((prev) => ({
        ...prev,
        sending: false,
        message: error
          ? error.message
          : '비밀번호 재설정 링크를 이메일로 전송했습니다. 메일을 확인해 주세요.',
      }));
    } catch (e) {
      setPasswordRecovery((prev) => ({
        ...prev,
        sending: false,
        message: '메일 전송 중 오류가 발생했습니다.',
      }));
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    if (!hasRecoverySession) {
      setPasswordRecovery((prev) => ({
        ...prev,
        message: '이메일 링크를 통해 들어온 후 새 비밀번호를 설정할 수 있습니다.',
      }));
      return;
    }
    if (!passwordRecovery.newPassword) {
      setPasswordRecovery((prev) => ({
        ...prev,
        message: '새 비밀번호를 입력해 주세요.',
      }));
      return;
    }

    setPasswordRecovery((prev) => ({ ...prev, updating: true, message: '' }));

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordRecovery.newPassword,
      });

      if (error) {
        setPasswordRecovery((prev) => ({
          ...prev,
          updating: false,
          message: error.message,
        }));
        return;
      }

      setPasswordRecovery((prev) => ({
        ...prev,
        updating: false,
        message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.',
      }));
      router.push('/intro');
    } catch (e) {
      setPasswordRecovery((prev) => ({
        ...prev,
        updating: false,
        message: '비밀번호 변경 중 오류가 발생했습니다.',
      }));
    }
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
            gap: '8px',
            marginBottom: '16px',
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
        </div>

        {!activeRecovery && (
          <>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
                아이디(이메일)
                <input
                  type="text"
                  name="id"
                  value={form.id}
                  onChange={handleChange}
                  required
                  placeholder="이메일을 입력하세요"
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    background: isLoggingIn
                      ? 'rgba(92, 225, 230, 0.25)'
                      : 'linear-gradient(135deg, #1f6feb, #5ce1e6)',
                    color: '#0a0c12',
                    fontWeight: 700,
                    fontSize: '16px',
                    cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                    boxShadow: isLoggingIn
                      ? 'none'
                      : '0 8px 20px rgba(31, 111, 235, 0.35)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    opacity: isLoggingIn ? 0.85 : 1,
                  }}
                >
                  {isLoggingIn ? '로그인 중...' : '로그인'}
                </button>

                <button
                  type="button"
                  onClick={handleSignUp}
                  disabled={isSigningUp}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(92, 225, 230, 0.4)',
                    background: isSigningUp
                      ? 'rgba(92, 225, 230, 0.12)'
                      : 'rgba(92, 225, 230, 0.18)',
                    color: '#0a0c12',
                    fontWeight: 800,
                    fontSize: '16px',
                    cursor: isSigningUp ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSigningUp ? '가입 중...' : '회원가입'}
                </button>
              </div>

              {!!loginMessage && (
                <div style={{ marginTop: '6px', color: '#f1b3b3', fontSize: '14px' }}>
                  {loginMessage}
                </div>
              )}
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
                  <span style={{ color: '#b3e7f3' }}>
                    (예시) 이메일: test@example.com / 비밀번호: test1
                  </span>
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
                onClick={() => setActiveRecovery('id')}
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
                onClick={() => setActiveRecovery('password')}
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
          </>
        )}

        {activeRecovery === 'id' && (
          <div
            style={{
              padding: '8px 0 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ color: '#d8dce5', fontWeight: 700, textAlign: 'center' }}>아이디 찾기</div>

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

            {idRecovery.verified && (
              <div style={{ color: '#5ce1e6', fontWeight: 700 }}>
                인증 완료! (실제 서비스에서는 이메일로 계정 조회 로직 필요)
              </div>
            )}

            {idRecovery.message && !idRecovery.verified && (
              <div style={{ color: '#f1b3b3', fontSize: '14px' }}>{idRecovery.message}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setActiveRecovery(null)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(92, 225, 230, 0.25)',
                  background: 'rgba(92, 225, 230, 0.12)',
                  color: '#d8f7ff',
                  cursor: 'pointer',
                }}
              >
                로그인으로 돌아가기
              </button>
            </div>
          </div>
        )}

        {activeRecovery === 'password' && (
          <div
            style={{
              padding: '8px 0 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ color: '#d8dce5', fontWeight: 700, textAlign: 'center' }}>비밀번호 찾기</div>

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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={passwordRecovery.sending}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'rgba(92, 225, 230, 0.15)',
                  color: '#5ce1e6',
                  fontWeight: 700,
                  cursor: passwordRecovery.sending ? 'not-allowed' : 'pointer',
                }}
              >
                {passwordRecovery.sending ? '메일 전송 중...' : '재설정 메일 보내기'}
              </button>

              {hasRecoverySession && (
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
                disabled={passwordRecovery.updating}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: hasRecoverySession
                    ? 'linear-gradient(135deg, #1f6feb, #5ce1e6)'
                    : 'rgba(92, 225, 230, 0.12)',
                  color: hasRecoverySession ? '#0a0c12' : '#8f96a3',
                  fontWeight: 700,
                  cursor: hasRecoverySession ? 'pointer' : 'not-allowed',
                  opacity: passwordRecovery.updating ? 0.8 : 1,
                }}
              >
                {passwordRecovery.updating ? '변경 중...' : '새 비밀번호 설정'}
              </button>

              {passwordRecovery.message && (
                <div style={{ color: hasRecoverySession ? '#5ce1e6' : '#f1b3b3', fontSize: '14px' }}>
                  {passwordRecovery.message}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setActiveRecovery(null)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(92, 225, 230, 0.25)',
                  background: 'rgba(92, 225, 230, 0.12)',
                  color: '#d8f7ff',
                  cursor: 'pointer',
                }}
              >
                로그인으로 돌아가기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}