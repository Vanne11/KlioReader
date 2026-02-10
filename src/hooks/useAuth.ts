import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useSharesStore } from '@/stores/sharesStore';
import { useUIStore } from '@/stores/uiStore';
import { useCloudBooks } from './useCloudBooks';

export function useAuth() {
  const {
    authUser, setAuthUser, authMode, setAuthError, setAuthLoading,
    setShowProfile, setProfile, setProfileForm, profileForm, profile,
    setShowDeleteConfirm,
  } = useAuthStore();
  const { setCloudBooks, setCloudBooksReady } = useCloudStore();
  const { setPendingSharesCount, setPendingShares, setSharedProgressMap } = useSharesStore();
  const { showAlert } = useUIStore();
  const { loadCloudBooks } = useCloudBooks();

  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      let user: api.AuthUser;
      if (authMode === 'register') {
        user = await api.register(
          form.get('username') as string,
          form.get('email') as string,
          form.get('password') as string,
        );
      } else {
        user = await api.login(
          form.get('login') as string,
          form.get('password') as string,
        );
      }
      setAuthUser(user);
      loadCloudBooks();
    } catch (err: any) {
      setAuthError(err.message || 'Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    api.clearAuth();
    setAuthUser(null);
    setCloudBooks([]);
    setCloudBooksReady(false);
    setPendingSharesCount(0);
    setPendingShares([]);
    setSharedProgressMap({});
    // Limpiar caché de libros en la nube
    useCloudStore.getState().clearCloudCache();
  }

  async function loadProfile(openModal = true) {
    try {
      const p = await api.getProfile();
      setProfile(p);
      setProfileForm({ username: p.username, email: p.email, password: '' });
      if (openModal) setShowProfile(true);
    } catch (err: any) {
      if (openModal) showAlert('error', 'Error', err.message || 'No se pudo cargar el perfil');
    }
  }

  async function saveProfile() {
    const data: Record<string, string> = {};
    if (profileForm.username && profileForm.username !== profile?.username) data.username = profileForm.username;
    if (profileForm.email && profileForm.email !== profile?.email) data.email = profileForm.email;
    if (profileForm.password) data.password = profileForm.password;
    if (Object.keys(data).length === 0) { setShowProfile(false); return; }
    try {
      await api.updateProfile(data);
      if (data.username || data.email) {
        const updated = { ...authUser!, ...data };
        setAuthUser(updated);
        localStorage.setItem("authUser", JSON.stringify(updated));
      }
      setShowProfile(false);
      showAlert('success', 'Perfil actualizado', 'Tu perfil se actualizó correctamente');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo actualizar el perfil');
    }
  }

  async function handleDeleteAccount() {
    try {
      await api.deleteAccount();
      api.clearAuth();
      setAuthUser(null);
      setCloudBooks([]);
      setPendingSharesCount(0);
      setPendingShares([]);
      setSharedProgressMap({});
      setShowDeleteConfirm(false);
      showAlert('success', 'Cuenta eliminada', 'Tu cuenta y todos tus datos fueron eliminados permanentemente');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo eliminar la cuenta');
    }
  }

  return { handleAuth, handleLogout, loadProfile, saveProfile, handleDeleteAccount };
}
