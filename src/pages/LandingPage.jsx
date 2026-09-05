import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  MapPinned,
  Mail,
  Menu,
  Phone,
  Send,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
} from 'lucide-react'
import dengueBackground from '../assets/denguebg.png'
import reoImage from '../assets/reo.png'
import tyronImage from '../assets/tyron.png'
import { getPublicSystemSummary } from '../services/api'
import './landing-page.css'

const capabilities = [
  {
    title: 'Dengue Monitoring',
    description:
      'Review reported dengue activity, historical patterns, barangay trends, and city-wide situation summaries from one workspace.',
    icon: Activity,
  },
  {
    title: 'Risk Forecasting',
    description:
      'Use integrated historical and environmental information to estimate expected dengue activity and barangay risk.',
    icon: BarChart3,
  },
  {
    title: 'GIS Risk Mapping',
    description:
      'View barangay-level risk spatially so health teams can recognize priority areas and nearby elevated activity.',
    icon: MapPinned,
  },
  {
    title: 'Barangay Workspace',
    description:
      'Give barangay health workers a focused view of local conditions, recommended response actions, and field updates.',
    icon: ClipboardCheck,
  },
  {
    title: 'Response Coordination',
    description:
      'Support supervisors in assigning actions, following progress, and coordinating field response across barangays.',
    icon: ShieldCheck,
  },
  {
    title: 'Reports & Analytics',
    description:
      'Prepare monitoring summaries and reports for barangay or city-wide review while keeping technical tools inside authorized access.',
    icon: FileText,
  },
]

const dataSources = [
  { label: 'Dengue case records', icon: Activity },
  { label: 'Weather information', icon: BarChart3 },
  { label: 'Population data', icon: UsersRound },
  { label: 'Barangay boundaries', icon: MapPinned },
]

const userRoles = [
  {
    label: 'City Health Office',
    description: 'City-wide monitoring, data management, forecasting, mapping, and reporting.',
    icon: Building2,
  },
  {
    label: 'Supervisors',
    description: 'Priority review, response coordination, field action oversight, and reporting.',
    icon: ShieldCheck,
  },
  {
    label: 'Barangay Health Workers',
    description: 'Barangay monitoring, assigned response actions, local trends, and field updates.',
    icon: UsersRound,
  },
]

function scrollToSection(id, closeMenu) {
  const section = document.getElementById(id)

  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  closeMenu?.()
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [contactStatus, setContactStatus] = useState(null)
  const [contactSubmitting, setContactSubmitting] = useState(false)
  const [historicalDengueRange, setHistoricalDengueRange] = useState('2018–2025')

  useEffect(() => {
    document.title = 'Dengue Surveillance & Decision Support System'

    // The public landing page always uses the institutional light presentation.
    // It does not change the saved appearance preference used inside the system.
    const root = document.documentElement
    root.classList.remove('dark')
    root.classList.remove('dengue-government')

    let cancelled = false

    const refreshPublicSummary = async () => {
      try {
        const summary = await getPublicSystemSummary()
        const rangeLabel = summary?.historical_dengue?.range_label

        if (!cancelled && rangeLabel) {
          setHistoricalDengueRange(rangeLabel)
        }
      } catch (error) {
        // Keep the current known coverage as a graceful fallback if the API is
        // temporarily unavailable. A successful request always replaces it
        // with the latest completed integration range.
        console.warn('Unable to refresh public dengue coverage:', error)
      }
    }

    refreshPublicSummary()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshPublicSummary()
    }

    window.addEventListener('focus', refreshPublicSummary)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.removeEventListener('focus', refreshPublicSummary)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const publicStats = [
    { value: '86', label: 'Barangays monitored' },
    { value: historicalDengueRange, label: 'Historical dengue records' },
    { value: 'Barangay-level', label: 'Risk monitoring' },
    { value: 'Multi-source', label: 'Decision support' },
  ]

  const closeMobileMenu = () => setMobileMenuOpen(false)

  const handleContactSubmit = async (event) => {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)

    setContactStatus(null)
    setContactSubmitting(true)

    try {
      const response = await fetch('https://formspree.io/f/xppzlbjd', {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
      })

      let result = null
      try {
        result = await response.json()
      } catch {
        // Formspree normally returns JSON for AJAX submissions. If parsing fails,
        // the HTTP status still determines whether the submission succeeded.
      }

      if (!response.ok) {
        const formspreeMessage = result?.errors
          ?.map((error) => error?.message)
          .filter(Boolean)
          .join(' ')

        throw new Error(formspreeMessage || 'The inquiry could not be submitted. Please try again.')
      }

      form.reset()
      setContactStatus({
        type: 'success',
        message: 'Your inquiry was submitted successfully. Thank you for contacting the research team.',
      })
    } catch (error) {
      setContactStatus({
        type: 'error',
        message:
          error?.message ||
          'We could not send your inquiry right now. Please check your connection and try again.',
      })
    } finally {
      setContactSubmitting(false)
    }
  }

  return (
    <div className="gov-landing">
      <a className="gov-skip-link" href="#main-content">
        Skip to main content
      </a>

      <div className="gov-utility-bar">
        <div className="gov-landing-container gov-utility-inner">
          <p>
            <span className="gov-utility-dot" aria-hidden="true" />
            Academic Research Prototype • Caraga State University
          </p>
          <p className="gov-utility-location">Butuan City, Philippines</p>
        </div>
      </div>

      <header className="gov-site-header">
        <div className="gov-landing-container gov-header-inner">
          <button
            type="button"
            className="gov-brand"
            onClick={() => scrollToSection('home', closeMobileMenu)}
            aria-label="Go to landing page home"
          >
            <span className="gov-brand-mark" aria-hidden="true">
              <Activity />
            </span>
            <span className="gov-brand-copy">
              <strong>Dengue Surveillance & Decision Support</strong>
              <small>Barangay-Level Public Health Monitoring System</small>
            </span>
          </button>

          <nav className="gov-desktop-nav" aria-label="Public website navigation">
            <button type="button" onClick={() => scrollToSection('home')}>Home</button>
            <button type="button" onClick={() => scrollToSection('about')}>About</button>
            <button type="button" onClick={() => scrollToSection('capabilities')}>Capabilities</button>
            <button type="button" onClick={() => scrollToSection('dengue-information')}>Dengue Information</button>
            <button type="button" onClick={() => scrollToSection('research')}>Research</button>
            <button type="button" onClick={() => scrollToSection('contact')}>Contact</button>
          </nav>

          <div className="gov-header-actions">
            <Link className="gov-login-button gov-login-button--header" to="/login">
              Staff Login
              <ArrowRight aria-hidden="true" />
            </Link>

            <button
              type="button"
              className="gov-menu-button"
              onClick={() => setMobileMenuOpen((current) => !current)}
              aria-expanded={mobileMenuOpen}
              aria-controls="gov-mobile-nav"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav id="gov-mobile-nav" className="gov-mobile-nav" aria-label="Mobile public website navigation">
            <div className="gov-landing-container gov-mobile-nav-inner">
              <button type="button" onClick={() => scrollToSection('home', closeMobileMenu)}>Home</button>
              <button type="button" onClick={() => scrollToSection('about', closeMobileMenu)}>About</button>
              <button type="button" onClick={() => scrollToSection('capabilities', closeMobileMenu)}>Capabilities</button>
              <button type="button" onClick={() => scrollToSection('dengue-information', closeMobileMenu)}>Dengue Information</button>
              <button type="button" onClick={() => scrollToSection('research', closeMobileMenu)}>Research</button>
              <button type="button" onClick={() => scrollToSection('contact', closeMobileMenu)}>Contact</button>
              <Link className="gov-mobile-login" to="/login" onClick={closeMobileMenu}>
                Authorized Personnel Login
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="main-content">
        <section
          id="home"
          className="gov-hero gov-anchor-section"
          style={{ backgroundImage: `url(${dengueBackground})` }}
        >
          <div className="gov-hero-overlay" />
          <div className="gov-landing-container gov-hero-content">
            <div className="gov-hero-copy">
              <div className="gov-status-label">
                <ShieldCheck aria-hidden="true" />
                Public Health Decision Support
              </div>

              <h1>Dengue surveillance and response support for Butuan City</h1>
              <p className="gov-hero-lead">
                A barangay-level predictive analytics and geospatial platform designed to help local health teams monitor dengue activity, identify priority areas, coordinate field response, and make evidence-informed decisions.
              </p>

              <div className="gov-hero-actions">
                <button
                  type="button"
                  className="gov-primary-button"
                  onClick={() => scrollToSection('capabilities')}
                >
                  Explore the System
                  <ArrowRight aria-hidden="true" />
                </button>
                <Link className="gov-secondary-button" to="/login">
                  Authorized Personnel Login
                </Link>
              </div>

              <div className="gov-hero-notice">
                <CheckCircle2 aria-hidden="true" />
                <span>
                  Research prototype for academic evaluation and local public-health decision support. Internal operational tools remain protected by staff authentication.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="gov-stat-strip" aria-label="System monitoring coverage">
          <div className="gov-landing-container gov-stat-grid">
            {publicStats.map((stat) => (
              <div className="gov-stat-item" key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="about" className="gov-section gov-anchor-section">
          <div className="gov-landing-container">
            <div className="gov-section-heading gov-section-heading--wide">
              <span className="gov-eyebrow">ABOUT THE PLATFORM</span>
              <h2>Built to turn dengue information into clearer local action</h2>
              <p>
                The platform brings together surveillance, forecasting, geospatial analysis, and response coordination in one system. Public visitors receive a clear overview, while detailed operational information remains inside the secure workspace for authorized health personnel.
              </p>
            </div>

            <div className="gov-three-step-grid">
              <article className="gov-step-card">
                <span className="gov-step-number">01</span>
                <div className="gov-step-icon"><Activity aria-hidden="true" /></div>
                <h3>Monitor</h3>
                <p>Follow reported cases, historical trends, barangay conditions, and changing risk patterns.</p>
              </article>
              <article className="gov-step-card">
                <span className="gov-step-number">02</span>
                <div className="gov-step-icon"><BarChart3 aria-hidden="true" /></div>
                <h3>Predict</h3>
                <p>Use integrated dengue, weather, population, and spatial information to support forward-looking risk assessment.</p>
              </article>
              <article className="gov-step-card">
                <span className="gov-step-number">03</span>
                <div className="gov-step-icon"><ShieldCheck aria-hidden="true" /></div>
                <h3>Respond</h3>
                <p>Prioritize barangays, coordinate assigned actions, and connect city-level oversight with field reporting.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="capabilities" className="gov-section gov-section--muted gov-anchor-section">
          <div className="gov-landing-container">
            <div className="gov-section-heading">
              <span className="gov-eyebrow">SYSTEM CAPABILITIES</span>
              <h2>One platform for monitoring, analysis, mapping, and response</h2>
              <p>
                The public page introduces the system at a high level. Detailed forecasts, response records, model information, uploads, and operational reports are available only after authorized sign-in.
              </p>
            </div>

            <div className="gov-capability-grid">
              {capabilities.map((item) => {
                const Icon = item.icon
                return (
                  <article className="gov-capability-card" key={item.title}>
                    <div className="gov-capability-icon"><Icon aria-hidden="true" /></div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="gov-section">
          <div className="gov-landing-container gov-data-layout">
            <div className="gov-data-copy">
              <span className="gov-eyebrow">MULTI-SOURCE ANALYTICS</span>
              <h2>Different data sources, one decision-support workflow</h2>
              <p>
                The system integrates health surveillance and contextual information before transforming it into barangay-level monitoring, forecasting, risk interpretation, mapping, and response support.
              </p>

              <div className="gov-source-list">
                {dataSources.map((source) => {
                  const Icon = source.icon
                  return (
                    <div className="gov-source-item" key={source.label}>
                      <span><Icon aria-hidden="true" /></span>
                      {source.label}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="gov-process-card" aria-label="System data process">
              <div className="gov-process-row">
                <div className="gov-process-box">
                  <Database aria-hidden="true" />
                  <span>Validated Data</span>
                </div>
                <ArrowRight className="gov-process-arrow" aria-hidden="true" />
                <div className="gov-process-box">
                  <BarChart3 aria-hidden="true" />
                  <span>Predictive Analytics</span>
                </div>
              </div>
              <div className="gov-process-line" aria-hidden="true" />
              <div className="gov-process-row">
                <div className="gov-process-box">
                  <MapPinned aria-hidden="true" />
                  <span>Barangay Risk View</span>
                </div>
                <ArrowRight className="gov-process-arrow" aria-hidden="true" />
                <div className="gov-process-box">
                  <ClipboardCheck aria-hidden="true" />
                  <span>Response Support</span>
                </div>
              </div>
              <p>
                Operational results are intended to support professional judgment and local public-health planning, not replace it.
              </p>
            </div>
          </div>
        </section>

        <section className="gov-section gov-section--navy">
          <div className="gov-landing-container">
            <div className="gov-section-heading gov-section-heading--light">
              <span className="gov-eyebrow">DESIGNED FOR LOCAL HEALTH RESPONSE</span>
              <h2>Clear responsibilities across the response workflow</h2>
              <p>
                Each authorized role receives the information and actions relevant to its responsibilities while preserving a consistent city-wide view of dengue response.
              </p>
            </div>

            <div className="gov-role-grid">
              {userRoles.map((role) => {
                const Icon = role.icon
                return (
                  <article className="gov-role-card" key={role.label}>
                    <div className="gov-role-icon"><Icon aria-hidden="true" /></div>
                    <h3>{role.label}</h3>
                    <p>{role.description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section id="dengue-information" className="gov-section gov-anchor-section">
          <div className="gov-landing-container">
            <div className="gov-section-heading">
              <span className="gov-eyebrow">DENGUE INFORMATION</span>
              <h2>Public information should remain simple, practical, and action-oriented</h2>
              <p>
                The system is designed primarily for surveillance and response coordination. Public-facing guidance focuses on practical community awareness while clinical assessment and treatment remain the responsibility of qualified health professionals.
              </p>
            </div>

            <div className="gov-info-grid">
              <article className="gov-info-card">
                <span className="gov-info-label">PREVENT</span>
                <h3>Reduce mosquito breeding sites</h3>
                <p>Regularly remove or cover standing-water containers and keep surroundings clean to reduce places where mosquitoes can breed.</p>
              </article>
              <article className="gov-info-card">
                <span className="gov-info-label">PROTECT</span>
                <h3>Use personal protection</h3>
                <p>Follow local health guidance on protective clothing, mosquito repellents, screens, and other appropriate community prevention measures.</p>
              </article>
              <article className="gov-info-card">
                <span className="gov-info-label">REPORT</span>
                <h3>Coordinate with local health workers</h3>
                <p>Report community dengue concerns through the appropriate barangay or city health channels so local teams can assess and respond.</p>
              </article>
            </div>

            <div className="gov-health-notice">
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>Health information notice</strong>
                <p>This website provides general public-health information only. For symptoms, diagnosis, treatment, or urgent medical concerns, consult a qualified health professional or the appropriate local health facility.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="research" className="gov-section gov-section--muted gov-anchor-section">
          <div className="gov-landing-container gov-research-layout">
            <div>
              <span className="gov-eyebrow">RESEARCH & TRANSPARENCY</span>
              <h2>An academic system designed around a real local public-health use case</h2>
              <p>
                This platform was developed as an undergraduate research project under the College of Computing and Information Sciences, Caraga State University. It explores how predictive analytics, geospatial information, and coordinated field workflows can support barangay-level dengue response in Butuan City.
              </p>
              <p>
                The public landing page intentionally identifies the platform as a research prototype. It does not present itself as an official City Government of Butuan website or replace existing government health systems and official public-health advisories.
              </p>
            </div>

            <aside className="gov-research-card">
              <div className="gov-research-card-icon"><Upload aria-hidden="true" /></div>
              <span>RESEARCH PLATFORM</span>
              <h3>A Multi-Source Predictive Analytics and Geospatial Command-and-Decision Support System for Barangay-Level Dengue Outbreak Response</h3>
              <dl>
                <div>
                  <dt>Institution</dt>
                  <dd>Caraga State University</dd>
                </div>
                <div>
                  <dt>College</dt>
                  <dd>College of Computing and Information Sciences</dd>
                </div>
                <div>
                  <dt>Study Area</dt>
                  <dd>Butuan City, Philippines</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        <section id="contact" className="gov-section gov-anchor-section gov-contact-section">
          <div className="gov-landing-container">
            <div className="gov-section-heading gov-section-heading--wide gov-contact-heading">
              <span className="gov-eyebrow">CONTACT & PROJECT INFORMATION</span>
              <h2>For research demonstrations, evaluation, and project coordination</h2>
              <p>
                The platform is maintained as an academic research project. Formal project inquiries, stakeholder demonstrations, and evaluation coordination may be directed through the research team and the College of Computing and Information Sciences, Caraga State University.
              </p>
            </div>

            <div className="gov-contact-layout">
              <div className="gov-contact-details">
                <aside className="gov-contact-card gov-contact-card--institution">
                  <div className="gov-contact-icon-badge" aria-hidden="true">
                    <Building2 />
                  </div>
                  <div>
                    <span className="gov-contact-kicker">ACADEMIC INSTITUTION</span>
                    <strong>Caraga State University</strong>
                    <p>College of Computing and Information Sciences</p>
                    <div className="gov-contact-meta">Butuan City, Philippines</div>
                  </div>
                </aside>

                <aside className="gov-contact-card gov-contact-card--inquiries">
                  <div className="gov-contact-icon-badge" aria-hidden="true">
                    <Mail />
                  </div>
                  <div>
                    <span className="gov-contact-kicker">PROJECT INQUIRIES</span>
                    <strong>Use the official inquiry form</strong>
                    <p>
                      Appropriate for research demonstrations, stakeholder feedback, evaluation coordination, and questions about the academic prototype.
                    </p>
                  </div>
                </aside>

                <aside className="gov-contact-process-card">
                  <div className="gov-contact-process-heading">
                    <div className="gov-contact-icon-badge gov-contact-icon-badge--soft" aria-hidden="true">
                      <ClipboardCheck />
                    </div>
                    <div>
                      <span className="gov-contact-kicker">WHAT HAPPENS NEXT</span>
                      <strong>Simple inquiry process</strong>
                    </div>
                  </div>

                  <ol className="gov-contact-process-list">
                    <li>
                      <span>1</span>
                      <p>Your message is securely submitted through the project contact service.</p>
                    </li>
                    <li>
                      <span>2</span>
                      <p>The research team reviews the inquiry and its stated purpose.</p>
                    </li>
                    <li>
                      <span>3</span>
                      <p>A response may be sent to the email address you provide in the form.</p>
                    </li>
                  </ol>
                </aside>
              </div>

              <form className="gov-contact-form" onSubmit={handleContactSubmit}>
                <div className="gov-contact-form-header">
                  <div className="gov-contact-form-topline">
                    <span className="gov-contact-channel">
                      <ShieldCheck aria-hidden="true" />
                      OFFICIAL PROJECT INQUIRY CHANNEL
                    </span>
                    <span className="gov-contact-service-chip">
                      <span aria-hidden="true" />
                      Email response enabled
                    </span>
                  </div>

                  <div className="gov-contact-form-heading">
                    <h3>Send a project inquiry</h3>
                    <p>
                      Provide your contact details and the purpose of your message. Required fields are marked with an asterisk.
                    </p>
                  </div>
                </div>

                <div className="gov-contact-form-body">
                  <section className="gov-form-section" aria-labelledby="contact-details-title">
                    <div className="gov-form-section-heading">
                      <span className="gov-form-section-number">01</span>
                      <div>
                        <h4 id="contact-details-title">Contact details</h4>
                        <p>Tell the research team who is sending the inquiry.</p>
                      </div>
                    </div>

                    <div className="gov-form-grid">
                      <label className="gov-form-field">
                        <span>Full name <em aria-hidden="true">*</em></span>
                        <input type="text" name="name" autoComplete="name" placeholder="Enter your full name" required />
                      </label>

                      <label className="gov-form-field">
                        <span>Email address <em aria-hidden="true">*</em></span>
                        <input type="email" name="email" autoComplete="email" placeholder="Enter your email address" required />
                      </label>

                      <label className="gov-form-field gov-form-field--full">
                        <span>
                          Organization / office
                          <small>Optional</small>
                        </span>
                        <input type="text" name="organization" autoComplete="organization" placeholder="e.g. Barangay Health Center, City Health Office, University" />
                      </label>
                    </div>
                  </section>

                  <section className="gov-form-section gov-form-section--inquiry" aria-labelledby="inquiry-details-title">
                    <div className="gov-form-section-heading">
                      <span className="gov-form-section-number">02</span>
                      <div>
                        <h4 id="inquiry-details-title">Inquiry details</h4>
                        <p>Choose the purpose of your inquiry and provide enough context for a useful response.</p>
                      </div>
                    </div>

                    <div className="gov-form-grid gov-form-grid--inquiry">
                      <label className="gov-form-field gov-form-field--full">
                        <span>Inquiry type <em aria-hidden="true">*</em></span>
                        <select name="inquiryType" defaultValue="" required>
                          <option value="" disabled>Select an inquiry type</option>
                          <option value="demonstration">System demonstration</option>
                          <option value="evaluation">Evaluation / feedback</option>
                          <option value="research">Research coordination</option>
                          <option value="technical">Technical question</option>
                          <option value="other">Other inquiry</option>
                        </select>
                      </label>

                      <label className="gov-form-field gov-form-field--full">
                        <span>Message <em aria-hidden="true">*</em></span>
                        <textarea name="message" rows="7" placeholder="Describe your inquiry, feedback, or coordination request" required />
                      </label>
                    </div>
                  </section>

                  <div className="gov-contact-form-footer">
                    <div className="gov-form-privacy">
                      <ShieldCheck aria-hidden="true" />
                      <p>
                        <strong>Protect sensitive information.</strong>
                        Do not include confidential patient records or personally identifiable health information.
                      </p>
                    </div>

                    <button
                      type="submit"
                      className="gov-primary-button gov-contact-submit"
                      disabled={contactSubmitting}
                      aria-busy={contactSubmitting}
                    >
                      {contactSubmitting ? 'Sending Inquiry…' : 'Submit Inquiry'}
                      <Send aria-hidden="true" />
                    </button>
                  </div>

                  {contactStatus && (
                    <div
                      className={`gov-form-status gov-form-status--${contactStatus.type}`}
                      role={contactStatus.type === 'error' ? 'alert' : 'status'}
                      aria-live="polite"
                    >
                      {contactStatus.type === 'error' ? (
                        <AlertCircle aria-hidden="true" />
                      ) : (
                        <CheckCircle2 aria-hidden="true" />
                      )}
                      <span>{contactStatus.message}</span>
                    </div>
                  )}
                </div>
              </form>
            </div>
          </div>
        </section>

        <section className="gov-access-section">
          <div className="gov-landing-container gov-access-inner">
            <div>
              <span className="gov-eyebrow">AUTHORIZED ACCESS</span>
              <h2>Health personnel can continue to the secure system workspace.</h2>
              <p>Sign in using a registered CHO, Supervisor, or Barangay Health Worker account.</p>
            </div>
            <Link className="gov-login-button gov-login-button--large" to="/login">
              Continue to Staff Login
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="gov-footer">
        <div className="gov-landing-container gov-footer-main">
          <div className="gov-footer-brand">
            <span className="gov-brand-mark gov-brand-mark--footer" aria-hidden="true"><Activity /></span>
            <div>
              <strong>Dengue Surveillance & Decision Support System</strong>
              <p>College of Computing and Information Sciences • Caraga State University</p>
            </div>
          </div>

          <div className="gov-footer-researchers" aria-label="Researchers contact information">
            <span className="gov-footer-heading">Researchers</span>

            <div className="gov-footer-researcher-list">
              <article className="gov-footer-researcher">
                <img
                  className="gov-footer-researcher-photo"
                  src={reoImage}
                  alt="Reo John H. Andohuyan"
                  loading="lazy"
                />
                <div className="gov-footer-researcher-content">
                  <strong>Reo John H. Andohuyan</strong>
                  <span className="gov-footer-researcher-role">Researcher • CCIS</span>
                  <a href="mailto:randohuyan@gmail.com">
                    <Mail aria-hidden="true" />
                    <span>randohuyan@gmail.com</span>
                  </a>
                  <a href="tel:+639151224300">
                    <Phone aria-hidden="true" />
                    <span>0915-122-4300</span>
                  </a>
                </div>
              </article>

              <article className="gov-footer-researcher">
                <img
                  className="gov-footer-researcher-photo"
                  src={tyronImage}
                  alt="Tyron Reid S. Brasileno"
                  loading="lazy"
                />
                <div className="gov-footer-researcher-content">
                  <strong>Tyron Reid S. Brasileno</strong>
                  <span className="gov-footer-researcher-role">Researcher • CCIS</span>
                  <a href="mailto:aquaduskplant@gmail.com">
                    <Mail aria-hidden="true" />
                    <span>aquaduskplant@gmail.com</span>
                  </a>
                  <a href="tel:+639452800681">
                    <Phone aria-hidden="true" />
                    <span>0945-280-0681</span>
                  </a>
                </div>
              </article>
            </div>
          </div>

          <div className="gov-footer-links">
            <span className="gov-footer-heading">Quick Links</span>
            <div className="gov-footer-link-list">
              <button type="button" onClick={() => scrollToSection('about')}>About</button>
              <button type="button" onClick={() => scrollToSection('dengue-information')}>Dengue Information</button>
              <button type="button" onClick={() => scrollToSection('research')}>Research</button>
              <button type="button" onClick={() => scrollToSection('contact')}>Contact</button>
              <Link to="/login">Staff Login</Link>
            </div>
          </div>
        </div>

        <div className="gov-footer-bottom">
          <div className="gov-landing-container">
            <p>Academic research prototype. Not an official City Government of Butuan web service.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
