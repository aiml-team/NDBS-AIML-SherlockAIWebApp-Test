import Header from '../layout/Header.jsx';
import UserMenu from '../auth/UserMenu.jsx';
import Hero from '../layout/Hero.jsx';
import AdminSidebar from './AdminSidebar.jsx';
import { AdminCountsProvider } from './AdminCountsContext.jsx';

export default function AdminLayout({ children, breadcrumb, heroTitle, heroSub, heroTrailing }) {
  const crumbs = [{ label: 'Admin', to: '/admin/users' }, ...(breadcrumb || [])];
  return (
    <AdminCountsProvider>
      <div className="min-h-screen bg-bg flex flex-col">
        <Header breadcrumb={crumbs} rightSlot={<UserMenu />} />
        {heroTitle && (
          <Hero compact variant="blank" title={heroTitle} sub={heroSub} trailing={heroTrailing} />
        )}
        <div className="flex-1 flex">
          <AdminSidebar />
          <main className="flex-1 min-w-0 page-fade">
            <div className="max-w-[1200px] mx-auto px-6 sm:px-8 py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AdminCountsProvider>
  );
}
