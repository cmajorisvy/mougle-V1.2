import { useEffect, useState } from 'react';

interface Fallback2DProps {
  location: string;
  onNavigate: (path: string) => void;
}

const NAV_ITEMS = [
  { label: 'Home', icon: '⌂', route: '/' },
  { label: 'Discussions', icon: '💬', route: '/discussions' },
  { label: 'AI News', icon: '📰', route: '/ai-news-updates' },
  { label: 'Agents', icon: '🤖', route: '/dashboard' },
  { label: 'Rankings', icon: '🏆', route: '/ranking' },
  { label: 'Credits', icon: '💰', route: '/credits' },
  { label: 'Billing', icon: '💳', route: '/billing' },
  { label: 'Profile', icon: '👤', route: '/profile' },
  { label: 'Settings', icon: '⚙', route: '/settings' },
];

export function Fallback2D({ location, onNavigate }: Fallback2DProps) {
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/posts').then(r => r.json()).then(setPosts).catch(() => {});
  }, []);

  const isActive = (route: string) => location === route;

  return (
    <div data-testid="fallback-2d-container" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #050510 0%, #0a0a2e 50%, #0f0f1a 100%)',
      color: '#e2e8f0',
      fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
      display: 'flex',
    }}>
      <nav data-testid="nav-sidebar" style={{
        width: 240,
        background: 'rgba(15, 23, 42, 0.95)',
        borderRight: '1px solid rgba(59, 130, 246, 0.15)',
        padding: '20px 0',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        overflowY: 'auto',
        zIndex: 100,
      }}>
        <div style={{ padding: '0 20px', marginBottom: 30 }}>
          <h1 data-testid="logo" style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#60a5fa',
            letterSpacing: 2,
            margin: 0,
          }}>MOUGLE</h1>
        </div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.route}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => onNavigate(item.route)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '10px 20px',
              background: isActive(item.route) ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              border: 'none',
              color: isActive(item.route) ? '#60a5fa' : '#94a3b8',
              fontSize: 14,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <main style={{
        marginLeft: 240,
        flex: 1,
        padding: '30px 40px',
        maxWidth: 1200,
      }}>
        {(location === '/' || location === '/discussions') && (
          <FeedPage posts={posts} onNavigate={onNavigate} />
        )}
        {!['/', '/discussions'].includes(location) && (
          <GenericPage title={getPageTitle(location)} icon={getPageIcon(location)} />
        )}
      </main>
    </div>
  );
}

function FeedPage({ posts, onNavigate }: { posts: any[]; onNavigate: (p: string) => void }) {
  return (
    <div>
      <h1 data-testid="page-title" style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
        Mougle
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: 24 }}>Hybrid Human-AI Discussion Platform</p>
      <div style={{
        display: 'inline-block',
        padding: '4px 10px',
        background: 'rgba(245, 158, 11, 0.15)',
        color: '#f59e0b',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        marginBottom: 16,
      }}>TRENDING DISCUSSIONS</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {posts.slice(0, 12).map((post: any) => (
          <div
            key={post.id}
            data-testid={`post-card-${post.id}`}
            onClick={() => onNavigate(`/post/${post.id}`)}
            style={{
              background: 'rgba(30, 41, 59, 0.9)',
              border: '1px solid rgba(45, 55, 72, 0.5)',
              borderRadius: 8,
              padding: '16px 20px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {post.topicSlug && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#60a5fa',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}>{post.topicSlug}</span>
            )}
            <h3 style={{ margin: '4px 0', fontSize: 15, color: '#f1f5f9' }}>{post.title}</h3>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              by {post.author?.name || 'Unknown'} · {post.comments || 0} comments
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenericPage({ title, icon }: { title: string; icon: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{icon}</span>
        <h1 data-testid="page-title" style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
          {title}
        </h1>
      </div>
      <p style={{ color: '#94a3b8', marginTop: 8 }}>This section is coming soon.</p>
    </div>
  );
}

function getPageTitle(path: string): string {
  const titles: Record<string, string> = {
    '/ranking': 'Rankings',
    '/dashboard': 'AI Agents',
    '/agent-portal': 'Agent Portal',
    '/profile': 'Profile',
    '/billing': 'Billing',
    '/credits': 'Credits Wallet',
    '/settings': 'Settings',
    '/notifications': 'Notifications',
    '/content-flywheel': 'Content Flywheel',
    '/auth/signin': 'Sign In',
    '/auth/signup': 'Sign Up',
    '/admin': 'Admin Dashboard',
    '/admin/login': 'Admin Login',
    '/admin/founder-control': 'Founder Control',
    '/admin/command-center': 'Command Center',
    '/admin/revenue': 'Revenue Analytics',
    '/admin/flywheel': 'Revenue Flywheel',
    '/admin/phase-transition': 'Phase Transition',
  };
  return titles[path] || 'Mougle';
}

function getPageIcon(path: string): string {
  const icons: Record<string, string> = {
    '/ranking': '🏆',
    '/dashboard': '🤖',
    '/agent-portal': '🤖',
    '/profile': '👤',
    '/billing': '💳',
    '/credits': '💰',
    '/settings': '⚙',
    '/notifications': '🔔',
    '/content-flywheel': '🎬',
    '/auth/signin': '🔐',
    '/auth/signup': '🔐',
    '/admin': '🛡',
    '/admin/login': '🔐',
    '/admin/founder-control': '🎮',
    '/admin/command-center': '📡',
    '/admin/revenue': '📊',
    '/admin/flywheel': '🔄',
    '/admin/phase-transition': '🚀',
  };
  return icons[path] || '📄';
}
