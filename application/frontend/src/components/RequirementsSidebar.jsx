import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import './RequirementsSidebar.css'

/**
 * RequirementsSidebar
 *
 * Props:
 *   requirements  – { text: string, satisfied: boolean }[]
 *   onChange      – (newList) => void
 */
function RequirementsSidebar({ requirements = [], onChange }) {
  const [draft,    setDraft]    = useState('')
  const [editIdx,  setEditIdx]  = useState(null)
  const [editText, setEditText] = useState('')

  // ── Add ────────────────────────────────────────────────
  const handleAdd = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...requirements, { text: trimmed, satisfied: false }])
    setDraft('')
  }

  const handleDraftKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() }
  }

  // ── Toggle satisfied ───────────────────────────────────
  const handleToggle = (idx) => {
    const next = requirements.map((r, i) =>
      i === idx ? { ...r, satisfied: !r.satisfied } : r
    )
    onChange(next)
  }

  // ── Edit ───────────────────────────────────────────────
  const startEdit = (idx) => {
    setEditIdx(idx)
    setEditText(requirements[idx].text)
  }

  const commitEdit = () => {
    if (editText.trim()) {
      const next = requirements.map((r, i) =>
        i === editIdx ? { ...r, text: editText.trim() } : r
      )
      onChange(next)
    }
    setEditIdx(null)
    setEditText('')
  }

  const cancelEdit = () => { setEditIdx(null); setEditText('') }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') cancelEdit()
  }

  // ── Delete ─────────────────────────────────────────────
  const handleDelete = (idx) => {
    onChange(requirements.filter((_, i) => i !== idx))
  }

  const satisfiedCount = requirements.filter(r => r.satisfied).length

  return (
    <div className="req-sidebar">
      <div className="req-sidebar-header">
        <span className="req-sidebar-title">Requirements</span>
        <span className="req-count-badge">{requirements.length}</span>
        {requirements.length > 0 && (
          <span className="req-satisfied-badge" title="Satisfied / Total">
            {satisfiedCount}/{requirements.length} satisfied
          </span>
        )}
      </div>

      <p className="req-sidebar-hint">
        Requirements are injected into every prompt. Toggle satisfied when the output meets them.
      </p>

      {/* List */}
      <ul className="req-list">
        {requirements.length === 0 && (
          <li className="req-empty">No requirements yet.</li>
        )}
        {requirements.map((req, idx) => (
          <li key={idx} className={`req-item ${req.satisfied ? 'is-satisfied' : ''}`}>
            {editIdx === idx ? (
              <div className="req-edit-row">
                <textarea
                  className="req-edit-input"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  autoFocus
                  rows={2}
                />
                <div className="req-edit-actions">
                  <button className="req-icon-btn confirm" onClick={commitEdit} title="Save">
                    <Check size={13} />
                  </button>
                  <button className="req-icon-btn cancel" onClick={cancelEdit} title="Cancel">
                    <X size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="req-view-row">
                {/* Satisfied toggle */}
                <button
                  className={`req-toggle ${req.satisfied ? 'satisfied' : 'unsatisfied'}`}
                  onClick={() => handleToggle(idx)}
                  title={req.satisfied ? 'Mark unsatisfied' : 'Mark satisfied'}
                  type="button"
                >
                  {req.satisfied ? <Check size={11} /> : <span className="req-toggle-dot" />}
                </button>

                <span className="req-number">{idx + 1}.</span>
                <span className="req-text">{req.text}</span>

                <div className="req-actions">
                  <button className="req-icon-btn edit" onClick={() => startEdit(idx)} title="Edit">
                    <Pencil size={12} />
                  </button>
                  <button className="req-icon-btn delete" onClick={() => handleDelete(idx)} title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Add new */}
      <div className="req-add-row">
        <textarea
          className="req-add-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleDraftKeyDown}
          placeholder="Add a requirement…"
          rows={2}
        />
        <button
          className="req-add-btn"
          onClick={handleAdd}
          disabled={!draft.trim()}
          title="Add requirement"
          type="button"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

export default RequirementsSidebar