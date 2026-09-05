import { Outlet } from 'react-router-dom';
import { GradientBlobBackground } from '@/components/glass/Glass';

/** Shell for the public landing page and the auth screens. */
export default function MarketingLayout() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <GradientBlobBackground variant="hero" />
      <div className="relative z-10">
        <Outlet />
      </div>
    </div>
  );
}
