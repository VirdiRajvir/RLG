// application/frontend/src/explore/conditions.js
//
// Plain-English label + border color per A2A speaker condition. Colors are
// copied verbatim from paper/scripts/style.py's COLORS/CLAUDE_SHADES
// — the same hex values used for these conditions in the paper's own
// figures — kept as a local literal here since this is presentation only,
// not something the Python pipeline needs to know about.
export const CONDITION_INFO = {
  claude_uncapped: { label: 'Claude, speaking freely', color: '#D97757' },
  claude_capped: { label: 'Claude, short instructions only', color: '#F0A97A' },
  claude_no_thinking: { label: 'Claude, thinking turned off', color: '#8C4A2F' },
  claude_element_cap: { label: 'Claude, 4 elements per turn max', color: '#C2410C' },
  claude_human_style: { label: 'Claude, human-style few-shot', color: '#7A3B12' },
  claude_human_style_no_numbers: { label: 'Claude, human-style + no exact numbers', color: '#4A1D0A' },
  gemini: { label: 'Gemini', color: '#3B7DD8' },
  qwen: { label: 'Qwen', color: '#2FA35B' },
}

export const BASE_A2A_CONDITIONS = ['claude_uncapped', 'gemini', 'qwen']
export const CLAUDE_ABLATION_CONDITIONS = Object.keys(CONDITION_INFO).filter((c) => c.startsWith('claude_'))
