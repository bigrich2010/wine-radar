import { Routes, Route, NavLink } from 'react-router-dom'
import Newsletter from './pages/Newsletter.jsx'
import Archive from './pages/Archive.jsx'
import Sources from './pages/Sources.jsx'

export default function App() {
  return (
    <div className="app">
      <header className="topbar no-print">
        <h1>🍷 Wine Radar</h1>
        <nav>
          <NavLink to="/" end className={({isActive}) => isActive ? 'active' : ''}>Latest</NavLink>
          <NavLink to="/archive" className={({isActive}) => isActive ? 'active' : ''}>Archive</NavLink>
          <NavLink to="/sources" className={({isActive}) => isActive ? 'active' : ''}>Sources</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Newsletter />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/sources" element={<Sources />} />
        </Routes>
      </main>
    </div>
  )
}
