import { Outlet } from 'react-router-dom';
import { GradientBlobBackground } from '@/components/glass/Glass';

/**
 * Shell for the public landing page and the auth screens.
 *
 * NOTE: `overflow-x-clip`, not `overflow-x-hidden`. `overflow-x: hidden` forces
 * the computed `overflow-y` from `visible` to `auto`, which turns this div into
 * a scroll container — and that breaks `position: sticky` on the landing nav,
 * because sticky would then anchor to this unscrollable container instead of
 * the viewport. `clip` clips the same overflow without creating a scroll box.
 */
export default function MarketingLayout() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <GradientBlobBackground variant="hero" />
      <div className="relative z-10">
        <Outlet />
      </div>
    </div>
  );
}
