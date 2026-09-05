import { Building2, Moon, Sun } from 'lucide-react'
import './government.css'

const modes = [
  {
    id: 'light',
    label: 'Light',
    shortLabel: 'Light',
    icon: Sun,
    description: 'Original light interface',
  },
  {
    id: 'dark',
    label: 'Dark',
    shortLabel: 'Dark',
    icon: Moon,
    description: 'Original dark interface',
  },
  {
    id: 'government',
    label: 'Government',
    shortLabel: 'Gov',
    icon: Building2,
    description: 'Institutional public-health interface',
  },
]

export default function GovernmentAppearanceSwitch({
  mode = 'light',
  onChange,
  compact = false,
  className = '',
}) {
  return (
    <div
      className={`gov-appearance-switch ${compact ? 'gov-appearance-switch--compact' : ''} ${className}`.trim()}
      role="group"
      aria-label="Interface appearance"
    >
      {modes.map((item) => {
        const Icon = item.icon
        const selected = mode === item.id

        return (
          <button
            key={item.id}
            type="button"
            className={`gov-appearance-option ${selected ? 'is-selected' : ''}`}
            aria-pressed={selected}
            aria-label={`${item.label} interface`}
            title={item.description}
            onClick={() => onChange?.(item.id)}
          >
            <Icon aria-hidden="true" />
            <span>{compact ? item.shortLabel : item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
