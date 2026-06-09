import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';

export default function PublicLayout() {
  const location = useLocation();
  const isCoachPortal = location.pathname === '/coach' || location.pathname.startsWith('/coach/');

  if (isCoachPortal) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
