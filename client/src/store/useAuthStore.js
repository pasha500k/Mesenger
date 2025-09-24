import { create } from 'zustand';
import { apiRequest } from '../api';

export const useAuthStore = create((set) => ({
  user: null,
  status: 'idle',
  error: null,
  async checkAuth() {
    set({ status: 'loading', error: null });
    try {
      const data = await apiRequest('/api/auth/me', { method: 'GET' });
      set({ user: data, status: 'authenticated' });
    } catch (error) {
      set({ user: null, status: 'unauthenticated', error: error.message });
    }
  },
  async login(credentials) {
    set({ status: 'loading', error: null });
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      set({ user: data, status: 'authenticated', error: null });
    } catch (error) {
      set({ error: error.message, status: 'unauthenticated' });
      throw error;
    }
  },
  async register(credentials) {
    set({ status: 'loading', error: null });
    try {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      set({ user: data, status: 'authenticated', error: null });
    } catch (error) {
      set({ error: error.message, status: 'unauthenticated' });
      throw error;
    }
  },
  async logout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error(error);
    }
    set({ user: null, status: 'unauthenticated', error: null });
  },
}));
