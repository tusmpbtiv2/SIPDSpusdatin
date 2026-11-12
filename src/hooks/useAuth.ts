import { useState, useEffect } from 'react';
import { AuthUser, AdminUser, ParentUser, AdminRole } from '../types';
import { getSession, subscribeAuth, loginAdmin as apiLoginAdmin, loginParent as apiLoginParent, logout as apiLogout, changeParentPassword as apiChangeParentPassword, AuthSession } from '../services/authService';

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(getSession());
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribeAuth(newSession => {
      setSession(newSession);
    });
    return unsubscribe;
  }, []);

  const user = session?.user || null;
  const isAuthenticated = Boolean(session && session.user);
  const isAdmin = user?.type === 'admin';
  const isParent = user?.type === 'parent';
  const role: AdminRole | null = isAdmin ? (user as AdminUser).role : null;

  const loginAdmin = async (identifier: string, pass: string) => {
    setIsLoading(true);
    try {
      const admin = await apiLoginAdmin(identifier, pass);
      return admin;
    } finally {
      setIsLoading(false);
    }
  };

  const loginParent = async (nisn: string, pass: string) => {
    setIsLoading(true);
    try {
      const parent = await apiLoginParent(nisn, pass);
      return parent;
    } finally {
      setIsLoading(false);
    }
  };

  const changeParentPassword = async (oldPass: string, newPass: string) => {
    if (!isParent || !(user as ParentUser)?.nisn) {
      throw new Error('Hanya akun orang tua terautentikasi yang dapat mengubah password ini.');
    }
    return apiChangeParentPassword((user as ParentUser).nisn, oldPass, newPass);
  };

  const logout = () => {
    apiLogout();
  };

  return {
    user,
    adminUser: isAdmin ? (user as AdminUser) : null,
    parentUser: isParent ? (user as ParentUser) : null,
    token: session?.token || null,
    isAuthenticated,
    isAdmin,
    isParent,
    role,
    isLoading,
    loginAdmin,
    loginParent,
    changeParentPassword,
    logout,
  };
}
