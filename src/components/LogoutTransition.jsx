import {
  ArrowRight,
  Check,
  LockKeyhole,
  LogIn,
  ShieldCheck,
} from 'lucide-react'
import dengueLogo from '../assets/logodengue2.png'
import './logout-transition.css'

export default function LogoutTransition({ onReturnNow }) {
  return (
    <div
      className="dengue-logout-transition"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="dengue-logout-grid" aria-hidden="true" />
      <div className="dengue-logout-ambient dengue-logout-ambient-one" aria-hidden="true" />
      <div className="dengue-logout-ambient dengue-logout-ambient-two" aria-hidden="true" />
      <div className="dengue-logout-scanline" aria-hidden="true" />

      <main className="dengue-logout-shell">
        <section className="dengue-logout-card">
          <div className="dengue-logout-brand">
            <span className="dengue-logout-brand-mark">
              <img src={dengueLogo} alt="" />
            </span>
            <span>
              <small>SECURE ACCESS</small>
              <strong>Dengue Response System</strong>
            </span>
          </div>

          <div className="dengue-logout-orbital" aria-hidden="true">
            <span className="dengue-logout-ring ring-a" />
            <span className="dengue-logout-ring ring-b" />
            <span className="dengue-logout-ring ring-c" />
            <span className="dengue-logout-core">
              <ShieldCheck size={25} strokeWidth={1.8} />
            </span>
            <span className="dengue-logout-spark spark-a" />
            <span className="dengue-logout-spark spark-b" />
          </div>

          <div className="dengue-logout-kicker">SESSION TERMINATION PROTOCOL</div>
          <h1>Securing your workspace</h1>
          <p>
            The dengue monitoring system is closing the authenticated session,
            clearing browser-only workspace state, and returning this device to
            secure access.
          </p>

          <div className="dengue-logout-steps" aria-hidden="true">
            <span className="done">
              <i><Check size={12} strokeWidth={3} /></i>
              <em>Session revoked</em>
            </span>
            <span className="active">
              <i><LockKeyhole size={12} /></i>
              <em>Clearing workspace</em>
            </span>
            <span>
              <i><LogIn size={12} /></i>
              <em>Secure access</em>
            </span>
          </div>

          <div className="dengue-logout-progress" aria-hidden="true">
            <span />
          </div>

          <div className="dengue-logout-footer">
            <span>
              <ShieldCheck size={13} />
              Dengue data remains protected
            </span>
            <button type="button" onClick={onReturnNow}>
              Return now <ArrowRight size={13} />
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
