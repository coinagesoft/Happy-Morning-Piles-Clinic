'use client';

import React from 'react';
import Link from 'next/link';
import { IconArrowRight } from './AdminIcons';

interface AdminLoginViewProps {
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  isSubmittingLogin: boolean;
  isCheckingSession: boolean;
  loginError: string;
  onSubmit: (e: React.FormEvent) => void;
}

export default function AdminLoginView({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  isSubmittingLogin,
  isCheckingSession,
  loginError,
  onSubmit,
}: AdminLoginViewProps) {
  return (
    <div className="admin-login-screen">
      <div className="admin-login-card">
        <div className="admin-login-logo">
          <div className="clinic-symbol" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </div>
          <h2>Happy Morning Piles Clinic</h2>
          <p>Doctor &amp; Administrative Management Portal</p>
        </div>

        {loginError && (
          <div className="admin-alert alert-error admin-login-alert" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{loginError}</span>
          </div>
        )}

        {isCheckingSession ? (
          <div className="admin-session-checking">
            <div className="admin-session-spinner" aria-hidden="true" />
            <span>Verifying secure session credentials...</span>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="admin-login-form" noValidate>
            <div className="admin-field-group">
              <label htmlFor="admin-email">Admin Email Address</label>
              <div className="admin-input-wrapper">
                <span className="admin-input-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </span>
                <input
                  type="email"
                  id="admin-email"
                  autoComplete="username"
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="admin-auth-input"
                  required
                />
              </div>
            </div>

            <div className="admin-field-group">
              <label htmlFor="admin-password">Secure Password</label>
              <div className="admin-input-wrapper">
                <span className="admin-input-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="admin-password"
                  autoComplete="current-password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="admin-auth-input has-toggle"
                  required
                />
                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-login-submit"
              disabled={isSubmittingLogin}
            >
              {isSubmittingLogin ? (
                <span>Authenticating &amp; Issuing Tokens...</span>
              ) : (
                <>
                  <span>Sign In to Admin Portal</span>
                  <IconArrowRight />
                </>
              )}
            </button>
          </form>
        )}

        <div className="login-footer-link">
          <Link href="/">&#x2190; Return to Public Clinic Website</Link>
        </div>
      </div>
    </div>
  );
}

