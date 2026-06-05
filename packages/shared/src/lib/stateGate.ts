// State availability gate for Document Automation.
//
// Document generation is Ohio-first. A handful of states are explicitly paused
// for compliance reasons (the same set FindStoop pauses for new signups), and
// everything else is "coming soon" rather than an error. This gate is checked
// before any template is loaded and again in the builder's type step.

const RESTRICTED_STATES = ['NY', 'CA', 'WA', 'MA', 'IL']
const SUPPORTED_STATES = ['OH']

export interface StateSupport {
  supported: boolean
  restricted: boolean
  message: string
}

export function checkStateSupport(state: string | null | undefined): StateSupport {
  const code = (state ?? '').trim().toUpperCase()

  if (RESTRICTED_STATES.includes(code)) {
    return {
      supported: false,
      restricted: true,
      message: `Document generation isn't available for ${code} properties yet. We're still finishing the state-specific compliance work, and we'll let you know the moment it's ready.`,
    }
  }

  if (!SUPPORTED_STATES.includes(code)) {
    const label = code || 'this state'
    return {
      supported: false,
      restricted: false,
      message: `Document templates for ${label} are coming soon. For now you can download a blank letter and fill it in yourself.`,
    }
  }

  return { supported: true, restricted: false, message: '' }
}

export { RESTRICTED_STATES, SUPPORTED_STATES }
