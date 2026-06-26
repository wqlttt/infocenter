import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: () => import('@/views/LoginView.vue') },
    {
      path: '/admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { role: 'admin' },
    },
    {
      path: '/leader',
      component: () => import('@/views/LeaderView.vue'),
      meta: { role: 'leader' },
    },
    {
      path: '/member',
      component: () => import('@/views/MemberView.vue'),
      meta: { role: 'member' },
    },
    {
      path: '/approvals/team-join',
      component: () => import('@/views/TeamJoinApprovalView.vue'),
      meta: { roles: ['admin', 'leader'] },
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.path === '/login') {
    return true;
  }

  const auth = useAuthStore();
  const ok = auth.profile ? true : await auth.initFromSession();
  if (!ok) return '/login';

  const requiredRoles = to.meta.roles as string[] | undefined;
  const requiredRole = to.meta.role as string | undefined;
  if (requiredRoles?.length && !requiredRoles.includes(auth.profile?.role ?? '')) {
    return '/login';
  }
  if (requiredRole && auth.profile?.role !== requiredRole) {
    return '/login';
  }
  return true;
});

export default router;
