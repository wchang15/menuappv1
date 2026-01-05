'use client';

import Image from 'next/image';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clearCurrentUser, setCurrentUser } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';

const INITIAL_LOGIN_FORM = { id: '', password: '' };
const INITIAL_SIGNUP_FORM = { email: '', password: '', confirm: '', otp: '' };
const INITIAL_OTP_STATE = { sending: false, sent: false, verifying: false, verified: false };
const INITIAL_PASSWORD_RECOVERY = { email: '', newPassword: '', message: '', sending: false, updating: false };

export default function LoginPage() {
  const router = useRouter();

  const [form, setForm] = useState(INITIAL_LOGIN_FORM);

  const [signUpForm, setSignUpForm] = useState(INITIAL_SIGNUP_FORM);

  const [activeView, setActiveView] = useState('login');
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  // ✅ 로그인 메시지/로딩
  const [loginMessage, setLoginMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // ✅ 회원가입 메시지/로딩
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signUpMessage, setSignUpMessage] = useState('');

  // ✅ OTP 상태
  const [otpState, setOtpState] = useState(INITIAL_OTP_STATE);

  // ✅ 비밀번호 찾기/재설정 상태
  const [passwordRecovery, setPasswordRecovery] = useState(INITIAL_PASSWORD_RECOVERY);

  const resetAllFields = useCallback(() => {
    setForm(INITIAL_LOGIN_FORM);
    setSignUpForm(INITIAL_SIGNUP_FORM);
    setOtpState(INITIAL_OTP_STATE);
    setPasswordRecovery(INITIAL_PASSWORD_RECOVERY);
    setLoginMessage('');
    setSignUpMessage('');
    setHasRecoverySession(false);
  }, []);

  const switchView = useCallback(
    (view) => {
      resetAllFields();
      setActiveView(view);
    },
    [resetAllFields]
  );

  // ✅ Supabase password recovery 링크로 돌아온 경우 해시 파싱
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
              setActiveView('password');
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

  // ✅ 로그인 페이지 접근 시 세션/입력값 초기화
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      return;
    }

    supabase.auth
      .signOut()
      .catch(() => {})
      .finally(() => {
        clearCurrentUser();
        resetAllFields();
        setActiveView('login');
      });
  }, [resetAllFields]);

  // ✅ auth listener
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id) setCurrentUser(session.user.id);

      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        setHasRecoverySession(true);
        setActiveView('password');
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ✅✅✅ 로그인 (email/password)
  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoginMessage('');
    setIsLoggingIn(true);

    try {
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

      const user = data?.user;
      if (user?.id) setCurrentUser(user.id);

      router.push('/intro');
    } catch {
      setLoginMessage('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * ✅ 회원가입 완료 버튼 동작
   * - 이메일 OTP 인증(verifyOtp) 성공 → 세션 생성 이후
   * - updateUser({password})로 비번을 세팅하면 "이메일 인증 + 비밀번호 설정" 완료
   */
  const handleSignUp = async (event) => {
    event.preventDefault();
    setSignUpMessage('');

    if (!signUpForm.email || !signUpForm.password || !signUpForm.confirm) {
      setSignUpMessage('모든 필드를 입력해 주세요.');
      return;
    }

    if (!otpState.verified) {
      setSignUpMessage('이메일 인증을 완료해 주세요.');
      return;
    }

    if (signUpForm.password !== signUpForm.confirm) {
      setSignUpMessage('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsSigningUp(true);

    try {
      const { data, error } = await supabase.auth.updateUser({ password: signUpForm.password });

      if (error) {
        setSignUpMessage(error.message);
        return;
      }

      if (data?.user?.id) setCurrentUser(data.user.id);

      setSignUpMessage('회원가입이 완료되었습니다!');
      router.push('/intro');
    } catch {
      setSignUpMessage('회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsSigningUp(false);
    }
  };

  /**
   * ✅ 이메일 OTP 보내기
   * - Supabase 설정이 8자리면 8자리로 옴 (앱에서 8자리 받도록 변경)
   */
  const handleSendEmailOtp = async () => {
    setSignUpMessage('');

    const email = (signUpForm.email || '').trim();
    if (!email) {
      setSignUpMessage('이메일을 입력해 주세요.');
      return;
    }

    setOtpState((prev) => ({
      ...prev,
      sending: true,
      sent: false,
      verifying: false,
      verified: false,
    }));

    try {
      const { error: existingUserError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
        },
      });

      if (!existingUserError) {
        setSignUpMessage('이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.');
        setOtpState((prev) => ({ ...prev, sending: false, sent: false }));
        return;
      }

      const notFound = (existingUserError.message || '').toLowerCase().includes('not found');
      if (!notFound) {
        setSignUpMessage(existingUserError.message);
        setOtpState((prev) => ({ ...prev, sending: false, sent: false }));
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        setSignUpMessage(error.message);
        setOtpState((prev) => ({ ...prev, sending: false, sent: false }));
        return;
      }

      setOtpState((prev) => ({ ...prev, sending: false, sent: true }));
      setSignUpMessage('이메일로 8자리 인증번호를 보냈습니다. 받은 번호를 입력해 주세요.');
    } catch {
      setSignUpMessage('인증 메일 전송 중 오류가 발생했습니다.');
      setOtpState((prev) => ({ ...prev, sending: false, sent: false }));
    }
  };

  /**
   * ✅ 이메일 OTP 검증 (8자리)
   */
  const handleVerifyEmailOtp = async () => {
    setSignUpMessage('');

    const email = (signUpForm.email || '').trim();
    const token = (signUpForm.otp || '').trim();

    if (!email) {
      setSignUpMessage('이메일을 입력해 주세요.');
      return;
    }

    if (!token) {
      setSignUpMessage('이메일로 받은 인증번호를 입력해 주세요.');
      return;
    }

    // ✅ 8자리 숫자만
    if (!/^\d{8}$/.test(token)) {
      setSignUpMessage('인증번호는 8자리 숫자여야 합니다.');
      return;
    }

    setOtpState((prev) => ({ ...prev, verifying: true }));

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });

      if (error) {
        setSignUpMessage(error.message);
        setOtpState((prev) => ({ ...prev, verifying: false, verified: false }));
        return;
      }

      if (data?.session?.user?.id) {
        setCurrentUser(data.session.user.id);
      }

      setOtpState((prev) => ({ ...prev, verifying: false, verified: true }));
      setSignUpMessage('이메일 인증 완료! 비밀번호를 설정해 회원가입을 마무리해 주세요.');
    } catch {
      setSignUpMessage('인증 중 오류가 발생했습니다.');
      setOtpState((prev) => ({ ...prev, verifying: false, verified: false }));
    }
  };

  // ✅ 비밀번호 재설정 메일 발송
  const handleSendPasswordReset = async () => {
    const email = (passwordRecovery.email || '').trim();
    if (!email) {
      setPasswordRecovery((prev) => ({ ...prev, message: '이메일을 입력해 주세요.' }));
      return;
    }

    setPasswordRecovery((prev) => ({ ...prev, sending: true, message: '' }));

    try {
      const redirectTo = `${window.location.origin}/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      const notFound = (error?.message || '').toLowerCase().includes('not found');

      setPasswordRecovery((prev) => ({
        ...prev,
        sending: false,
        message: error
          ? notFound
            ? '가입되지 않은 이메일입니다.'
            : error.message
          : '비밀번호 재설정 링크를 이메일로 전송했습니다. 메일을 확인해 주세요.',
      }));
    } catch {
      setPasswordRecovery((prev) => ({
        ...prev,
        sending: false,
        message: '메일 전송 중 오류가 발생했습니다.',
      }));
    }
  };

  // ✅ 비밀번호 재설정 (recovery 세션에서만 가능)
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
      setPasswordRecovery((prev) => ({ ...prev, message: '새 비밀번호를 입력해 주세요.' }));
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
    } catch {
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

        {activeView === 'login' && (
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

              <div>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  style={{
                    width: '100%',
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
                    boxShadow: isLoggingIn ? 'none' : '0 8px 20px rgba(31, 111, 235, 0.35)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    opacity: isLoggingIn ? 0.85 : 1,
                  }}
                >
                  {isLoggingIn ? '로그인 중...' : '로그인'}
                </button>
              </div>

              {!!loginMessage && (
                <div style={{ marginTop: '6px', color: '#f1b3b3', fontSize: '14px' }}>{loginMessage}</div>
              )}
            </form>

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
                onClick={() => switchView('signup')}
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
                회원가입
              </button>
              <span aria-hidden="true">|</span>
              <button
                type="button"
                onClick={() => switchView('password')}
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

        {activeView === 'signup' && (
          <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ color: '#d8dce5', fontWeight: 700, textAlign: 'center' }}>회원가입</div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
              이메일
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  value={signUpForm.email}
                  onChange={(event) => {
                    const nextEmail = event.target.value;
                    setSignUpForm((prev) => ({ ...prev, email: nextEmail }));
                    setOtpState((prev) => ({ ...prev, sent: false, verifying: false, verified: false }));
                    setSignUpMessage('');
                  }}
                  placeholder="이메일을 입력하세요"
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #242938',
                    background: 'rgba(13, 15, 24, 0.85)',
                    color: '#f4f4f4',
                    outline: 'none',
                    fontSize: '15px',
                    flex: 1,
                  }}
                />
                <button
                  type="button"
                  onClick={handleSendEmailOtp}
                  disabled={otpState.sending}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(92, 225, 230, 0.35)',
                    background: otpState.sending ? 'rgba(92, 225, 230, 0.15)' : 'rgba(92, 225, 230, 0.25)',
                    color: '#0a0c12',
                    fontWeight: 700,
                    cursor: otpState.sending ? 'not-allowed' : 'pointer',
                    minWidth: '120px',
                  }}
                >
                  {otpState.sending ? '발송 중...' : '인증 보내기'}
                </button>
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
              이메일 인증번호
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={signUpForm.otp}
                  onChange={(event) => {
                    const v = event.target.value.replace(/\D/g, '').slice(0, 8);
                    setSignUpForm((prev) => ({ ...prev, otp: v }));
                  }}
                  placeholder="이메일로 받은 8자리 코드를 입력하세요"
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #242938',
                    background: 'rgba(13, 15, 24, 0.85)',
                    color: '#f4f4f4',
                    outline: 'none',
                    fontSize: '15px',
                    flex: 1,
                  }}
                />
                <button
                  type="button"
                  onClick={handleVerifyEmailOtp}
                  disabled={!otpState.sent || otpState.verifying}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(92, 225, 230, 0.35)',
                    background: otpState.verifying ? 'rgba(92, 225, 230, 0.15)' : 'rgba(92, 225, 230, 0.25)',
                    color: otpState.sent ? '#0a0c12' : '#8f96a3',
                    fontWeight: 700,
                    cursor: !otpState.sent || otpState.verifying ? 'not-allowed' : 'pointer',
                    minWidth: '120px',
                  }}
                >
                  {otpState.verifying ? '확인 중...' : '인증 확인'}
                </button>
              </div>
              {otpState.verified && (
                <div style={{ color: '#5ce1e6', fontSize: '13px' }}>이메일 인증이 완료되었습니다.</div>
              )}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
              비밀번호
              <input
                type="password"
                value={signUpForm.password}
                onChange={(event) => setSignUpForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="비밀번호를 입력하세요"
                disabled={!otpState.verified}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #242938',
                  background: 'rgba(13, 15, 24, 0.85)',
                  color: '#f4f4f4',
                  outline: 'none',
                  fontSize: '15px',
                  opacity: otpState.verified ? 1 : 0.6,
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#d8dce5' }}>
              비밀번호 확인
              <input
                type="password"
                value={signUpForm.confirm}
                onChange={(event) => setSignUpForm((prev) => ({ ...prev, confirm: event.target.value }))}
                placeholder="비밀번호를 다시 입력하세요"
                disabled={!otpState.verified}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #242938',
                  background: 'rgba(13, 15, 24, 0.85)',
                  color: '#f4f4f4',
                  outline: 'none',
                  fontSize: '15px',
                  opacity: otpState.verified ? 1 : 0.6,
                }}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={handleSignUp}
                disabled={isSigningUp || !otpState.verified}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background:
                    isSigningUp || !otpState.verified
                      ? 'rgba(92, 225, 230, 0.18)'
                      : 'linear-gradient(135deg, #1f6feb, #5ce1e6)',
                  color: isSigningUp || !otpState.verified ? '#8f96a3' : '#0a0c12',
                  fontWeight: 800,
                  fontSize: '16px',
                  cursor: isSigningUp || !otpState.verified ? 'not-allowed' : 'pointer',
                  boxShadow: isSigningUp || !otpState.verified ? 'none' : '0 8px 20px rgba(31, 111, 235, 0.35)',
                  opacity: isSigningUp || !otpState.verified ? 0.85 : 1,
                }}
              >
                {isSigningUp ? '가입 중...' : '회원가입'}
              </button>

              {!!signUpMessage && (
                <div style={{ marginTop: '6px', color: '#f1b3b3', fontSize: '14px' }}>{signUpMessage}</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => switchView('login')}
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

        {activeView === 'password' && (
          <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                onClick={() => switchView('login')}
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