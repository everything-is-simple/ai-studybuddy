import { Link, useLocation } from 'react-router-dom';

type NavigationItem = {
  key: 'home' | 'courses' | 'semesters' | 'materials' | 'settings';
  to: string;
  label: string;
};

const NAV_ITEMS: NavigationItem[] = [
  { key: 'home', to: '/', label: '今日' },
  { key: 'courses', to: '/courses', label: '课程' },
  { key: 'semesters', to: '/semesters', label: '学期' },
  { key: 'materials', to: '/materials', label: '资料' },
  { key: 'settings', to: '/settings', label: '设置' },
];

const MOBILE_PRIMARY_KEYS = new Set<NavigationItem['key']>(['home', 'courses', 'materials']);

function activeKey(pathname: string): NavigationItem['key'] {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/semesters')) return 'semesters';
  if (pathname.startsWith('/materials') || pathname.startsWith('/notes')) return 'materials';
  if (pathname.startsWith('/settings')) return 'settings';
  if (
    pathname.startsWith('/courses') ||
    pathname.startsWith('/exams') ||
    pathname.startsWith('/practice-sessions') ||
    pathname.startsWith('/mistakes')
  ) {
    return 'courses';
  }
  return 'home';
}

function NavigationLink({ item, current }: { item: NavigationItem; current: NavigationItem['key'] }) {
  const isCurrent = current === item.key;
  return (
    <Link to={item.to} className={isCurrent ? 'active' : undefined} aria-current={isCurrent ? 'page' : undefined}>
      {item.label}
    </Link>
  );
}

export function AppNavigation() {
  const location = useLocation();
  const current = activeKey(location.pathname);
  const primaryItems = NAV_ITEMS.filter((item) => MOBILE_PRIMARY_KEYS.has(item.key));
  const secondaryItems = NAV_ITEMS.filter((item) => !MOBILE_PRIMARY_KEYS.has(item.key));

  return (
    <nav className="app-navigation global-navigation" aria-label="全局导航" data-testid="global-navigation">
      <div className="global-navigation-desktop" data-testid="desktop-global-navigation">
        {NAV_ITEMS.map((item) => (
          <NavigationLink key={item.key} item={item} current={current} />
        ))}
      </div>
      <div className="global-navigation-mobile" data-testid="mobile-bottom-navigation">
        {primaryItems.map((item) => (
          <NavigationLink key={item.key} item={item} current={current} />
        ))}
        <details className="mobile-more-navigation" data-testid="mobile-more-navigation" open={secondaryItems.some((item) => item.key === current)}>
          <summary>更多</summary>
          <div className="mobile-more-panel">
            {secondaryItems.map((item) => (
              <NavigationLink key={item.key} item={item} current={current} />
            ))}
          </div>
        </details>
      </div>
    </nav>
  );
}
