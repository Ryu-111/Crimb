import { lazy, Suspense } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { DraftProvider } from './lib/draft'
import Home from './routes/Home'
import NewSession from './routes/NewSession'
import { DraftResult, SavedResult } from './routes/Result'
import Growth from './routes/Growth'
import Settings from './routes/Settings'
import Problem from './routes/Problem'

// 姿勢推定ライブラリは解析画面でだけ読み込む
const Analyze = lazy(() => import('./routes/Analyze'))

const tabs = [
  { to: '/', label: '履歴', icon: '📋' },
  { to: '/new', label: '解析', icon: '🎥' },
  { to: '/growth', label: '成長', icon: '📈' },
  { to: '/settings', label: '設定', icon: '⚙️' },
]

export default function App() {
  return (
    <HashRouter>
      <DraftProvider>
        <div className="mx-auto flex h-full max-w-xl flex-col">
          <main className="flex-1 overflow-y-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/new" element={<NewSession />} />
              <Route
                path="/analyze"
                element={
                  <Suspense fallback={<p className="text-slate-400">読み込み中…</p>}>
                    <Analyze />
                  </Suspense>
                }
              />
              <Route path="/result" element={<DraftResult />} />
              <Route path="/session/:id" element={<SavedResult />} />
              <Route path="/problem/:name" element={<Problem />} />
              <Route path="/growth" element={<Growth />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
          <nav className="grid grid-cols-4 border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)]">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'text-accent' : 'text-slate-400'}`
                }
              >
                <span className="text-xl" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </DraftProvider>
    </HashRouter>
  )
}
