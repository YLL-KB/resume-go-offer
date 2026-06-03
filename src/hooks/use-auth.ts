/**
 * 认证 Hook — 客户端组件中使用
 *
 * 调用 GET /api/auth/me 获取当前登录状态。
 */

"use client";

import { useState, useEffect, useCallback } from "react";

interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  phone?: string | null;
  wechatOpenid?: string | null;
  alipayUserId?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isSignedIn: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isSignedIn: false,
  });

  const refresh = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true }));
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) =>
        setState({
          user: data.user,
          isLoading: false,
          isSignedIn: data.isSignedIn ?? false,
        }),
      )
      .catch(() =>
        setState({ user: null, isLoading: false, isSignedIn: false }),
      );
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) =>
        setState({
          user: data.user,
          isLoading: false,
          isSignedIn: data.isSignedIn ?? false,
        }),
      )
      .catch(() =>
        setState({ user: null, isLoading: false, isSignedIn: false }),
      );
  }, []);

  return { ...state, refresh };
}
