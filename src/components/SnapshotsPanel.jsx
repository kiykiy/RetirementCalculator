import { useState, useEffect, useRef } from 'react'

const LS_KEY = 'endgame_snapshots_v1'

function loadSnapshots() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}

function saveSnapshots(snaps) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(snaps)) } catch {}
}

function fmtDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ── Hook exposed to parent ────────────────────────────────────────────────────
export function useSnapshots() {
  const [snapshots, setSnapshots] = useState(loadSnapshots)

  useEffect(() => { saveSnapshots(snapshots) }, [snapshots])

  function save(name, data) {
    const snap = {
      id:      crypto.randomUUID(),
      name:    name.trim() || `Snapshot ${new Date().toLocaleDateString()}`,
      savedAt: new Date().toISOString(),
      data,
    }
    setSnapshots(prev => [snap, ...prev])
  }

  function remove(id) {
    setSnapshots(prev => prev.filter(s => s.id !== id))
  }

  function rename(id, name) {
    setSnapshots(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }

  function hydrate(snaps) {
    if (Array.isArray(snaps) && snaps.length > 0) setSnapshots(snaps)
  }

  return { snapshots, save, remove, rename, hydrate }
}

// ── UI Panel ─────────────────────────────────────────────────────────────────
export default function SnapshotsPanel({ snapshots, onSave, onLoad, onDelete, onRename }) {
  const [open,    setOpen]    = useState(false)
  const [name,    setName]    = useState('')
  const [editing, setEditing] = useState(null) // id being renamed
  const [editVal, setEditVal] = useState('')
  const panelRef = useRef(null)
  const btnRef   = useRef(null)
  const inputRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleSave() {
    onSave(name)
    setName('')
  }

  function startEdit(snap) {
    setEditing(snap.id)
    setEditVal(snap.name)
  }

  function commitEdit(id) {
    if (editVal.trim()) onRename(id, editVal.trim())
    setEditing(null)
  }

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        title="Snapshots"
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          open
            ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300'
        }`}
      >
        {/* Bookmark icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
        </svg>
        {snapshots.length > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-violet-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold leading-none">
            {snapshots.length > 9 ? '9+' : snapshots.length}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-10 z-50 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">Saved Snapshots</p>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Save new */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">Save current plan as a named snapshot</p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="Snapshot name…"
                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                Save
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
            {snapshots.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No snapshots yet</p>
            ) : (
              snapshots.map(snap => (
                <div key={snap.id} className="px-4 py-2.5 flex items-center gap-2 group hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                  <div className="flex-1 min-w-0">
                    {editing === snap.id ? (
                      <input
                        autoFocus
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => commitEdit(snap.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(snap.id); if (e.key === 'Escape') setEditing(null) }}
                        className="w-full text-xs px-1.5 py-0.5 rounded border border-violet-300 dark:border-violet-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => startEdit(snap)}
                        className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate block w-full text-left hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                        title="Click to rename"
                      >
                        {snap.name}
                      </button>
                    )}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{fmtDate(snap.savedAt)}</p>
                  </div>
                  <button
                    onClick={() => { onLoad(snap.data); setOpen(false) }}
                    className="text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => onDelete(snap.id)}
                    className="text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete snapshot"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
